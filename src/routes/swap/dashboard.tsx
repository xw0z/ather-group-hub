import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  DollarSign,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  LogOut,
  UserPlus,
  ShieldCheck,
  Home,
  Users as UsersIcon,
  ScrollText,
  UserCircle,
  RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  createSwapUser,
  deleteSwapUser,
  getCurrentSwapUser,
  listSwapUsers,
} from "@/lib/swap-users.functions";
import {
  createSwapClient,
  deleteSwapClient,
  listSwapActivityLog,
  listSwapClients,
  listTodaySwapFees,
  updateSwapClient,
} from "@/lib/swap-clients.functions";
import { updateSwapOwnPassword } from "@/lib/swap-profile.functions";
import { SwapFooter } from "@/components/SwapFooter";

export const Route = createFileRoute("/swap/dashboard")({
  head: () => ({
    meta: [
      { title: "Swap — Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SwapDashboard,
});

type SwapUser = {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
};

type SwapClient = {
  id: string;
  code: string;
  usd_balance: number;
  annual_rate: number;
  short_annual_rate: number;
  position_type: "long" | "short";
  notes: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  user_id: string;
  username: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: unknown;
  created_at: string;
};

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

type Tab = "home" | "clients" | "profile" | "users" | "logs";

function SwapDashboard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [tab, setTab] = useState<Tab>("home");

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/swap", replace: true });
        return;
      }
      try {
        const me = await getCurrentSwapUser();
        if (cancelled) return;
        if (!me.isSwapUser) {
          await supabase.auth.signOut();
          navigate({ to: "/swap", replace: true });
          return;
        }
        setIsAdmin(me.isAdmin);
        setUsername(me.username ?? "");
        setReady(true);
      } catch {
        navigate({ to: "/swap", replace: true });
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/swap", replace: true });
  };

  if (!ready) {
    return (
      <main className="min-h-screen bg-background text-foreground grid place-items-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/60 sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-md bg-primary/15 border border-primary/40 grid place-items-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-semibold">Swap</p>
              <p className="text-[11px] text-muted-foreground">
                {username}
                {isAdmin && " · admin"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
        <nav className="mx-auto max-w-3xl px-2 pb-2 flex gap-1 text-sm overflow-x-auto">
          <TabBtn active={tab === "home"} onClick={() => setTab("home")}>
            <Home className="h-4 w-4 mr-1.5" /> Home
          </TabBtn>
          <TabBtn active={tab === "clients"} onClick={() => setTab("clients")}>
            <UsersIcon className="h-4 w-4 mr-1.5" /> Clients
          </TabBtn>
          <TabBtn active={tab === "profile"} onClick={() => setTab("profile")}>
            <UserCircle className="h-4 w-4 mr-1.5" /> Profile
          </TabBtn>
          {isAdmin && (
            <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Users
            </TabBtn>
          )}
          {isAdmin && (
            <TabBtn active={tab === "logs"} onClick={() => setTab("logs")}>
              <ScrollText className="h-4 w-4 mr-1.5" /> Logs
            </TabBtn>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-5">
        {tab === "home" && <HomeTab isAdmin={isAdmin} />}
        {tab === "clients" && <ClientsTab />}
        {tab === "profile" && <ProfileTab username={username} />}
        {tab === "users" && isAdmin && <UsersTab />}
        {tab === "logs" && isAdmin && <LogsTab />}
      </main>
      <SwapFooter />
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center px-3 py-2 rounded-md transition-colors whitespace-nowrap ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ----------------------------- HOME ----------------------------- */

function HomeTab({ isAdmin: _isAdmin }: { isAdmin: boolean }) {
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof listTodaySwapFees>> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await listTodaySwapFees();
      setData(r);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const totalLive = useMemo(
    () => data?.rows.reduce((s, r) => s + r.live_daily_fee, 0) ?? 0,
    [data],
  );
  const totalToday = useMemo(
    () => data?.rows.reduce((s, r) => s + (r.today_fee ?? 0), 0) ?? 0,
    [data],
  );

  return (
    <div className="space-y-4">
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Daily swap fees
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {data?.lastXauPrice
              ? `XAUUSD ${fmt(data.lastXauPrice)} · last snapshot ${data.lastXauDate}`
              : "No gold price snapshot yet."}
          </p>
        </div>


        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total today (snapshot)</div>
            <div className="font-semibold">${fmt(totalToday)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total live (current balances)</div>
            <div className="font-semibold">${fmt(totalLive)}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Per-client daily fees</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No clients yet — add one in the Clients tab.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.rows.map((r) => {
              const isShort = r.position_type === "short";
              const amountLabel = isShort ? "Benefit today" : "Fee today";
              const snapPrefix = isShort ? "today benefit" : "today fee";
              const lastPrefix = isShort ? "last benefit" : "last fee";
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: "/swap/clients/$clientId", params: { clientId: r.id } })
                    }
                    className="w-full text-left rounded-md border border-border/60 p-3 bg-background hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          <span>{r.code}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isShort
                                ? "bg-emerald-500/15 text-emerald-500"
                                : "bg-primary/10 text-primary"
                            }`}
                          >
                            {isShort ? "Short / Sell" : "Long / Buy"}
                          </span>
                          {r.notes ? (
                            <span className="text-muted-foreground font-normal truncate">
                              ({r.notes})
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          ${fmt(r.usd_balance)} · {fmt(r.effective_annual_rate)}%/yr{" "}
                          {isShort ? "(benefit)" : "(fee)"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`font-semibold ${
                            isShort ? "text-emerald-500" : ""
                          }`}
                        >
                          {isShort ? "+" : ""}${fmt(r.live_daily_fee)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {amountLabel}:{" "}
                          {r.today_fee !== null
                            ? `${snapPrefix} $${fmt(r.today_fee)}`
                            : r.last_fee !== null
                              ? `${lastPrefix} ${r.last_fee_date} $${fmt(r.last_fee)}`
                              : "no snapshot yet"}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Formula: USD balance × annual rate% ÷ 365 × day multiplier. Mon/Tue/Thu/Fri = 1 day,
          Wednesday = 3 days (covers the weekend in advance), Sat/Sun = 0. No additional swap
          is charged on Saturday or Sunday. A nightly job (21:00 UTC) snapshots the XAUUSD
          price and computes each client&apos;s fee.
          {data ? (
            <>
              {" "}Today&apos;s multiplier: <span className="font-medium">{data.todayMultiplier}×</span>.
            </>
          ) : null}
        </p>
      </section>
    </div>
  );
}

/* ---------------------------- CLIENTS ---------------------------- */

function ClientsTab() {
  const [clients, setClients] = useState<SwapClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [code, setCode] = useState("");
  const [balance, setBalance] = useState("");
  const [rate, setRate] = useState("5.4");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editRate, setEditRate] = useState("");

  async function load() {
    setLoading(true);
    try {
      const data = await listSwapClients();
      setClients(data as SwapClient[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createSwapClient({
        data: {
          code: code.trim(),
          usd_balance: parseFloat(balance) || 0,
          annual_rate: parseFloat(rate) || 5.4,
          notes: notes.trim() || null,
        },
      });
      setCode("");
      setBalance("");
      setRate("5.4");
      setNotes("");
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create.");
    }
  }

  function startEdit(c: SwapClient) {
    setEditingId(c.id);
    setEditCode(c.code);
    setEditBalance(String(c.usd_balance));
    setEditRate(String(c.annual_rate));
  }

  async function saveEdit(id: string) {
    try {
      await updateSwapClient({
        data: {
          id,
          code: editCode.trim(),
          usd_balance: parseFloat(editBalance) || 0,
          annual_rate: parseFloat(editRate) || 5.4,
        },
      });
      setEditingId(null);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  async function remove(id: string, codeStr: string) {
    if (!confirm(`Delete client ${codeStr}?`)) return;
    try {
      await deleteSwapClient({ data: { id } });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Clients</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "New client"}
        </Button>
      </div>

      {showForm && (
        <form onSubmit={add} className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-md bg-muted/30">
          <div className="col-span-2">
            <Label className="text-xs">Client code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} required />
          </div>
          <div>
            <Label className="text-xs">Current USD balance</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={balance}
              onChange={(e) => setBalance(e.target.value)}
              placeholder="0.00"
              required
            />
          </div>
          <div>
            <Label className="text-xs">Annual rate %</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={rate}
              onChange={(e) => setRate(e.target.value)}
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Name</Label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <div className="col-span-2">
            <Button type="submit" className="w-full">
              Save client
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-destructive mb-2" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : clients.length === 0 ? (
        <p className="text-sm text-muted-foreground">No clients yet.</p>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => {
            const isEditing = editingId === c.id;
            return (
              <li
                key={c.id}
                className="rounded-md border border-border/60 p-3 bg-background"
              >
                <div className="flex items-start justify-between gap-2">
                  {isEditing ? (
                    <Input
                      value={editCode}
                      onChange={(e) => setEditCode(e.target.value)}
                      className="max-w-[160px]"
                    />
                  ) : (
                    <div className="font-medium">{c.code}</div>
                  )}
                  <div className="flex gap-1">
                    {isEditing ? (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => saveEdit(c.id)}>
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setEditingId(null)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    ) : (
                      <>
                        <Button size="icon" variant="ghost" onClick={() => startEdit(c)}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => remove(c.id, c.code)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {isEditing ? (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <Label className="text-xs">USD balance</Label>
                      <Input
                        type="number"
                        value={editBalance}
                        onChange={(e) => setEditBalance(e.target.value)}
                      />
                    </div>
                    <div>
                      <Label className="text-xs">Rate %</Label>
                      <Input
                        type="number"
                        value={editRate}
                        onChange={(e) => setEditRate(e.target.value)}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                    <Stat label="USD balance" value={`$${fmt(Number(c.usd_balance))}`} />
                    <Stat label="Rate" value={`${fmt(Number(c.annual_rate))}%`} />
                    <Stat
                      label="Daily fee"
                      value={`$${fmt(
                        (Number(c.usd_balance) * Number(c.annual_rate)) / 100 / 365,
                      )}`}
                      accent
                    />
                  </div>
                )}
                {c.notes && (
                  <div className="text-[11px] text-muted-foreground mt-2">{c.notes}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 ${
        accent ? "bg-primary/10 text-primary" : "bg-muted/40"
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

/* ---------------------------- PROFILE ---------------------------- */

function ProfileTab({ username }: { username: string }) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (pwd.length < 6) return setErr("Password must be at least 6 characters.");
    if (pwd !== pwd2) return setErr("Passwords don't match.");
    setSaving(true);
    try {
      await updateSwapOwnPassword({ data: { password: pwd } });
      setPwd("");
      setPwd2("");
      setMsg("Password updated.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Profile</h2>
        <p className="text-[11px] text-muted-foreground">
          Signed in as <span className="font-mono">{username}</span>
        </p>
      </div>

      <form onSubmit={save} className="space-y-3 max-w-sm">
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
        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-primary">{msg}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Change password"}
        </Button>
      </form>
    </section>
  );
}

/* ----------------------------- USERS ----------------------------- */

function UsersTab() {
  const [users, setUsers] = useState<SwapUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const data = await listSwapUsers();
      setUsers(data as SwapUser[]);
      const { data: auth } = await supabase.auth.getUser();
      setCurrentUserId(auth.user?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createSwapUser({
        data: { username, password, email, is_admin: makeAdmin },
      });
      setUsername("");
      setPassword("");
      setEmail("");
      setMakeAdmin(false);
      setShowForm(false);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete user ${name}?`)) return;
    try {
      await deleteSwapUser({ data: { id } });
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Swap users</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "Add user"}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={add}
          className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-md bg-muted/30"
        >
          <div>
            <Label className="text-xs">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
            />
            Make admin
          </label>
          <div className="col-span-2">
            <Button type="submit" className="w-full">
              Create user
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-destructive mb-2" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-md border border-border/60 p-3 bg-background"
            >
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {u.username}
                  {u.is_admin && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">
                      <ShieldCheck className="h-3 w-3" /> admin
                    </span>
                  )}
                </div>
                {u.email && (
                  <div className="text-[11px] text-muted-foreground">{u.email}</div>
                )}
              </div>
              {u.id !== currentUserId && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(u.id, u.username)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------ LOGS ------------------------------ */

function LogsTab() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const data = await listSwapActivityLog();
      setRows(data as ActivityRow[]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Activity log</h2>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border/60 p-3 bg-background text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium">{r.username}</span>{" "}
                  <span className="text-muted-foreground">{r.action}</span>
                  {r.entity_type && (
                    <span className="text-muted-foreground"> · {r.entity_type}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {r.details ? (
                <pre className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify(r.details)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
