import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  UserPlus, KeyRound, Trash2, ShieldCheck, UserCog, UserX, Users as UsersIcon, Mail, Phone, Clock,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
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
  const [users, setUsers] = useState<AssignedRefineryUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"list" | "create" | "assign">("list");
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

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UsersIcon className="h-5 w-5" />
            Refinery {refinery.code} — Assigned Users
          </DialogTitle>
          <DialogDescription>
            {refinery.name} · Users here can access ONLY this refinery.
          </DialogDescription>
        </DialogHeader>

        {mode === "list" && (
          <div className="flex-1 overflow-y-auto -mx-6 px-6">
            {loading ? (
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
            )}
          </div>
        )}

        {mode === "create" && (
          <CreateUserForm
            refineryCode={refinery.code}
            onCancel={() => setMode("list")}
            onSubmit={async (payload) => {
              try {
                await createRefineryUser({ data: { ...payload, refinery_id: refinery.id } });
                toast.success(`User ${payload.username} created for Refinery ${refinery.code}`);
                setMode("list");
                void reload();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Failed to create user");
              }
            }}
          />
        )}

        {mode === "assign" && (
          <AssignExistingForm
            refineryId={refinery.id}
            refineryCode={refinery.code}
            onCancel={() => setMode("list")}
            onAssigned={() => { setMode("list"); void reload(); }}
          />
        )}

        <DialogFooter className="border-t pt-3 mt-2 flex-row flex-wrap gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={onClose}>Close</Button>
          {isAdmin && mode === "list" && (
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setMode("assign")}>
                <UserCog className="h-4 w-4 mr-1" /> Assign existing
              </Button>
              <Button size="sm" onClick={() => setMode("create")}>
                <UserPlus className="h-4 w-4 mr-1" /> Add new user
              </Button>
            </div>
          )}
        </DialogFooter>

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
      </DialogContent>
    </Dialog>
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
          <div className="flex items-center gap-1.5">
            <Select value={user.role} onValueChange={(v) => onChangeRole(v as Role)}>
              <SelectTrigger className="h-8 w-[110px] text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onResetPassword} title="Reset password">
              <KeyRound className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2" onClick={onToggleStatus} title={inactive ? "Reactivate" : "Deactivate"}>
              <UserX className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive hover:text-destructive" onClick={onRemove} title="Remove from refinery">
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>
    </li>
  );
}

function CreateUserForm({
  refineryCode, onCancel, onSubmit,
}: {
  refineryCode: string;
  onCancel: () => void;
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

  return (
    <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-3 py-2">
      <p className="text-xs text-muted-foreground">
        New user gets access only to Refinery {refineryCode}.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <Label className="text-xs">Username *</Label>
          <Input value={username} onChange={(e) => setUsername(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Password *</Label>
          <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Display name</Label>
          <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Email (optional)</Label>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} className="h-9" />
        </div>
        <div>
          <Label className="text-xs">Role *</Label>
          <Select value={role} onValueChange={(v) => setRole(v as Role)}>
            <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="viewer">Viewer</SelectItem>
              <SelectItem value="staff">Staff</SelectItem>
              <SelectItem value="manager">Manager</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          size="sm"
          disabled={saving || !username.trim() || password.length < 6}
          onClick={async () => {
            setSaving(true);
            await onSubmit({
              username: username.trim(),
              password,
              email: email.trim(),
              role,
              display_name: displayName.trim() || null,
              phone: phone.trim() || null,
            });
            setSaving(false);
          }}
        >
          {saving ? "Creating…" : "Create user"}
        </Button>
      </div>
    </div>
  );
}

function AssignExistingForm({
  refineryId, refineryCode, onCancel, onAssigned,
}: {
  refineryId: string;
  refineryCode: string;
  onCancel: () => void;
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

  return (
    <div className="flex-1 overflow-y-auto -mx-6 px-6 space-y-3 py-2">
      <p className="text-xs text-muted-foreground">
        Assigning a user moves them to Refinery {refineryCode}. Each user can be assigned to only one refinery.
      </p>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : available.length === 0 ? (
        <p className="text-sm text-muted-foreground">No other users available to assign.</p>
      ) : (
        <>
          <div>
            <Label className="text-xs">User</Label>
            <Select value={selected} onValueChange={setSelected}>
              <SelectTrigger className="h-9"><SelectValue placeholder="Select a user…" /></SelectTrigger>
              <SelectContent>
                {available.map((u) => (
                  <SelectItem key={u.id} value={u.id}>
                    {u.username}{u.assigned_refinery_id ? " · (will move from current refinery)" : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="viewer">Viewer</SelectItem>
                <SelectItem value="staff">Staff</SelectItem>
                <SelectItem value="manager">Manager</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </>
      )}
      <div className="flex justify-end gap-2 pt-2 border-t">
        <Button variant="outline" size="sm" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button
          size="sm"
          disabled={saving || !selected}
          onClick={async () => {
            setSaving(true);
            try {
              await assignExistingUserToRefinery({ data: { refinery_id: refineryId, user_id: selected, role } });
              toast.success("User assigned");
              onAssigned();
            } catch (e) {
              toast.error(e instanceof Error ? e.message : "Failed");
            } finally {
              setSaving(false);
            }
          }}
        >
          {saving ? "Assigning…" : "Assign user"}
        </Button>
      </div>
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
  useEffect(() => { if (!user) setPw(""); }, [user]);
  return (
    <Dialog open={!!user} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Reset password — {user?.username}</DialogTitle>
          <DialogDescription>Set a new password. Share it securely with the user.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label className="text-xs">New password (min 6 chars)</Label>
          <Input type="text" value={pw} onChange={(e) => setPw(e.target.value)} className="h-9" />
        </div>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>Cancel</Button>
          <Button size="sm" disabled={pw.length < 6} onClick={() => onReset(pw)}>Reset password</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
