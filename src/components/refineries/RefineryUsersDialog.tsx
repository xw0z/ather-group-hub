import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus, KeyRound, Trash2, ShieldCheck, UserCog, UserX, Users as UsersIcon,
  Mail, Phone, Clock, X, ArrowLeft, Loader2,
} from "lucide-react";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  listAssignedRefineryUsers,
  listAssignableUsers,
  createRefineryUser,
  updateRefineryUserAccess,
  removeRefineryUserAccess,
  resetRefineryUserPassword,
  assignExistingUserToRefinery,
  type AssignedRefineryUser,
  type Refinery,
} from "@/lib/refineries.functions";

type Role = "manager" | "staff" | "viewer";
type Mode = "list" | "create" | "assign";

function fmtWhen(iso: string | null): string {
  if (!iso) return "Never";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
}

export function RefineryUsersDialog({
  refinery,
  isAdmin,
  onClose,
}: {
  refinery: Refinery;
  isAdmin: boolean;
  onClose: () => void;
}) {
  const isMobile = useIsMobile();
  const [users, setUsers] = useState<AssignedRefineryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("list");
  const [pwUser, setPwUser] = useState<AssignedRefineryUser | null>(null);
  const [removeUser, setRemoveUser] = useState<AssignedRefineryUser | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const list = await listAssignedRefineryUsers({ data: { refineryId: refinery.id } });
      setUsers(list);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load users");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, [refinery.id]);

  const title =
    mode === "create"
      ? `Create User — Refinery ${refinery.code}`
      : mode === "assign"
      ? `Assign Existing — Refinery ${refinery.code}`
      : `Refinery ${refinery.code} — Users`;

  return (
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side={isMobile ? "bottom" : "right"}
        className={
          isMobile
            ? "h-[100dvh] w-full max-w-full p-0 sm:max-w-full flex flex-col gap-0 rounded-none border-0"
            : "w-full sm:max-w-xl p-0 flex flex-col gap-0"
        }
      >
        {/* Sticky header */}
        <SheetHeader className="sticky top-0 z-10 bg-background border-b px-4 py-3 space-y-1 text-left">
          <div className="flex items-center gap-2">
            {mode !== "list" ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-10 w-10 -ml-2 shrink-0"
                onClick={() => setMode("list")}
                aria-label="Back"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
            ) : (
              <UsersIcon className="h-5 w-5 shrink-0 text-muted-foreground" />
            )}
            <SheetTitle className="text-base truncate flex-1">{title}</SheetTitle>
            <Button
              variant="ghost"
              size="icon"
              className="h-10 w-10 -mr-2 shrink-0"
              onClick={onClose}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
          <SheetDescription className="text-xs">
            {mode === "list"
              ? `${refinery.name} · Users here can access ONLY this refinery.`
              : mode === "create"
              ? `New user gets access only to Refinery ${refinery.code}.`
              : `Each user can be assigned to only one refinery.`}
          </SheetDescription>
        </SheetHeader>

        {/* Scrollable body */}
        <div
          className="flex-1 overflow-y-auto overscroll-contain px-4 py-3"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          {mode === "list" && (
            loading ? (
              <p className="text-sm text-muted-foreground py-6 text-center">Loading…</p>
            ) : users.length === 0 ? (
              <div className="border border-dashed rounded-lg p-6 text-center">
                <p className="text-sm text-foreground">No users assigned yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Add or create a user to grant access to Refinery {refinery.code}.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-border/60 border rounded-lg">
                {users.map((u) => (
                  <UserRow
                    key={u.user_id}
                    user={u}
                    isAdmin={isAdmin}
                    onChangeRole={async (role) => {
                      try {
                        await updateRefineryUserAccess({ data: { refinery_id: refinery.id, user_id: u.user_id, role } });
                        toast.success("Role updated");
                        void reload();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    }}
                    onToggleStatus={async () => {
                      const next = u.status === "active" ? "inactive" : "active";
                      try {
                        await updateRefineryUserAccess({ data: { refinery_id: refinery.id, user_id: u.user_id, status: next } });
                        toast.success(next === "active" ? "User reactivated" : "User deactivated");
                        void reload();
                      } catch (e) {
                        toast.error(e instanceof Error ? e.message : "Failed");
                      }
                    }}
                    onResetPassword={() => setPwUser(u)}
                    onRemove={() => setRemoveUser(u)}
                  />
                ))}
              </ul>
            )
          )}

          {mode === "create" && (
            <CreateUserForm
              refineryCode={refinery.code}
              onSubmit={async (payload) => {
                try {
                  await createRefineryUser({ data: { ...payload, refinery_id: refinery.id } });
                  toast.success(`User ${payload.username} created for Refinery ${refinery.code}`);
                  setMode("list");
                  void reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed to create user");
                  throw e;
                }
              }}
            />
          )}

          {mode === "assign" && (
            <AssignExistingForm
              refineryId={refinery.id}
              refineryCode={refinery.code}
              onAssigned={() => { setMode("list"); void reload(); }}
            />
          )}
        </div>

        {/* Sticky footer */}
        <div
          className="sticky bottom-0 z-10 bg-background border-t px-4 py-3 flex flex-wrap gap-2"
          style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
        >
          {mode === "list" ? (
            <>
              <Button variant="outline" className="h-11 flex-1 min-w-0" onClick={onClose}>
                Close
              </Button>
              {isAdmin && (
                <>
                  <Button
                    variant="outline"
                    className="h-11 flex-1 min-w-0"
                    onClick={() => setMode("assign")}
                  >
                    <UserCog className="h-4 w-4 mr-1" /> Assign
                  </Button>
                  <Button
                    className="h-11 flex-1 min-w-0"
                    onClick={() => setMode("create")}
                  >
                    <UserPlus className="h-4 w-4 mr-1" /> Add new
                  </Button>
                </>
              )}
            </>
          ) : (
            <FormFooterPortal mode={mode} onCancel={() => setMode("list")} />
          )}
        </div>

        {/* Password reset dialog */}
        <ResetPasswordDialog
          user={pwUser}
          onClose={() => setPwUser(null)}
          onReset={async (pw) => {
            if (!pwUser) return;
            try {
              await resetRefineryUserPassword({ data: { user_id: pwUser.user_id, password: pw } });
              toast.success(`Password reset for ${pwUser.username ?? "user"}`);
              setPwUser(null);
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            }
          }}
        />

        {/* Remove access confirm */}
        <AlertDialog open={!!removeUser} onOpenChange={(o) => !o && setRemoveUser(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove {removeUser?.username} from Refinery {refinery.code}?</AlertDialogTitle>
              <AlertDialogDescription>
                Their login is kept, but they will no longer be able to access this refinery's data.
                You can re-assign them at any time from the Users page or here.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={async () => {
                  if (!removeUser) return;
                  try {
                    await removeRefineryUserAccess({ data: { refinery_id: refinery.id, user_id: removeUser.user_id } });
                    toast.success("Access removed");
                    setRemoveUser(null);
                    void reload();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : "Failed");
                  }
                }}
              >Remove access</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

// Footer slot used while in create/assign mode — the actual submit button is
// rendered inside the form so it owns its own saving state. The footer here
// simply renders Cancel; the form injects its submit button via a shared
// container using a custom event-free approach (form id + submit button).
function FormFooterPortal({ mode, onCancel }: { mode: Mode; onCancel: () => void }) {
  return (
    <>
      <Button variant="outline" className="h-11 flex-1 min-w-0" onClick={onCancel}>
        Cancel
      </Button>
      <Button
        type="submit"
        form={mode === "create" ? "refinery-create-user-form" : "refinery-assign-user-form"}
        className="h-11 flex-[2] min-w-0"
      >
        {mode === "create" ? "Create User" : "Assign User"}
      </Button>
    </>
  );
}

function UserRow({
  user, isAdmin, onChangeRole, onToggleStatus, onResetPassword, onRemove,
}: {
  user: AssignedRefineryUser;
  isAdmin: boolean;
  onChangeRole: (role: Role) => void;
  onToggleStatus: () => void;
  onResetPassword: () => void;
  onRemove: () => void;
}) {
  const inactive = user.status !== "active";
  return (
    <li className={`p-3 sm:p-4 ${inactive ? "opacity-70" : ""}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold text-foreground truncate">
              {user.display_name || user.username || "Unnamed"}
            </span>
            {user.username && (
              <code className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                {user.username}
              </code>
            )}
            <Badge variant={inactive ? "outline" : "secondary"} className="text-[10px] uppercase">
              {user.status}
            </Badge>
          </div>
          <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-0.5 text-[11px] text-muted-foreground">
            {user.email && (
              <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{user.email}</span>
            )}
            {user.phone && (
              <span className="inline-flex items-center gap-1 truncate"><Phone className="h-3 w-3" />{user.phone}</span>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" /> Last login: {fmtWhen(user.last_login)}
            </span>
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" /> Role
            </span>
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-1.5 flex-wrap">
            <Select value={user.role} onValueChange={(v) => onChangeRole(v as Role)}>
              <SelectTrigger className="h-10 w-[120px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onResetPassword} title="Reset password" aria-label="Reset password">
              <KeyRound className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" onClick={onToggleStatus} title={inactive ? "Reactivate" : "Deactivate"} aria-label="Toggle status">
              <UserX className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10 text-destructive hover:text-destructive" onClick={onRemove} title="Remove from refinery" aria-label="Remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function CreateUserForm({
  refineryCode, onSubmit,
}: {
  refineryCode: string;
  onSubmit: (payload: {
    username: string; password: string; email: string;
    role: Role; display_name: string | null; phone: string | null;
  }) => Promise<void>;
}) {
  const [username, setUsername] = useState(`BRH-${refineryCode}`);
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<Role>("staff");
  const [saving, setSaving] = useState(false);

  const canSubmit = !saving && username.trim().length > 0 && password.length >= 6;

  return (
    <form
      id="refinery-create-user-form"
      className="space-y-4 pb-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        try {
          await onSubmit({
            username: username.trim(),
            password,
            email: email.trim(),
            role,
            display_name: displayName.trim() || null,
            phone: phone.trim() || null,
          });
        } catch {
          // toast handled upstream
        } finally {
          setSaving(false);
        }
      }}
    >
      <Field label="Username *">
        <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-11 text-base" autoComplete="off" autoCapitalize="off" spellCheck={false} />
      </Field>
      <Field label="Password * (min 6 chars)">
        <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="h-11 text-base" autoComplete="new-password" />
      </Field>
      <Field label="Display name">
        <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-11 text-base" />
      </Field>
      <Field label="Email (optional)">
        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-11 text-base" autoComplete="off" autoCapitalize="off" />
      </Field>
      <Field label="Phone">
        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="h-11 text-base" autoComplete="off" />
      </Field>
      <Field label="Role *">
        <Select value={role} onValueChange={(v) => setRole(v as Role)}>
          <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="viewer">Viewer</SelectItem>
            <SelectItem value="staff">Staff</SelectItem>
            <SelectItem value="manager">Manager</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      {/* Hidden submit button so footer's form="..." submit triggers and disabled state is honored */}
      <button
        type="submit"
        disabled={!canSubmit}
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
      />
      {saving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Creating user…
        </div>
      )}
    </form>
  );
}

function AssignExistingForm({
  refineryId, refineryCode, onAssigned,
}: {
  refineryId: string;
  refineryCode: string;
  onAssigned: () => void;
}) {
  const [list, setList] = useState<Array<{ id: string; username: string; email: string | null; assigned_refinery_id: string | null; already_in_this_refinery: boolean }>>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string>("");
  const [role, setRole] = useState<Role>("staff");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setLoading(true);
    listAssignableUsers({ data: { refineryId } })
      .then((l) => setList(l))
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed"))
      .finally(() => setLoading(false));
  }, [refineryId]);

  const available = list.filter((u) => !u.already_in_this_refinery);
  const canSubmit = !saving && !!selected;

  return (
    <form
      id="refinery-assign-user-form"
      className="space-y-4 pb-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!canSubmit) return;
        setSaving(true);
        try {
          await assignExistingUserToRefinery({ data: { refinery_id: refineryId, user_id: selected, role } });
          toast.success("User assigned");
          onAssigned();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Failed");
        } finally {
          setSaving(false);
        }
      }}
    >
      <p className="text-xs text-muted-foreground">
        Assigning a user moves them to Refinery {refineryCode}.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : available.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other users available to assign.</p>
      ) : (
        <>
          <Field label="User">
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-11 text-base"><SelectValue placeholder="Select a user…" /></SelectTrigger>
              <SelectContent>
                {available.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}{u.assigned_refinery_id ? " · (will move)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Role">
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="h-11 text-base"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </>
      )}
      <button type="submit" disabled={!canSubmit} className="hidden" aria-hidden="true" tabIndex={-1} />
      {saving && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-4 w-4 animate-spin" /> Assigning…
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium">{label}</Label>
      {children}
    </div>
  );
}

function ResetPasswordDialog({
  user, onClose, onReset,
}: {
  user: AssignedRefineryUser | null;
  onClose: () => void;
  onReset: (password: string) => Promise<void>;
}) {
  const [pw, setPw] = useState("");
  const [saving, setSaving] = useState(false);
  useEffect(() => { if (!user) { setPw(""); setSaving(false); } }, [user]);
  return (
    <Sheet open={!!user} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="bottom" className="h-auto max-h-[90dvh] rounded-t-xl p-0 flex flex-col gap-0">
        <SheetHeader className="px-4 py-3 border-b text-left">
          <SheetTitle className="text-base">Reset password — {user?.username}</SheetTitle>
          <SheetDescription className="text-xs">Set a new password. Share it securely with the user.</SheetDescription>
        </SheetHeader>
        <form
          className="px-4 py-4 space-y-3"
          onSubmit={async (e) => {
            e.preventDefault();
            if (pw.length < 6 || saving) return;
            setSaving(true);
            try { await onReset(pw); } finally { setSaving(false); }
          }}
        >
          <Field label="New password (min 6 chars)">
            <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} className="h-11 text-base" autoFocus />
          </Field>
          <div
            className="flex gap-2 pt-2"
            style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
          >
            <Button type="button" variant="outline" className="h-11 flex-1" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" className="h-11 flex-1" disabled={pw.length < 6 || saving}>
              {saving ? (<><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Saving…</>) : "Reset password"}
            </Button>
          </div>
        </form>
      </SheetContent>
    </Sheet>
  );
}
