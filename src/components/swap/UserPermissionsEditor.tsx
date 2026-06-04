import { useEffect, useState } from "react";
import { Shield, ShieldCheck, Save, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ACTIONS,
  MODULES,
  MODULE_LABELS,
  emptyPerm,
  type Action,
  type AppModule,
  type ModulePerm,
  type PermissionMap,
} from "@/lib/permissions";
import {
  getUserPermissions,
  setUserPermissions,
} from "@/lib/permissions.functions";
import { invalidate, CK } from "@/lib/swap-cache";
import { useLang } from "@/lib/purity-i18n";

const ACTION_LABEL_KEYS: Record<Action, string> = {
  view: "users.permView",
  create: "users.permCreate",
  edit: "users.permEdit",
  delete: "users.permDelete",
  export: "common.share",
  share: "users.permShare",
};


type Preset = "none" | "purity_only" | "swap_full" | "reports_viewer" | "admin";

function applyPreset(preset: Preset): { isAdmin: boolean; perms: PermissionMap } {
  const base: PermissionMap = {};
  if (preset === "admin") return { isAdmin: true, perms: base };
  if (preset === "purity_only") {
    base.purity = { can_view: true, can_create: true, can_edit: true, can_delete: false, can_export: true, can_share: true };
  } else if (preset === "swap_full") {
    for (const m of ["swap", "margin", "premium", "reports"] as AppModule[]) {
      base[m] = { can_view: true, can_create: true, can_edit: true, can_delete: false, can_export: true, can_share: true };
    }
  } else if (preset === "reports_viewer") {
    base.reports = { can_view: true, can_create: false, can_edit: false, can_delete: false, can_export: true, can_share: false };
  }
  return { isAdmin: false, perms: base };
}

export function UserPermissionsEditor({
  userId,
  username,
  onChanged,
}: {
  userId: string;
  username: string;
  onChanged?: () => void;
}) {
  const { t: tt } = useLang();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [perms, setPerms] = useState<PermissionMap>({});


  useEffect(() => {
    if (!open) return;
    setLoading(true);
    getUserPermissions({ data: { userId } })
      .then((r) => {
        setIsAdmin(r.isAdmin);
        setPerms(r.permissions);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load permissions"))
      .finally(() => setLoading(false));
  }, [open, userId]);

  function toggle(module: AppModule, action: Action) {
    setPerms((prev) => {
      const cur: ModulePerm = prev[module] ?? emptyPerm();
      const key = `can_${action}` as keyof ModulePerm;
      const next: ModulePerm = { ...cur, [key]: !cur[key] };
      return { ...prev, [module]: next };
    });
  }

  function toggleModuleAll(module: AppModule, on: boolean) {
    setPerms((prev) => {
      const next: ModulePerm = on
        ? { can_view: true, can_create: true, can_edit: true, can_delete: false, can_export: true, can_share: true }
        : emptyPerm();
      return { ...prev, [module]: next };
    });
  }

  function applyPresetTo(p: Preset) {
    const { isAdmin: a, perms: pm } = applyPreset(p);
    setIsAdmin(a);
    setPerms(pm);
  }

  async function save() {
    setSaving(true);
    try {
      const list = (Object.keys(perms) as AppModule[])
        .filter((m) => {
          const r = perms[m]!;
          return r.can_view || r.can_create || r.can_edit || r.can_delete || r.can_export || r.can_share;
        })
        .map((m) => ({ module: m, ...perms[m]! }));
      await setUserPermissions({ data: { userId, isAdmin, permissions: list } });
      toast.success(`Permissions saved for ${username}`);
      invalidate(CK.users, CK.myPerms);
      onChanged?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save permissions");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border-t border-border/40 pt-2 mt-2 space-y-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between text-[11px] font-medium text-muted-foreground hover:text-foreground"
      >
        <span className="inline-flex items-center gap-1.5">
          <Shield className="h-3 w-3" />
          Module Permissions
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <PresetBtn label="Purity only" onClick={() => applyPresetTo("purity_only")} />
                <PresetBtn label="Swap full" onClick={() => applyPresetTo("swap_full")} />
                <PresetBtn label="Reports viewer" onClick={() => applyPresetTo("reports_viewer")} />
                <PresetBtn label="Administrator" onClick={() => applyPresetTo("admin")} />
                <PresetBtn label="Clear" onClick={() => applyPresetTo("none")} />
              </div>

              <label className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAdmin}
                  onChange={(e) => setIsAdmin(e.target.checked)}
                  className="h-3.5 w-3.5 accent-primary"
                />
                <span className="text-[11px] font-medium inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  Full Administrator (all modules, all actions)
                </span>
              </label>

              {!isAdmin && (
                <div className="rounded-md border border-border/60 overflow-x-auto">
                  <table className="w-full text-[10px]">
                    <thead className="bg-muted/40">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Module</th>
                        {ACTIONS.map((a) => (
                          <th key={a} className="px-1 py-1.5 font-medium text-center">
                            {ACTION_LABELS[a]}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {MODULES.map((m) => {
                        const row = perms[m] ?? emptyPerm();
                        const allOn = ACTIONS.every((a) => row[`can_${a}` as keyof ModulePerm]);
                        return (
                          <tr key={m} className="border-t border-border/40">
                            <td className="px-2 py-1.5">
                              <button
                                type="button"
                                onClick={() => toggleModuleAll(m, !allOn)}
                                className="text-left hover:text-primary"
                                title={allOn ? "Turn all off" : "Turn all on"}
                              >
                                {MODULE_LABELS[m]}
                              </button>
                            </td>
                            {ACTIONS.map((a) => {
                              const key = `can_${a}` as keyof ModulePerm;
                              return (
                                <td key={a} className="px-1 py-1 text-center">
                                  <input
                                    type="checkbox"
                                    checked={Boolean(row[key])}
                                    onChange={() => toggle(m, a)}
                                    className="h-3.5 w-3.5 accent-primary"
                                  />
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              <div className="flex justify-end">
                <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
                  <Save className="h-3 w-3 mr-1" />
                  {saving ? "Saving…" : "Save Permissions"}
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function PresetBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="px-2 py-0.5 rounded-md border border-border/60 bg-muted/30 text-[10px] hover:border-primary hover:bg-primary/10"
    >
      {label}
    </button>
  );
}
