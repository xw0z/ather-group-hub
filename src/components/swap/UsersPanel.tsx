import { useEffect, useState, type FormEvent } from "react";
import {
  Plus,
  Trash2,
  ShieldCheck,
  UserCircle,
  Lock,
  LogOut,
  KeyRound,
  Shield,
  UserPlus,
  Mail,
  Calendar,
  Users as UsersIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { createSwapUser, deleteSwapUser, listSwapUsers, updateSwapUser, resetSwapUserPassword } from "@/lib/swap-users.functions";
import { updateSwapOwnPassword } from "@/lib/swap-profile.functions";
import { cached, invalidate, CK } from "@/lib/swap-cache";
import { toast } from "sonner";
import { UserPermissionsEditor } from "@/components/swap/UserPermissionsEditor";
import { useLang } from "@/lib/purity-i18n";




type SwapUser = {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
};

type Section = "users" | "account" | "security";

export function UsersPanel({ currentUsername }: { currentUsername: string }) {
  const [section, setSection] = useState<Section>("users");
  const { t: tt } = useLang();

  const tabs: { key: Section; label: string; icon: typeof UsersIcon }[] = [
    { key: "users", label: tt("users.management"), icon: UsersIcon },
    { key: "account", label: tt("users.myAccount"), icon: UserCircle },
    { key: "security", label: tt("users.security"), icon: Shield },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5 p-1 rounded-lg bg-muted/40 border border-border/60 w-fit">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = section === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setSection(tab.key)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                active
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {section === "users" && <UserManagement />}
      {section === "account" && <MyAccount username={currentUsername} />}
      {section === "security" && <SecuritySection />}
    </div>
  );
}


/* -------------------- USER MANAGEMENT -------------------- */

function roleOf(u: SwapUser): "Administrator" | "Staff" {
  return u.is_admin ? "Administrator" : "Staff";
}

function RoleBadge({ role }: { role: "Administrator" | "Manager" | "Staff" }) {
  const styles: Record<string, string> = {
    Administrator: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
    Manager: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    Staff: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md border text-[10px] font-semibold ${styles[role]}`}
    >
      {role === "Administrator" && <ShieldCheck className="h-3 w-3" />}
      {role}
    </span>
  );
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  const dt = new Date(d);
  return dt.toLocaleDateString(undefined, { day: "2-digit", month: "short", year: "numeric" });
}

function UserManagement() {
  const { t: tt } = useLang();
  const [users, setUsers] = useState<SwapUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [error, setError] = useState<string | null>(null);


  // form
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"Administrator" | "Manager" | "Staff">("Staff");
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const data = await cached(CK.users, () => listSwapUsers(), 60_000);
      setUsers(data as SwapUser[]);
      const { data: auth } = await supabase.auth.getUser();
      setCurrentUserId(auth.user?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : tt("users.failedLoad"));

    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  function resetForm() {
    setUsername("");
    setPassword("");
    setConfirm("");
    setEmail("");
    setRole("Staff");
    setShowForm(false);
  }

  async function addUser(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError(tt("users.pwdMin"));
      return;
    }
    if (password !== confirm) {
      setError(tt("users.pwdMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      // Schema stores admin as a boolean. Manager maps to non-admin (Staff-tier).
      await createSwapUser({
        data: {
          username,
          password,
          email,
          is_admin: role === "Administrator",
        },
      });
      toast.success(`User ${username} created`);
      invalidate(CK.users, CK.activity);
      resetForm();
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : tt("users.failedCreate"));

    } finally {
      setSubmitting(false);
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm_(`Delete user ${name}? This cannot be undone.`)) return;
    try {
      await deleteSwapUser({ data: { id } });
      toast.success(`User ${name} deleted`);
      invalidate(CK.users, CK.activity);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tt("users.failedDelete"));

    }
  }

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold flex items-center gap-2">
            <UsersIcon className="h-4 w-4 text-primary" />
            {tt("users.management")}
          </h2>
          <p className="text-xs text-muted-foreground">
            {users.length} user{users.length === 1 ? "" : "s"} with access to the platform
          </p>
        </div>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <UserPlus className="h-4 w-4 mr-1" />
          {showForm ? tt("common.cancel") : tt("users.addUser")}
        </Button>

      </div>

      {showForm && (
        <form
          onSubmit={addUser}
          className="rounded-xl border border-border/60 bg-card p-4 space-y-3"
        >
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <UserPlus className="h-4 w-4 text-primary" /> New User
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">{tt("login.username")}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={tt("users.usernamePh")}
                required
              />
            </div>
            <div>
              <Label className="text-xs">{tt("auth.emailOpt")}</Label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={tt("users.emailPh")}
              />
            </div>
            <div>
              <Label className="text-xs">{tt("login.password")}</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div>
              <Label className="text-xs">{tt("profile.confirmPwd")}</Label>
              <Input
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>
            <div className="sm:col-span-2">
              <Label className="text-xs mb-1.5 block">{tt("users.role")}</Label>
              <div className="grid grid-cols-3 gap-2">

                {(["Administrator", "Manager", "Staff"] as const).map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`rounded-md border p-2 text-left text-xs transition-colors ${
                      role === r
                        ? "border-primary bg-primary/10"
                        : "border-border/60 hover:border-border"
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold">{r}</span>
                      {role === r && <ShieldCheck className="h-3 w-3 text-primary" />}
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {r === "Administrator" && "Full access"}
                      {r === "Manager" && "Clients, Reports, Margin, Swap, Audit"}
                      {r === "Staff" && "Clients & Reports only"}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          {error && (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <Button type="button" variant="outline" size="sm" onClick={resetForm}>
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={submitting}>
              {submitting ? "Creating…" : "Create User"}
            </Button>
          </div>
        </form>
      )}

      {error && !showForm && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading users…</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {users.map((u) => {
            const role = roleOf(u);
            const isSelf = u.id === currentUserId;
            return (
              <article
                key={u.id}
                className="rounded-xl border border-border/60 bg-card p-4 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-10 w-10 rounded-full bg-primary/15 flex items-center justify-center shrink-0">
                      <UserCircle className="h-6 w-6 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-semibold truncate flex items-center gap-2">
                        {u.username}
                        {isSelf && (
                          <span className="text-[9px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                            You
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5">
                        <RoleBadge role={role} />
                      </div>
                    </div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" /> Active
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </div>
                    <div className="font-medium truncate">{u.email ?? "—"}</div>
                  </div>
                  <div className="rounded-md bg-muted/30 px-2 py-1.5">
                    <div className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> Created
                    </div>
                    <div className="font-medium">{fmtDate(u.created_at)}</div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5 pt-1 border-t border-border/40">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={async () => {
                      const newUsername = window.prompt("Username:", u.username);
                      if (newUsername === null) return;
                      const newEmail = window.prompt("Email (leave blank to clear):", u.email ?? "");
                      if (newEmail === null) return;
                      try {
                        await updateSwapUser({
                          data: { id: u.id, username: newUsername.trim(), email: newEmail.trim() },
                        });
                        toast.success("User updated");
                        invalidate(CK.users, CK.activity);
                        load();
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to update user.");
                      }
                    }}
                  >
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-xs"
                    onClick={async () => {
                      const pwd = window.prompt(`New password for ${u.username} (min 6 chars):`);
                      if (pwd === null) return;
                      if (pwd.length < 6) {
                        toast.error("Password must be at least 6 characters.");
                        return;
                      }
                      try {
                        await resetSwapUserPassword({ data: { id: u.id, password: pwd } });
                        toast.success(`Password reset for ${u.username}`);
                      } catch (err) {
                        toast.error(err instanceof Error ? err.message : "Failed to reset password.");
                      }
                    }}
                  >
                    <KeyRound className="h-3 w-3 mr-1" />
                    Reset Password
                  </Button>
                  {!isSelf && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 px-2 text-xs text-destructive hover:text-destructive"
                      onClick={() => remove(u.id, u.username)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete
                    </Button>
                  )}
                </div>

                <UserPermissionsEditor userId={u.id} username={u.username} onChanged={load} />
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

// browser confirm aliased to avoid clashing with our `confirm` state name elsewhere
function confirm_(msg: string) {
  return typeof window !== "undefined" ? window.confirm(msg) : true;
}

/* -------------------- MY ACCOUNT -------------------- */

function MyAccount({ username }: { username: string }) {
  const [me, setMe] = useState<{
    email: string | null;
    isAdmin: boolean;
    lastSignIn: string | null;
    createdAt: string | null;
  } | null>(null);
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      const u = data.user;
      if (!u) return;
      const { data: profile } = await supabase
        .from("swap_profiles")
        .select("is_admin")
        .eq("id", u.id)
        .maybeSingle();
      setMe({
        email: u.email ?? null,
        isAdmin: Boolean(profile?.is_admin),
        lastSignIn: u.last_sign_in_at ?? null,
        createdAt: u.created_at ?? null,
      });
    })();
  }, []);

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    if (pwd.length < 6) return setErr("Password must be at least 6 characters.");
    if (pwd !== pwd2) return setErr("Passwords do not match.");
    setSaving(true);
    try {
      await updateSwapOwnPassword({ data: { password: pwd } });
      toast.success("Password updated");
      setPwd("");
      setPwd2("");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to update password.");
    } finally {
      setSaving(false);
    }
  }

  async function logoutEverywhere() {
    if (!confirm_("Sign out of all devices?")) return;
    try {
      await supabase.auth.signOut({ scope: "global" });
      toast.success("Signed out everywhere");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to sign out.");
    }
  }

  const role = me?.isAdmin ? "Administrator" : "Staff";

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-start gap-4">
          <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center">
            <UserCircle className="h-8 w-8 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-lg font-semibold">{username}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2">
              <RoleBadge role={role} />
              {me?.email && (
                <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                  <Mail className="h-3 w-3" />
                  {me.email}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground">Last Login</div>
            <div className="font-medium">
              {me?.lastSignIn ? new Date(me.lastSignIn).toLocaleString() : "—"}
            </div>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground">Account Created</div>
            <div className="font-medium">{fmtDate(me?.createdAt)}</div>
          </div>
        </div>
      </div>

      <form
        onSubmit={changePassword}
        className="rounded-xl border border-border/60 bg-card p-5 space-y-3"
      >
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          Change Password
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label className="text-xs">New password</Label>
            <Input
              type="password"
              value={pwd}
              onChange={(e) => setPwd(e.target.value)}
              placeholder="••••••••"
            />
          </div>
          <div>
            <Label className="text-xs">Confirm new password</Label>
            <Input
              type="password"
              value={pwd2}
              onChange={(e) => setPwd2(e.target.value)}
              placeholder="••••••••"
            />
          </div>
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        <div className="flex gap-2 justify-end">
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Update Password"}
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border/60 bg-card p-5">
        <h3 className="text-sm font-semibold flex items-center gap-2 mb-1">
          <LogOut className="h-4 w-4 text-primary" />
          Session
        </h3>
        <p className="text-xs text-muted-foreground mb-3">
          Sign out from every browser and device currently using this account.
        </p>
        <Button size="sm" variant="outline" onClick={logoutEverywhere}>
          <LogOut className="h-4 w-4 mr-1" />
          Logout All Devices
        </Button>
      </div>
    </section>
  );
}

/* -------------------- SECURITY -------------------- */

function SecuritySection() {
  const [minLen, setMinLen] = useState(8);
  const [strong, setStrong] = useState(true);
  const [rotateDays, setRotateDays] = useState(90);
  const [lastSignIn, setLastSignIn] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getUser();
      setLastSignIn(data.user?.last_sign_in_at ?? null);
    })();
  }, []);

  return (
    <section className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card p-5 space-y-4">
        <div className="flex items-center gap-2">
          <Shield className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Password Policy</h2>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="rounded-md border border-border/60 p-3">
            <Label className="text-xs">Minimum Password Length</Label>
            <Input
              type="number"
              min={6}
              max={64}
              value={minLen}
              onChange={(e) => setMinLen(Number(e.target.value))}
              className="mt-1"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Characters required (6–64).
            </p>
          </div>

          <div className="rounded-md border border-border/60 p-3">
            <Label className="text-xs">Force Password Change Every</Label>
            <div className="flex items-center gap-2 mt-1">
              <Input
                type="number"
                min={0}
                max={365}
                value={rotateDays}
                onChange={(e) => setRotateDays(Number(e.target.value))}
              />
              <span className="text-xs text-muted-foreground">days</span>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1">0 = never expire.</p>
          </div>

          <label className="rounded-md border border-border/60 p-3 sm:col-span-2 flex items-center justify-between gap-3 cursor-pointer">
            <div>
              <div className="text-xs font-medium">Require Strong Passwords</div>
              <div className="text-[10px] text-muted-foreground">
                Mix of upper, lower, number, and symbol.
              </div>
            </div>
            <input
              type="checkbox"
              checked={strong}
              onChange={(e) => setStrong(e.target.checked)}
              className="h-4 w-4 accent-primary"
            />
          </label>
        </div>

        <Button
          size="sm"
          onClick={() => toast.success("Security policy saved")}
        >
          <Lock className="h-4 w-4 mr-1" />
          Save Policy
        </Button>
      </div>

      <div className="rounded-xl border border-border/60 bg-card p-5">
        <div className="flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Activity</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs">
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground">Last Login Time</div>
            <div className="font-medium">
              {lastSignIn ? new Date(lastSignIn).toLocaleString() : "—"}
            </div>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground">Last Login IP</div>
            <div className="font-medium">Not tracked</div>
          </div>
          <div className="rounded-md bg-muted/30 px-3 py-2">
            <div className="text-muted-foreground">Failed Attempts</div>
            <div className="font-medium">0</div>
          </div>
        </div>
        <p className="text-[10px] text-muted-foreground mt-3">
          IP tracking and failed-login counters require an audit middleware extension.
        </p>
      </div>
    </section>
  );
}
