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

export const Route = createFileRoute("/swap/dashboard")({
  head: () => ({
    meta: [
      { title: "Swap — Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SwapDashboard,
});

type SwapEntry = {
  id: string;
  user_id: string;
  client_name: string;
  usd_amount: number;
  annual_rate: number;
  start_date: string;
  end_date: string | null;
  notes: string | null;
  created_at: string;
};

type SwapUser = {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
};

const DEFAULT_RATE = 5.4;

function daysBetween(start: string, end: string | null): number {
  const s = new Date(start);
  const e = end ? new Date(end) : new Date();
  const ms = e.getTime() - s.getTime();
  return Math.max(1, Math.ceil(ms / (1000 * 60 * 60 * 24)));
}
function dailyFee(usd: number, rate: number): number {
  return (Number(usd) * (Number(rate) / 100)) / 365;
}
function fmt(n: number): string {
  return n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function SwapDashboard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [tab, setTab] = useState<"calculator" | "users">("calculator");

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
        <nav className="mx-auto max-w-3xl px-2 pb-2 flex gap-1 text-sm">
          <TabBtn active={tab === "calculator"} onClick={() => setTab("calculator")}>
            <DollarSign className="h-4 w-4 mr-1.5" /> Calculator
          </TabBtn>
          {isAdmin && (
            <TabBtn active={tab === "users"} onClick={() => setTab("users")}>
              <UserPlus className="h-4 w-4 mr-1.5" /> Users
            </TabBtn>
          )}
        </nav>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-5">
        {tab === "calculator" && <CalculatorTab />}
        {tab === "users" && isAdmin && <UsersTab />}
      </main>
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
      className={`inline-flex items-center px-3 py-2 rounded-md transition-colors ${
        active
          ? "bg-primary/10 text-primary font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function CalculatorTab() {
  const [entries, setEntries] = useState<SwapEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // form
  const [clientName, setClientName] = useState("");
  const [usd, setUsd] = useState("");
  const [rate, setRate] = useState(String(DEFAULT_RATE));
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState("");
  const [notes, setNotes] = useState("");

  // edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editUsd, setEditUsd] = useState("");
  const [editRate, setEditRate] = useState("");
  const [editEnd, setEditEnd] = useState("");

  // quick calculator
  const [calcUsd, setCalcUsd] = useState("");
  const [calcRate, setCalcRate] = useState(String(DEFAULT_RATE));
  const [calcDays, setCalcDays] = useState("1");

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("swap_entries")
      .select("*")
      .order("created_at", { ascending: false });
    setEntries((data as SwapEntry[]) ?? []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function addEntry(e: FormEvent) {
    e.preventDefault();
    const usdNum = parseFloat(usd);
    const rateNum = parseFloat(rate);
    if (!clientName.trim() || isNaN(usdNum) || usdNum <= 0 || isNaN(rateNum)) return;
    const { data: auth } = await supabase.auth.getUser();
    const uid = auth.user?.id;
    if (!uid) return;
    const { error } = await supabase.from("swap_entries").insert({
      user_id: uid,
      client_name: clientName.trim(),
      usd_amount: usdNum,
      annual_rate: rateNum,
      start_date: startDate,
      end_date: endDate || null,
      notes: notes.trim() || null,
    });
    if (!error) {
      setClientName("");
      setUsd("");
      setRate(String(DEFAULT_RATE));
      setEndDate("");
      setNotes("");
      setShowForm(false);
      load();
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete swap entry for ${name}?`)) return;
    await supabase.from("swap_entries").delete().eq("id", id);
    load();
  }

  function startEdit(en: SwapEntry) {
    setEditingId(en.id);
    setEditUsd(String(en.usd_amount));
    setEditRate(String(en.annual_rate));
    setEditEnd(en.end_date ?? "");
  }

  async function saveEdit(id: string) {
    const usdNum = parseFloat(editUsd);
    const rateNum = parseFloat(editRate);
    if (isNaN(usdNum) || isNaN(rateNum)) return;
    await supabase
      .from("swap_entries")
      .update({ usd_amount: usdNum, annual_rate: rateNum, end_date: editEnd || null })
      .eq("id", id);
    setEditingId(null);
    load();
  }

  const calc = useMemo(() => {
    const u = parseFloat(calcUsd) || 0;
    const r = parseFloat(calcRate) || 0;
    const d = parseInt(calcDays) || 0;
    const daily = dailyFee(u, r);
    return { daily, total: daily * d };
  }, [calcUsd, calcRate, calcDays]);

  const totals = useMemo(() => {
    let totalUsd = 0;
    let totalFee = 0;
    for (const e of entries) {
      const days = daysBetween(e.start_date, e.end_date);
      totalUsd += Number(e.usd_amount);
      totalFee += dailyFee(Number(e.usd_amount), Number(e.annual_rate)) * days;
    }
    return { totalUsd, totalFee };
  }, [entries]);

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold mb-3 flex items-center gap-2">
          <DollarSign className="h-4 w-4 text-primary" /> Quick swap calculator
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <div>
            <Label className="text-xs">USD</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={calcUsd}
              onChange={(e) => setCalcUsd(e.target.value)}
              placeholder="0.00"
            />
          </div>
          <div>
            <Label className="text-xs">Rate %/yr</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={calcRate}
              onChange={(e) => setCalcRate(e.target.value)}
            />
          </div>
          <div>
            <Label className="text-xs">Days</Label>
            <Input
              type="number"
              inputMode="numeric"
              value={calcDays}
              onChange={(e) => setCalcDays(e.target.value)}
            />
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Daily fee</div>
            <div className="font-semibold">${fmt(calc.daily)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total fee</div>
            <div className="font-semibold">${fmt(calc.total)}</div>
          </div>
        </div>
        <p className="text-[11px] text-muted-foreground mt-2">
          Formula: USD × rate%/yr ÷ 365 × days
        </p>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-sm font-semibold">Saved swap entries</h2>
            <p className="text-[11px] text-muted-foreground">
              {entries.length} entries · Total USD ${fmt(totals.totalUsd)} · Total fees $
              {fmt(totals.totalFee)}
            </p>
          </div>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "New"}
          </Button>
        </div>

        {showForm && (
          <form
            onSubmit={addEntry}
            className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-md bg-muted/30"
          >
            <div className="col-span-2">
              <Label className="text-xs">Client name</Label>
              <Input
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder="Client"
                required
              />
            </div>
            <div>
              <Label className="text-xs">USD retrieved</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={usd}
                onChange={(e) => setUsd(e.target.value)}
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
                required
              />
            </div>
            <div>
              <Label className="text-xs">Start date</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <Label className="text-xs">End date (optional)</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Notes</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Button type="submit" className="w-full">
                Save entry
              </Button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="text-sm text-muted-foreground">No swap entries yet.</p>
        ) : (
          <ul className="space-y-2">
            {entries.map((en) => {
              const days = daysBetween(en.start_date, en.end_date);
              const daily = dailyFee(Number(en.usd_amount), Number(en.annual_rate));
              const total = daily * days;
              const isEditing = editingId === en.id;
              return (
                <li
                  key={en.id}
                  className="rounded-md border border-border/60 p-3 bg-background"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-medium truncate">{en.client_name}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {en.start_date} → {en.end_date ?? "today"} · {days} day
                        {days !== 1 ? "s" : ""}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {isEditing ? (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => saveEdit(en.id)}
                          >
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
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => startEdit(en)}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(en.id, en.client_name)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>

                  {isEditing ? (
                    <div className="grid grid-cols-3 gap-2 mt-2">
                      <div>
                        <Label className="text-xs">USD</Label>
                        <Input
                          type="number"
                          value={editUsd}
                          onChange={(e) => setEditUsd(e.target.value)}
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
                      <div>
                        <Label className="text-xs">End date</Label>
                        <Input
                          type="date"
                          value={editEnd}
                          onChange={(e) => setEditEnd(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2 mt-2 text-xs">
                      <Stat label="USD" value={`$${fmt(Number(en.usd_amount))}`} />
                      <Stat label="Rate" value={`${Number(en.annual_rate).toFixed(2)}%`} />
                      <Stat label="Daily" value={`$${fmt(daily)}`} />
                      <Stat label="Total" value={`$${fmt(total)}`} accent />
                    </div>
                  )}

                  {en.notes && (
                    <div className="text-[11px] text-muted-foreground mt-2">{en.notes}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
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
