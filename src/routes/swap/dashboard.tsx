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
  computeMargin,
  createSwapClient,
  deleteSwapClient,
  getLiveXauPrice,
  listSwapActivityLog,
  listSwapClients,
  listSwapMarginHistory,
  listTodaySwapFees,
  setManualXauPrice,
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
  gold_kg: number;
  xauusd_price: number | null;
  margin_requirement_pct: number;
  annual_rate: number;
  short_annual_rate: number;
  position_type: "long" | "short";
  notes: string | null;
  created_at: string;
};

type MarginHistoryRow = {
  id: string;
  client_id: string;
  username: string;
  changed_field: string;
  old_usd_balance: number | null;
  new_usd_balance: number | null;
  old_gold_kg: number | null;
  new_gold_kg: number | null;
  old_xauusd_price: number | null;
  new_xauusd_price: number | null;
  old_margin_pct: number | null;
  new_margin_pct: number | null;
  old_required_margin: number | null;
  new_required_margin: number | null;
  old_available_margin: number | null;
  new_available_margin: number | null;
  old_status: string | null;
  new_status: string | null;
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

type Tab = "home" | "clients" | "margin" | "profile" | "users" | "logs";

type LiveXau = Awaited<ReturnType<typeof getLiveXauPrice>>;

function SwapDashboard() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [tab, setTab] = useState<Tab>("home");
  const [livePrice, setLivePrice] = useState<LiveXau | null>(null);
  const [livePriceLoading, setLivePriceLoading] = useState(false);

  const refreshPrice = async () => {
    setLivePriceLoading(true);
    try {
      const r = await getLiveXauPrice();
      setLivePrice(r);
    } catch (e) {
      console.error("Failed to fetch live XAU", e);
    } finally {
      setLivePriceLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    refreshPrice();
    const id = setInterval(refreshPrice, 2 * 60 * 1000); // every 2 minutes
    return () => clearInterval(id);
  }, [ready]);

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
          <TabBtn active={tab === "margin"} onClick={() => setTab("margin")}>
            <ShieldCheck className="h-4 w-4 mr-1.5" /> Margin log
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
        {tab === "home" && (
          <HomeTab
            isAdmin={isAdmin}
            livePrice={livePrice}
            livePriceLoading={livePriceLoading}
            onRefreshPrice={refreshPrice}
            onPriceChanged={setLivePrice}
          />
        )}
        {tab === "clients" && <ClientsTab livePrice={livePrice} />}
        {tab === "margin" && <MarginLogTab />}
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
          ? "bg-green-500/15 text-green-600 font-medium"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ----------------------------- HOME ----------------------------- */

function HomeTab({
  isAdmin,
  livePrice,
  livePriceLoading,
  onRefreshPrice,
  onPriceChanged,
}: {
  isAdmin: boolean;
  livePrice: LiveXau | null;
  livePriceLoading: boolean;
  onRefreshPrice: () => void;
  onPriceChanged: (p: LiveXau) => void;
}) {
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
    () => data?.rows.reduce((s, r) => s + r.base_daily_fee, 0) ?? 0,
    [data],
  );
  const totalToday = useMemo(
    () => data?.rows.reduce((s, r) => s + (r.today_fee ?? 0), 0) ?? 0,
    [data],
  );

  return (
    <div className="space-y-4">
      <LiveXauCard
        isAdmin={isAdmin}
        livePrice={livePrice}
        loading={livePriceLoading}
        onRefresh={onRefreshPrice}
        onPriceChanged={onPriceChanged}
      />

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
                                ? "bg-red-500/15 text-red-600"
                                : "bg-green-500/15 text-green-600"
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
                            isShort ? "text-red-600" : "text-green-600"
                          }`}
                        >
                          {isShort ? "+" : ""}${fmt(r.base_daily_fee)}
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
          Formula: USD balance × annual rate% ÷ 365 × day multiplier. Long positions are
          charged a fee using the long annual rate; Short positions receive a benefit credit
          using the short annual benefit rate. Mon/Tue/Thu/Fri = 1 day, Wednesday = 3 days
          (covers the weekend in advance), Sat/Sun = 0. No additional swap is charged or
          credited on Saturday or Sunday.
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

type MarginFilter = "all" | "enough" | "needed";

function ClientsTab({ livePrice }: { livePrice: LiveXau | null }) {
  const [clients, setClients] = useState<SwapClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarginFilter>("all");

  const [code, setCode] = useState("");
  const [balance, setBalance] = useState("");
  const [goldAmount, setGoldAmount] = useState("0");
  const [goldUnit, setGoldUnit] = useState<"kg" | "g">("kg");
  const [xau, setXau] = useState("");
  const [marginPct, setMarginPct] = useState("20");
  const [rate, setRate] = useState("5.4");
  const [shortRate, setShortRate] = useState("2.5");
  const [positionType, setPositionType] = useState<"long" | "short">("long");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editGoldAmount, setEditGoldAmount] = useState("0");
  const [editGoldUnit, setEditGoldUnit] = useState<"kg" | "g">("kg");
  const [editXau, setEditXau] = useState("");
  const [editMarginPct, setEditMarginPct] = useState("20");
  const [editRate, setEditRate] = useState("");
  const [editShortRate, setEditShortRate] = useState("");
  const [editPositionType, setEditPositionType] = useState<"long" | "short">("long");

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
          gold_kg: parseFloat(goldKg) || 0,
          xauusd_price: xau.trim() === "" ? null : parseFloat(xau) || 0,
          margin_requirement_pct: parseFloat(marginPct) || 20,
          annual_rate: parseFloat(rate) || 5.4,
          short_annual_rate: parseFloat(shortRate) || 2.5,
          position_type: positionType,
          notes: notes.trim() || null,
        },
      });
      setCode("");
      setBalance("");
      setGoldKg("0");
      setXau("");
      setMarginPct("20");
      setRate("5.4");
      setShortRate("2.5");
      setPositionType("long");
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
    setEditGoldKg(String(c.gold_kg ?? 0));
    setEditXau(c.xauusd_price !== null ? String(c.xauusd_price) : "");
    setEditMarginPct(String(c.margin_requirement_pct ?? 20));
    setEditRate(String(c.annual_rate));
    setEditShortRate(String(c.short_annual_rate ?? 2.5));
    setEditPositionType((c.position_type ?? "long") as "long" | "short");
  }

  async function saveEdit(id: string) {
    try {
      await updateSwapClient({
        data: {
          id,
          code: editCode.trim(),
          usd_balance: parseFloat(editBalance) || 0,
          gold_kg: parseFloat(editGoldKg) || 0,
          xauusd_price: editXau.trim() === "" ? null : parseFloat(editXau) || 0,
          margin_requirement_pct: parseFloat(editMarginPct) || 20,
          annual_rate: parseFloat(editRate) || 5.4,
          short_annual_rate: parseFloat(editShortRate) || 2.5,
          position_type: editPositionType,
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

  // Live XAU price overrides any per-client saved price for margin math.
  const effectiveXau = (c: SwapClient): number | null => {
    if (livePrice && livePrice.price > 0) return livePrice.price;
    return c.xauusd_price !== null ? Number(c.xauusd_price) : null;
  };

  // Aggregate margin totals
  const totals = useMemo(() => {
    let required = 0;
    let available = 0;
    let shortage = 0;
    let needingCount = 0;
    for (const c of clients) {
      const m = computeMargin({
        usd_balance: Number(c.usd_balance),
        gold_kg: Number(c.gold_kg ?? 0),
        xauusd_price: effectiveXau(c),
        margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
      });
      required += m.requiredMargin;
      available += m.availableMargin;
      if (m.status === "needed") {
        shortage += Math.abs(m.difference);
        needingCount += 1;
      }
    }
    return { required, available, shortage, needingCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, livePrice]);

  const filteredClients = useMemo(() => {
    if (filter === "all") return clients;
    return clients.filter((c) => {
      const m = computeMargin({
        usd_balance: Number(c.usd_balance),
        gold_kg: Number(c.gold_kg ?? 0),
        xauusd_price: effectiveXau(c),
        margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
      });
      return filter === "enough" ? m.status === "enough" : m.status === "needed";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, filter, livePrice]);

  return (
    <div className="space-y-4">
      {/* Margin totals */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-primary" /> Margin overview
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total required</div>
            <div className="font-semibold">${fmt(totals.required)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total available</div>
            <div className="font-semibold">${fmt(totals.available)}</div>
          </div>
          <div
            className={`rounded-md px-3 py-2 ${
              totals.shortage > 0
                ? "bg-red-500/15 text-red-600"
                : "bg-green-500/15 text-green-600"
            }`}
          >
            <div className="text-[11px] opacity-80">Total shortage</div>
            <div className="font-semibold">${fmt(totals.shortage)}</div>
          </div>
          <div
            className={`rounded-md px-3 py-2 ${
              totals.needingCount > 0
                ? "bg-red-500/15 text-red-600"
                : "bg-green-500/15 text-green-600"
            }`}
          >
            <div className="text-[11px] opacity-80">Clients needing margin</div>
            <div className="font-semibold">{totals.needingCount}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Clients</h2>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "New client"}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {(["all", "enough", "needed"] as MarginFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                filter === f
                  ? f === "needed"
                    ? "border-red-500 bg-red-500/15 text-red-600 font-medium"
                    : f === "enough"
                      ? "border-green-500 bg-green-500/15 text-green-600 font-medium"
                      : "border-primary bg-primary/15 text-foreground font-medium"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all"
                ? `All (${clients.length})`
                : f === "enough"
                  ? `Enough margin (${clients.length - totals.needingCount})`
                  : `Margin needed (${totals.needingCount})`}
            </button>
          ))}
        </div>

        {showForm && (
          <form onSubmit={add} className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-md bg-muted/30">
            <div className="col-span-2">
              <Label className="text-xs">Client code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Position type</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setPositionType("long")}
                  className={`text-xs rounded-md border px-3 py-2 ${
                    positionType === "long"
                      ? "border-primary bg-green-500/15 text-green-600 font-medium"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  Long / Buy (fee)
                </button>
                <button
                  type="button"
                  onClick={() => setPositionType("short")}
                  className={`text-xs rounded-md border px-3 py-2 ${
                    positionType === "short"
                      ? "border-red-500 bg-red-500/10 text-red-600 font-medium"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  Short / Sell (benefit)
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">USD balance</Label>
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
              <Label className="text-xs">
                {positionType === "short" ? "Short benefit %/yr" : "Long fee %/yr"}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={positionType === "short" ? shortRate : rate}
                onChange={(e) =>
                  positionType === "short"
                    ? setShortRate(e.target.value)
                    : setRate(e.target.value)
                }
              />
            </div>
            <div>
              <Label className="text-xs">Gold balance (kg)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={goldKg}
                onChange={(e) => setGoldKg(e.target.value)}
                placeholder="0"
              />
            </div>
            <div>
              <Label className="text-xs">XAUUSD price ($/oz)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={xau}
                onChange={(e) => setXau(e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Margin requirement (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                placeholder="20"
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
        ) : filteredClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients to show.</p>
        ) : (
          <ul className="space-y-2">
            {filteredClients.map((c) => {
              const isEditing = editingId === c.id;
              const xauForCalc = effectiveXau(c);
              const margin = computeMargin({
                usd_balance: Number(c.usd_balance),
                gold_kg: Number(c.gold_kg ?? 0),
                xauusd_price: xauForCalc,
                margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
              });
              const needsMargin = margin.status === "needed";
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
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span>{c.code}</span>
                        {needsMargin && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 font-semibold">
                            ⚠ Margin needed
                          </span>
                        )}
                      </div>
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
                      <div className="col-span-2">
                        <Label className="text-xs">Position type</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setEditPositionType("long")}
                            className={`text-xs rounded-md border px-3 py-2 ${
                              editPositionType === "long"
                                ? "border-primary bg-green-500/15 text-green-600 font-medium"
                                : "border-border/60 text-muted-foreground"
                            }`}
                          >
                            Long / Buy
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditPositionType("short")}
                            className={`text-xs rounded-md border px-3 py-2 ${
                              editPositionType === "short"
                                ? "border-red-500 bg-red-500/10 text-red-600 font-medium"
                                : "border-border/60 text-muted-foreground"
                            }`}
                          >
                            Short / Sell
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">USD balance</Label>
                        <Input
                          type="number"
                          value={editBalance}
                          onChange={(e) => setEditBalance(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">
                          {editPositionType === "short" ? "Short benefit %" : "Long fee %"}
                        </Label>
                        <Input
                          type="number"
                          value={editPositionType === "short" ? editShortRate : editRate}
                          onChange={(e) =>
                            editPositionType === "short"
                              ? setEditShortRate(e.target.value)
                              : setEditRate(e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Gold (kg)</Label>
                        <Input
                          type="number"
                          value={editGoldKg}
                          onChange={(e) => setEditGoldKg(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">XAUUSD ($/oz)</Label>
                        <Input
                          type="number"
                          value={editXau}
                          onChange={(e) => setEditXau(e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Margin requirement (%)</Label>
                        <Input
                          type="number"
                          value={editMarginPct}
                          onChange={(e) => setEditMarginPct(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (() => {
                    const isShort = (c.position_type ?? "long") === "short";
                    const effRate = isShort
                      ? Number(c.short_annual_rate ?? 0)
                      : Number(c.annual_rate);
                    const daily = (Number(c.usd_balance) * effRate) / 100 / 365;
                    return (
                      <>
                        <div className="mt-2">
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isShort
                                ? "bg-red-500/15 text-red-600"
                                : "bg-green-500/15 text-green-600"
                            }`}
                          >
                            {isShort ? "Short / Sell" : "Long / Buy"}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                          <Stat label="USD balance" value={`$${fmt(Number(c.usd_balance))}`} />
                          <Stat
                            label={isShort ? "Benefit rate" : "Fee rate"}
                            value={`${fmt(effRate)}%`}
                          />
                          <Stat
                            label={isShort ? "Daily benefit" : "Daily fee"}
                            value={`${isShort ? "+" : ""}$${fmt(daily)}`}
                            accent
                          />
                        </div>

                        {/* Margin Details */}
                        <MarginDetails
                          goldKg={Number(c.gold_kg ?? 0)}
                          xau={xauForCalc}
                          marginPct={Number(c.margin_requirement_pct ?? 20)}
                          margin={margin}
                        />
                      </>
                    );
                  })()}
                  {c.notes && (
                    <div className="text-[11px] text-muted-foreground mt-2">{c.notes}</div>
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

function MarginDetails({
  goldKg,
  xau,
  marginPct,
  margin,
}: {
  goldKg: number;
  xau: number | null;
  marginPct: number;
  margin: ReturnType<typeof computeMargin>;
}) {
  const tier = margin.tier;
  const tierBorder =
    tier === "safe"
      ? "border-green-500/40 bg-green-500/5"
      : tier === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-red-500/40 bg-red-500/5";
  const tierBadge =
    tier === "safe"
      ? "bg-green-500/20 text-green-600"
      : tier === "warning"
        ? "bg-amber-500/20 text-amber-600"
        : "bg-red-500/20 text-red-600";
  const tierLabel =
    tier === "safe"
      ? "✓ Safe"
      : tier === "warning"
        ? "⚠ Warning"
        : "⚠ Margin needed";
  const diffAccent: "green" | "amber" | "red" =
    tier === "safe" ? "green" : tier === "warning" ? "amber" : "red";
  return (
    <div className={`mt-3 rounded-md border p-3 ${tierBorder}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          Margin details
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${tierBadge}`}>
          {tierLabel} · {fmt(margin.marginLevelPct)}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <Row label="Gold balance" value={`${fmt(goldKg, 4)} kg`} />
        <Row
          label="Gold value (USD)"
          value={xau !== null ? `$${fmt(margin.goldValue)}` : "—"}
        />
        <Row label="XAUUSD price" value={xau !== null ? `$${fmt(xau)}/oz` : "not set"} />
        <Row label="Margin %" value={`${fmt(marginPct)}%`} />
        <Row label="Total exposure" value={`$${fmt(margin.totalExposure)}`} />
        <Row label="Required margin" value={`$${fmt(margin.requiredMargin)}`} />
        <Row label="Available margin" value={`$${fmt(margin.availableMargin)}`} />
        <Row label="Margin level" value={`${fmt(margin.marginLevelPct)}%`} accent={diffAccent} />
        <Row
          label={margin.difference >= 0 ? "Extra available" : "Needs to add"}
          value={`$${fmt(Math.abs(margin.difference))}`}
          accent={diffAccent}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "red" | "amber";
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 ${
        accent === "green"
          ? "bg-green-500/15 text-green-600 font-semibold"
          : accent === "red"
            ? "bg-red-500/15 text-red-600 font-semibold"
            : accent === "amber"
              ? "bg-amber-500/15 text-amber-600 font-semibold"
              : "bg-muted/40"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/* -------------------------- LIVE XAUUSD -------------------------- */

function LiveXauCard({
  isAdmin,
  livePrice,
  loading,
  onRefresh,
  onPriceChanged,
}: {
  isAdmin: boolean;
  livePrice: LiveXau | null;
  loading: boolean;
  onRefresh: () => void;
  onPriceChanged: (p: LiveXau) => void;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [override, setOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const price = parseFloat(override);
    if (!Number.isFinite(price) || price <= 0) {
      setErr("Enter a valid price.");
      return;
    }
    setSaving(true);
    try {
      const r = await setManualXauPrice({ data: { price } });
      onPriceChanged(r);
      setOverride("");
      setShowOverride(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const updatedAt = livePrice?.updated_at
    ? new Date(livePrice.updated_at).toLocaleString()
    : "—";

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Live XAUUSD
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            ${livePrice ? fmt(livePrice.price) : "—"}{" "}
            <span className="text-xs font-normal text-muted-foreground">/ oz</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {updatedAt}
            {livePrice?.source ? ` · ${livePrice.source}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowOverride((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              {showOverride ? "Cancel override" : "Admin override"}
            </button>
          )}
        </div>
      </div>

      {livePrice?.warning && (
        <div className="mt-3 text-xs px-3 py-2 rounded-md bg-amber-500/15 text-amber-700">
          ⚠ {livePrice.warning}
        </div>
      )}

      {isAdmin && showOverride && (
        <form onSubmit={saveOverride} className="mt-3 flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Manual XAUUSD ($/oz)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="e.g. 2350"
            />
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save override"}
          </Button>
        </form>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Auto-refreshes every 2 minutes. Used for all margin calculations.
      </p>
    </section>
  );
}

/* -------------------------- MARGIN LOG -------------------------- */

function MarginLogTab() {
  const [rows, setRows] = useState<MarginHistoryRow[]>([]);
  const [clients, setClients] = useState<SwapClient[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [h, c] = await Promise.all([listSwapMarginHistory({ data: {} }), listSwapClients()]);
      setRows(h as MarginHistoryRow[]);
      setClients(c as SwapClient[]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const codeById = useMemo(() => {
    const m = new Map<string, string>();
    for (const c of clients) m.set(c.id, c.code);
    return m;
  }, [clients]);

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" /> Margin history
        </h2>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No margin changes recorded yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const flipped = r.old_status !== r.new_status;
            return (
              <li
                key={r.id}
                className="rounded-md border border-border/60 p-3 bg-background text-sm"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">
                      {codeById.get(r.client_id) ?? r.client_id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      by {r.username} · changed: {r.changed_field}
                    </div>
                  </div>
                  <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                    {new Date(r.created_at).toLocaleString()}
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs flex-wrap">
                  <StatusPill status={r.old_status} />
                  <span className="text-muted-foreground">→</span>
                  <StatusPill status={r.new_status} />
                  {flipped && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">
                      status changed
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-1 mt-2 text-[11px] text-muted-foreground">
                  <div>
                    Required: ${fmt(Number(r.old_required_margin ?? 0))} → $
                    {fmt(Number(r.new_required_margin ?? 0))}
                  </div>
                  <div>
                    Available: ${fmt(Number(r.old_available_margin ?? 0))} → $
                    {fmt(Number(r.new_available_margin ?? 0))}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-[11px]">—</span>;
  const enough = status === "enough";
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
        enough ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"
      }`}
    >
      {enough ? "Enough" : "Needed"}
    </span>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div
      className={`rounded-md px-2 py-1.5 ${
        accent ? "bg-green-500/15 text-green-600" : "bg-muted/40"
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
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-600">
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
