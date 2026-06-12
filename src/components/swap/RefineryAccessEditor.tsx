import { useEffect, useState } from "react";
import { Building2, ChevronDown, ChevronUp, Save, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  listRefineries,
  getUserRefineryAssignment,
  assignUserToRefinery,
  unassignUserFromRefinery,
} from "@/lib/refineries.functions";

type Role = "manager" | "staff" | "viewer";
type Refinery = { id: string; name: string; status?: string | null };

export function RefineryAccessEditor({
  userId,
  username,
  isAdmin,
}: {
  userId: string;
  username: string;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [role, setRole] = useState<Role>("staff");

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    Promise.all([listRefineries(), getUserRefineryAssignment({ data: { user_id: userId } })])
      .then(([refs, asg]) => {
        setRefineries(refs as Refinery[]);
        setSelected(asg.refineryId);
        setRole((asg.role as Role) ?? "staff");
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load refinery access"))
      .finally(() => setLoading(false));
  }, [open, userId]);

  async function save() {
    setSaving(true);
    try {
      if (selected) {
        await assignUserToRefinery({ data: { user_id: userId, refinery_id: selected, role } });
      } else {
        await unassignUserFromRefinery({ data: { user_id: userId } });
      }
      toast.success(`Refinery access updated for ${username}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save refinery access");
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
          <Building2 className="h-3 w-3" />
          Refinery Access
        </span>
        {open ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {open && (
        <div className="space-y-2">
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading…</p>
          ) : (
            <>
              <label
                className={`flex items-center gap-2 rounded-md border px-2 py-1.5 ${
                  isAdmin
                    ? "border-emerald-500/40 bg-emerald-500/10"
                    : "border-border/60 bg-muted/20 opacity-70"
                }`}
                title={isAdmin ? "" : "Set role to Administrator to grant access to all refineries"}
              >
                <input
                  type="checkbox"
                  checked={isAdmin}
                  disabled
                  className="h-3.5 w-3.5 accent-emerald-500"
                />
                <span className="text-[11px] font-medium inline-flex items-center gap-1">
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  All Refineries (Admin Only)
                </span>
              </label>

              {!isAdmin && (
                <>
                  <div className="rounded-md border border-border/60 divide-y divide-border/40 max-h-56 overflow-y-auto">
                    {refineries.length === 0 ? (
                      <p className="text-[11px] text-muted-foreground p-2">No refineries configured.</p>
                    ) : (
                      refineries.map((r) => (
                        <label
                          key={r.id}
                          className="flex items-center gap-2 px-2 py-1.5 text-[11px] cursor-pointer hover:bg-muted/40"
                        >
                          <input
                            type="checkbox"
                            checked={selected === r.id}
                            onChange={() => setSelected(selected === r.id ? null : r.id)}
                            className="h-3.5 w-3.5 accent-primary"
                          />
                          <span className="font-medium">{r.name}</span>
                        </label>
                      ))
                    )}
                  </div>

                  {selected && (
                    <div>
                      <label className="text-[10px] text-muted-foreground block mb-1">
                        Role in this refinery
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(["viewer", "staff", "manager"] as Role[]).map((r) => (
                          <button
                            key={r}
                            type="button"
                            onClick={() => setRole(r)}
                            className={`rounded-md border px-2 py-1 text-[10px] capitalize ${
                              role === r
                                ? "border-primary bg-primary/10"
                                : "border-border/60 hover:border-border"
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  <p className="text-[10px] text-muted-foreground">
                    A user can be assigned to only one refinery. Login redirects them straight to that refinery; backend queries
                    block all data from other refineries.
                  </p>
                </>
              )}

              {!isAdmin && (
                <div className="flex justify-end">
                  <Button size="sm" className="h-7 text-xs" onClick={save} disabled={saving}>
                    <Save className="h-3 w-3 mr-1" />
                    {saving ? "Saving…" : "Save Refinery Access"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
