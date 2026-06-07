import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  Scale, LogOut, Plus, Trash2, Share2, FileText, ArrowLeft, Wallet, Coins,
  TrendingUp, TrendingDown, AlertTriangle, Pencil, Image as ImageIcon,
} from "lucide-react";
import html2canvas from "html2canvas-pro";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  listRefineries, getMyRefineryAssignment,
  listClients, createClient, updateClient, deleteClient, adjustClientBalances,
  listTransactions, createTransaction, updateTransaction, deleteTransaction, cancelTransaction, getTransaction,
  getStock, listStockMovements, getDashboard, adjustStock,
  getMyRefineryProfile, updateMyRefineryProfile,
  type Refinery, type RefineryClient, type RefineryTransaction,
  type RefineryAssignment, type RefineryDirection, type RefineryTxType,
} from "@/lib/refineries.functions";

type Tab = "dashboard" | "clients" | "transactions" | "stock" | "profile";
const TABS: { id: Tab; label: string }[] = [
  { id: "dashboard", label: "Dashboard" },
  { id: "clients", label: "Clients" },
  { id: "transactions", label: "Transactions" },
  { id: "stock", label: "Stock" },
  { id: "profile", label: "Profile" },
];

export const Route = createFileRoute("/desk/refineries")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Refineries" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    r: typeof s.r === "string" ? s.r : undefined,
    tab: typeof s.tab === "string" ? (s.tab as Tab) : ("dashboard" as Tab),
    action: s.action === "new" || s.action === "edit" ? (s.action as "new" | "edit") : undefined,
    txId: typeof s.txId === "string" ? s.txId : undefined,
  }),
  component: RefineriesPage,
});

// =============================================================
// Formatters & helpers
// =============================================================
const fmtG = (n: number) =>
  `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
const fmtDA = (n: number) =>
  `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} DA`;
const fmtPurity = (n: number) =>
  Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const balClass = (n: number) =>
  n > 0 ? "text-emerald-500" : n < 0 ? "text-destructive" : "text-muted-foreground";
const signed = (n: number, fmt: (n: number) => string) =>
  `${n > 0 ? "+" : ""}${fmt(n)}`;

// =============================================================
// Root page
// =============================================================
function RefineriesPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [assignment, setAssignment] = useState<RefineryAssignment | null>(null);
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) { navigate({ to: "/desk/login", replace: true }); return; }
      try {
        const [a, refs] = await Promise.all([getMyRefineryAssignment(), listRefineries()]);
        setAssignment(a);
        setRefineries(refs);
        // Refinery-only user → pin to their refinery
        if (!a.isAdmin && a.refineryId && search.r !== a.refineryId) {
          navigate({ to: "/desk/refineries", search: { r: a.refineryId, tab: "dashboard" }, replace: true });
        } else if (!a.isAdmin && !a.refineryId) {
          // Not assigned to anything: send to unauthorized
          navigate({ to: "/unauthorized", replace: true });
        }
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load refineries");
      } finally {
        setLoading(false);
      }
    })();
  }, [navigate, search.r]);

  const activeRefinery = useMemo(
    () => refineries.find((r) => r.id === search.r) ?? null,
    [refineries, search.r],
  );

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/desk/login", replace: true });
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
        <p className="text-sm text-muted-foreground tracking-[0.25em]">LOADING…</p>
      </main>
    );
  }

  // Admin: show selector if no refinery picked
  if (!search.r || !activeRefinery) {
    return (
      <RefineryPicker
        refineries={refineries}
        isAdmin={Boolean(assignment?.isAdmin)}
        onSignOut={signOut}
      />
    );
  }

  return (
    <RefineryShell
      refinery={activeRefinery}
      assignment={assignment!}
      tab={search.tab}
      action={search.action}
      txId={search.txId}
      onTab={(t) => navigate({ to: "/desk/refineries", search: { r: activeRefinery.id, tab: t } })}
      onAction={(action, txId) =>
        navigate({ to: "/desk/refineries", search: { r: activeRefinery.id, tab: "transactions", action, txId } })
      }
      onBack={
        assignment?.isAdmin
          ? () => navigate({ to: "/desk/refineries", search: { r: undefined, tab: "dashboard" } })
          : undefined
      }
      onSignOut={signOut}
    />
  );
}

// =============================================================
// Refinery picker (admin only)
// =============================================================
function RefineryPicker({
  refineries, isAdmin, onSignOut,
}: { refineries: Refinery[]; isAdmin: boolean; onSignOut: () => void }) {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar title="REFINERIES" subtitle={isAdmin ? "Select a refinery" : ""} onSignOut={onSignOut} />
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12">
        <h1 className="font-display text-3xl mb-2">Refineries</h1>
        <p className="text-sm text-muted-foreground mb-8">
          Choose a refinery to manage its clients, transactions, and stock.
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {refineries.map((r) => (
            <Card
              key={r.id}
              className="p-6 cursor-pointer hover:border-ember/60 transition-colors"
              onClick={() => navigate({ to: "/desk/refineries", search: { r: r.id, tab: "dashboard" } })}
            >
              <div className="flex items-center gap-3 mb-3">
                <div className="h-10 w-10 rounded-md bg-ember/15 border border-ember/40 flex items-center justify-center">
                  <Scale className="h-5 w-5 text-ember" />
                </div>
                <div>
                  <p className="font-display text-lg tracking-wide">{r.name}</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-[0.18em]">{r.status}</p>
                </div>
              </div>
              <p className="text-sm text-muted-foreground">Open dashboard, clients, transactions, and stock.</p>
            </Card>
          ))}
        </div>
      </div>
    </main>
  );
}

// =============================================================
// Top bar
// =============================================================
function TopBar({
  title, subtitle, onSignOut, onBack,
}: { title: string; subtitle?: string; onSignOut: () => void; onBack?: () => void }) {
  return (
    <header className="border-b border-border bg-card/40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> Refineries
            </Button>
          )}
          <div className="h-9 w-9 rounded-md bg-ember/15 border border-ember/40 flex items-center justify-center shrink-0">
            <Scale className="h-4 w-4 text-ember" />
          </div>
          <div className="min-w-0">
            <p className="font-display text-xs sm:text-sm tracking-[0.18em] sm:tracking-[0.25em] truncate">ATHER DESK · {title}</p>
            {subtitle && <p className="text-xs text-muted-foreground truncate">{subtitle}</p>}
          </div>

        </div>
        <Button variant="ghost" size="sm" onClick={onSignOut}>
          <LogOut className="h-4 w-4 mr-1" /> Sign out
        </Button>
      </div>
    </header>
  );
}

// =============================================================
// Shell with tabs
// =============================================================
function RefineryShell({
  refinery, assignment, tab, action, txId, onTab, onAction, onBack, onSignOut,
}: {
  refinery: Refinery;
  assignment: RefineryAssignment;
  tab: Tab;
  action?: "new" | "edit";
  txId?: string;
  onTab: (t: Tab) => void;
  onAction: (action: "new" | "edit" | undefined, txId: string | undefined) => void;
  onBack?: () => void;
  onSignOut: () => void;
}) {
  const showTxForm = tab === "transactions" && (action === "new" || action === "edit");
  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar title={refinery.name.toUpperCase()} subtitle="" onSignOut={onSignOut} onBack={onBack} />
      <nav className="border-b border-border bg-card/20">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 flex gap-1 overflow-x-auto">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => onTab(t.id)}
              className={`px-3 sm:px-4 py-3 text-sm tracking-wide border-b-2 transition-colors whitespace-nowrap ${
                tab === t.id
                  ? "border-ember text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </nav>
      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-6 sm:py-8">
        {showTxForm ? (
          <TransactionFormPage
            refinery={refinery}
            editingId={action === "edit" ? txId ?? null : null}
            onClose={() => onAction(undefined, undefined)}
            onSaved={() => onAction(undefined, undefined)}
          />
        ) : (
          <>
            {tab === "dashboard" && <DashboardTab refinery={refinery} onTab={onTab} />}
            {tab === "clients" && <ClientsTab refinery={refinery} assignment={assignment} />}
            {tab === "transactions" && (
              <TransactionsTab refinery={refinery} assignment={assignment} onAction={onAction} />
            )}
            {tab === "stock" && <StockTab refinery={refinery} />}
            {tab === "profile" && <ProfileTab />}
          </>
        )}
      </div>
    </main>
  );
}

// =============================================================
// Dashboard tab
// =============================================================
function DashboardTab({ refinery, onTab }: { refinery: Refinery; onTab: (t: Tab) => void }) {
  type Dash = Awaited<ReturnType<typeof getDashboard>>;
  const [data, setData] = useState<Dash | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getDashboard({ data: { refineryId: refinery.id } });
      setData(d as Dash);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [refinery.id]);

  useEffect(() => { load(); }, [load]);

  if (loading || !data) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-8">
      <header>
        <h1 className="font-display text-2xl">Dashboard</h1>
        <p className="text-sm text-muted-foreground">{refinery.name} overview</p>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Coins className="h-4 w-4" />} label="Pure Gold Stock" value={fmtG(Number(data.stock.pure_gold_stock))} />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="DA Stock" value={fmtDA(Number(data.stock.da_stock))} />
        <StatCard label="Total clients" value={String(data.totalClients)} />
        <StatCard label="Today's tx" value={String(data.todayCount)} />
        <StatCard label="Negative purity" value={String(data.negativePurity)} tone={data.negativePurity > 0 ? "warn" : undefined} />
        <StatCard label="Negative DA" value={String(data.negativeDa)} tone={data.negativeDa > 0 ? "warn" : undefined} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} label="Received gold today" value={fmtG(data.todayReceivedGold)} />
        <StatCard icon={<TrendingDown className="h-4 w-4 text-destructive" />} label="Delivered gold today" value={fmtG(data.todayDeliveredGold)} />
        <StatCard icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} label="Received DA today" value={fmtDA(data.todayReceivedDa)} />
        <StatCard icon={<TrendingDown className="h-4 w-4 text-destructive" />} label="Delivered DA today" value={fmtDA(data.todayDeliveredDa)} />
      </div>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Clients with negative balances
          </h2>
          <Button size="sm" variant="ghost" onClick={() => onTab("clients")}>View all</Button>
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Purity</th>
                  <th className="p-3 text-right">DA</th>
                </tr>
              </thead>
              <tbody>
                {data.negativeClients.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No negative balances</td></tr>
                )}
                {data.negativeClients.map((c) => (
                  <tr key={c.id} className="border-b border-border last:border-0">
                    <td className="p-3">{c.name}</td>
                    <td className={`p-3 text-right tabular-nums ${balClass(Number(c.purity_balance))}`}>{signed(Number(c.purity_balance), fmtG)}</td>
                    <td className={`p-3 text-right tabular-nums ${balClass(Number(c.da_balance))}`}>{signed(Number(c.da_balance), fmtDA)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg">Recent transactions</h2>
          <Button size="sm" variant="ghost" onClick={() => onTab("transactions")}>View all</Button>
        </div>
        <Card>
          <RecentTxTable rows={data.recent} />
        </Card>
      </section>
    </div>
  );
}

function StatCard({ icon, label, value, tone }: { icon?: React.ReactNode; label: string; value: string; tone?: "warn" }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`text-xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-500" : ""}`}>{value}</p>
    </Card>
  );
}

function RecentTxTable({ rows }: { rows: Array<RefineryTransaction & { client_name?: string }> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead className="border-b border-border bg-muted/20">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            <th className="p-3">Date</th>
            <th className="p-3">#</th>
            <th className="p-3">Client</th>
            <th className="p-3">Dir</th>
            <th className="p-3">Type</th>
            <th className="p-3 text-right">Gold</th>
            <th className="p-3 text-right">DA</th>
            <th className="p-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No transactions</td></tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="p-3 text-muted-foreground">{t.transaction_date}</td>
              <td className="p-3 font-mono text-xs">{t.transaction_number}</td>
              <td className="p-3">{t.client_name}</td>
              <td className="p-3 capitalize">{t.direction}</td>
              <td className="p-3 uppercase">{t.transaction_type}</td>
              <td className="p-3 text-right tabular-nums">{t.transaction_type === "gold" ? fmtG(Number(t.total_pure_weight)) : "—"}</td>
              <td className="p-3 text-right tabular-nums">{t.transaction_type === "da" ? fmtDA(Number(t.da_amount)) : (Number(t.total_refining_fee) > 0 ? fmtDA(Number(t.total_refining_fee)) : "—")}</td>
              <td className="p-3"><StatusBadge status={t.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "settled" ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/40" :
    status === "pending" ? "bg-amber-500/15 text-amber-500 border-amber-500/40" :
    status === "cancelled" ? "bg-destructive/15 text-destructive border-destructive/40" :
    "bg-muted text-muted-foreground border-border";
  return <Badge variant="outline" className={`uppercase text-[10px] tracking-wider ${cls}`}>{status}</Badge>;
}

// =============================================================
// Clients tab
// =============================================================
function ClientsTab({ refinery, assignment }: { refinery: Refinery; assignment: RefineryAssignment }) {
  const [clients, setClients] = useState<RefineryClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RefineryClient | null>(null);
  const readOnly = assignment.role === "viewer" && !assignment.isAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listClients({ data: { refineryId: refinery.id } });
      setClients(r);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [refinery.id]);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Clients</h1>
          <p className="text-sm text-muted-foreground">{clients.length} client(s) in {refinery.name}</p>
        </div>
        {!readOnly && (
          <Button onClick={() => { setEditing(null); setOpen(true); }} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" /> New client
          </Button>
        )}
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[760px]">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="p-3">Client</th>
                <th className="p-3">Phone</th>
                <th className="p-3 text-right">Purity</th>
                <th className="p-3 text-right">DA</th>
                <th className="p-3 text-right">Fee/g</th>
                <th className="p-3">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && clients.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No clients yet</td></tr>
              )}
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(Number(c.purity_balance))}`}>{signed(Number(c.purity_balance), fmtG)}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(Number(c.da_balance))}`}>{signed(Number(c.da_balance), fmtDA)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtDA(Number(c.refining_fee_price))}</td>
                  <td className="p-3"><StatusBadge status={c.status} /></td>
                  <td className="p-3 text-right">
                    {!readOnly && (
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <ClientDialog
          refineryId={refinery.id}
          editing={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function ClientDialog({
  refineryId, editing, onClose, onSaved,
}: { refineryId: string; editing: RefineryClient | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(editing?.name ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [purity, setPurity] = useState(String(editing?.purity_balance ?? 0));
  const [da, setDa] = useState(String(editing?.da_balance ?? 0));
  const [fee, setFee] = useState(String(editing?.refining_fee_price ?? 0));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [status, setStatus] = useState<"active" | "inactive">((editing?.status as "active" | "inactive") ?? "active");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateClient({ data: {
          id: editing.id, name: name.trim(), phone: phone || null,
          refining_fee_price: Number(fee) || 0, notes: notes || null, status,
        }});
        const newPurity = Number(purity) || 0;
        const newDa = Number(da) || 0;
        if (newPurity !== Number(editing.purity_balance) || newDa !== Number(editing.da_balance)) {
          await adjustClientBalances({ data: { id: editing.id, purity_balance: newPurity, da_balance: newDa } });
        }
        toast.success("Client updated");
      } else {
        await createClient({ data: {
          refinery_id: refineryId, name: name.trim(), phone: phone || null,
          purity_balance: Number(purity) || 0, da_balance: Number(da) || 0,
          refining_fee_price: Number(fee) || 0, notes: notes || null, status,
        }});
        toast.success("Client created");
      }
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-lg w-[calc(100vw-1.5rem)] sm:w-full max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{editing ? "Edit client" : "New client"}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Name *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={phone ?? ""} onChange={(e) => setPhone(e.target.value)} placeholder="+213…" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>{editing ? "Purity balance (g)" : "Initial purity balance (g)"}</Label>
              <Input type="number" step="any" value={purity} onChange={(e) => setPurity(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>{editing ? "DA balance" : "Initial DA balance"}</Label>
              <Input type="number" step="any" value={da} onChange={(e) => setDa(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Refining fee price (DA/g)</Label>
            <Input type="number" step="any" value={fee} onChange={(e) => setFee(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Transactions tab
// =============================================================
function TransactionsTab({
  refinery, assignment, onAction,
}: {
  refinery: Refinery;
  assignment: RefineryAssignment;
  onAction: (action: "new" | "edit" | undefined, txId: string | undefined) => void;
}) {
  const [rows, setRows] = useState<RefineryTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewing, setViewing] = useState<string | null>(null);
  const readOnly = assignment.role === "viewer" && !assignment.isAdmin;
  const canDelete = assignment.isAdmin || assignment.role === "manager";

  const load = useCallback(async () => {
    setLoading(true);
    try { setRows(await listTransactions({ data: { refineryId: refinery.id } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [refinery.id]);
  useEffect(() => { load(); }, [load]);

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this transaction? Balances and stock will be reversed.")) return;
    try { await deleteTransaction({ data: { id } }); toast.success("Transaction deleted"); load(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Transactions</h1>
          <p className="text-sm text-muted-foreground">{rows.length} transaction(s)</p>
        </div>
        {!readOnly && (
          <Button onClick={() => onAction("new", undefined)} className="w-full sm:w-auto">
            <Plus className="h-4 w-4 mr-1" /> New transaction
          </Button>
        )}
      </div>

      {/* Mobile: card list */}
      <div className="space-y-2 md:hidden">
        {loading && <p className="text-sm text-muted-foreground text-center py-6">Loading…</p>}
        {!loading && rows.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-6">No transactions yet</p>
        )}
        {rows.map((t) => (
          <Card key={t.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs">{t.transaction_number}</span>
                  <StatusBadge status={t.status} />
                </div>
                <p className="text-sm font-medium truncate mt-1">{t.client_name}</p>
                <p className="text-xs text-muted-foreground">
                  {t.transaction_date} · <span className="capitalize">{t.direction}</span> · <span className="uppercase">{t.transaction_type}</span>
                </p>
                <div className="mt-2 text-sm tabular-nums">
                  {t.transaction_type === "gold" ? (
                    <>Gross {fmtG(Number(t.total_gross_weight))} · Pure {fmtG(Number(t.total_pure_weight))}</>
                  ) : (
                    <>DA {fmtDA(Number(t.da_amount))}</>
                  )}
                  {Number(t.total_refining_fee) > 0 && <> · Fee {fmtDA(Number(t.total_refining_fee))}</>}
                </div>
              </div>
            </div>
            <div className="flex gap-1 mt-3 pt-3 border-t border-border/60">
              <Button size="sm" variant="ghost" className="flex-1" onClick={() => setViewing(t.id)}>
                <FileText className="h-3.5 w-3.5 mr-1" /> Receipt
              </Button>
              {!readOnly && t.status !== "cancelled" && (
                <Button size="sm" variant="ghost" className="flex-1" onClick={() => onAction("edit", t.id)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                </Button>
              )}
              {canDelete && (
                <Button size="sm" variant="ghost" className="flex-1 text-destructive" onClick={() => handleDelete(t.id)}>
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              )}
            </div>
          </Card>
        ))}
      </div>

      {/* Desktop: table */}
      <Card className="hidden md:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3 whitespace-nowrap">Date</th>
                <th className="p-3 whitespace-nowrap">#</th>
                <th className="p-3 whitespace-nowrap">Client</th>
                <th className="p-3 whitespace-nowrap">Dir</th>
                <th className="p-3 whitespace-nowrap">Type</th>
                <th className="p-3 text-right whitespace-nowrap">Gross</th>
                <th className="p-3 text-right whitespace-nowrap">Pure</th>
                <th className="p-3 text-right whitespace-nowrap">DA</th>
                <th className="p-3 text-right whitespace-nowrap">Fee</th>
                <th className="p-3 whitespace-nowrap">Status</th>
                <th className="p-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={11} className="p-6 text-center text-muted-foreground">No transactions yet</td></tr>
              )}
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{t.transaction_date}</td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{t.transaction_number}</td>
                  <td className="p-3 whitespace-nowrap">{t.client_name}</td>
                  <td className="p-3 capitalize whitespace-nowrap">{t.direction}</td>
                  <td className="p-3 uppercase whitespace-nowrap">{t.transaction_type}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{t.transaction_type === "gold" ? fmtG(Number(t.total_gross_weight)) : "—"}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{t.transaction_type === "gold" ? fmtG(Number(t.total_pure_weight)) : "—"}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{t.transaction_type === "da" ? fmtDA(Number(t.da_amount)) : "—"}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{Number(t.total_refining_fee) > 0 ? fmtDA(Number(t.total_refining_fee)) : "—"}</td>
                  <td className="p-3 whitespace-nowrap"><StatusBadge status={t.status} /></td>
                  <td className="p-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(t.id)} title="View receipt"><FileText className="h-3.5 w-3.5" /></Button>
                      {!readOnly && t.status !== "cancelled" && (
                        <Button size="sm" variant="ghost" onClick={() => onAction("edit", t.id)} title="Edit"><Pencil className="h-3.5 w-3.5" /></Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(t.id)} title="Delete">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {viewing && (
        <TransactionReceiptDialog refinery={refinery} txId={viewing} onClose={() => setViewing(null)} />
      )}
    </div>
  );
}

// =============================================================
// New transaction dialog
// =============================================================
type Bar = { item_number: string; item_type: "bar" | "scrap"; gross_weight: string; purity: string };

function TransactionFormPage({
  refinery, editingId, onClose, onSaved,
}: { refinery: Refinery; editingId: string | null; onClose: () => void; onSaved: () => void }) {
  const isEdit = Boolean(editingId);
  const [clients, setClients] = useState<RefineryClient[]>([]);
  const [clientId, setClientId] = useState<string>("");
  const [direction, setDirection] = useState<RefineryDirection>("receiving");
  const [type, setType] = useState<RefineryTxType>("gold");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [daAmount, setDaAmount] = useState("");
  const [feePrice, setFeePrice] = useState("");
  const [bars, setBars] = useState<Bar[]>([{ item_number: "1", item_type: "bar", gross_weight: "", purity: "" }]);
  const [saving, setSaving] = useState(false);
  const [loadingExisting, setLoadingExisting] = useState(isEdit);

  useEffect(() => {
    listClients({ data: { refineryId: refinery.id } })
      .then((rs) => setClients(rs))
      .catch(() => {});
  }, [refinery.id]);

  useEffect(() => {
    if (!editingId) return;
    getTransaction({ data: { id: editingId } }).then((t) => {
      const tx = t as RefineryTransaction;
      setClientId(tx.client_id);
      setDirection(tx.direction);
      setType(tx.transaction_type);
      setDate(tx.transaction_date);
      setNotes(tx.notes ?? "");
      setDaAmount(String(tx.da_amount ?? ""));
      setFeePrice(String(tx.fee_price ?? ""));
      const existingBars = (tx.bars ?? []).map((b, i) => ({
        item_number: b.item_number ?? String(i + 1),
        item_type: b.item_type,
        gross_weight: String(b.gross_weight),
        purity: String(b.purity),
      }));
      if (existingBars.length > 0) setBars(existingBars);
      setLoadingExisting(false);
    }).catch((err) => { toast.error(err instanceof Error ? err.message : "Load failed"); setLoadingExisting(false); });
  }, [editingId]);


  const client = clients.find((c) => c.id === clientId);
  useEffect(() => {
    if (!isEdit && client && !feePrice) setFeePrice(String(client.refining_fee_price));
  }, [client, feePrice, isEdit]);

  const totals = useMemo(() => {
    let gross = 0, pure = 0;
    bars.forEach((b) => {
      const g = Number(b.gross_weight) || 0;
      const p = Number(b.purity) || 0;
      gross += g;
      pure += (g * p) / 1000;
    });
    const avg = gross > 0 ? (pure / gross) * 1000 : 0;
    const feeP = Number(feePrice) || 0;
    return { gross, pure, avg, fee: gross * feeP };
  }, [bars, feePrice]);

  const addBar = () => setBars((bs) => [...bs, { item_number: String(bs.length + 1), item_type: "bar", gross_weight: "", purity: "" }]);
  const rmBar = (i: number) => setBars((bs) => bs.filter((_, idx) => idx !== i));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) { toast.error("Select a client"); return; }
    setSaving(true);
    try {
      type TxPayload = {
        refinery_id: string; client_id: string;
        direction: RefineryDirection; transaction_type: RefineryTxType;
        transaction_date: string; notes: string | null;
        da_amount?: number; fee_price?: number;
        bars?: Array<{ item_number: string | null; item_type: "bar" | "scrap"; gross_weight: number; purity: number }>;
      };
      const payload: TxPayload = {
        refinery_id: refinery.id, client_id: clientId,
        direction, transaction_type: type, transaction_date: date,
        notes: notes || null,
      };
      if (type === "da") {
        payload.da_amount = Number(daAmount) || 0;
      } else {
        if (direction === "receiving") payload.fee_price = Number(feePrice) || 0;
        payload.bars = bars
          .filter((b) => Number(b.gross_weight) > 0 && Number(b.purity) > 0)
          .map((b) => ({
            item_number: b.item_number || null,
            item_type: direction === "delivery" ? "bar" : b.item_type,
            gross_weight: Number(b.gross_weight),
            purity: Number(b.purity),
          }));
      }
      if (isEdit && editingId) {
        await updateTransaction({ data: { ...payload, id: editingId } });
        toast.success("Transaction updated");
      } else {
        await createTransaction({ data: payload });
        toast.success("Transaction saved");
      }
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  if (loadingExisting) {
    return <p className="text-sm text-muted-foreground py-8 text-center">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <h1 className="font-display text-xl sm:text-2xl truncate">
            {isEdit ? "Edit transaction" : "New transaction"}
          </h1>
        </div>
      </div>
      <Card className="p-4 sm:p-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

            <div className="space-y-2">
              <Label>Direction</Label>
              <Select value={direction} onValueChange={(v) => setDirection(v as RefineryDirection)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receiving">Receiving</SelectItem>
                  <SelectItem value="delivery">Delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as RefineryTxType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="da">DA</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Client *</Label>
              <Select value={clientId} onValueChange={setClientId}>
                <SelectTrigger><SelectValue placeholder="Select client" /></SelectTrigger>
                <SelectContent>
                  {clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          {client && (
            <Card className="p-3 bg-muted/20">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Purity balance: <span className={`tabular-nums ${balClass(Number(client.purity_balance))}`}>{signed(Number(client.purity_balance), fmtG)}</span></div>
                <div>DA balance: <span className={`tabular-nums ${balClass(Number(client.da_balance))}`}>{signed(Number(client.da_balance), fmtDA)}</span></div>
              </div>
            </Card>
          )}

          {type === "da" && (
            <div className="space-y-2">
              <Label>DA amount *</Label>
              <Input type="number" step="any" min="0" value={daAmount} onChange={(e) => setDaAmount(e.target.value)} required />
            </div>
          )}

          {type === "gold" && (
            <div className="space-y-3">
              {direction === "receiving" && (
                <div className="space-y-2">
                  <Label>Refining fee price (DA/g)</Label>
                  <Input type="number" step="any" min="0" value={feePrice} onChange={(e) => setFeePrice(e.target.value)} />
                </div>
              )}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Gold bars</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addBar}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add gold bar
                  </Button>
                </div>
                <Card>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm min-w-[560px]">
                      <thead className="bg-muted/20 border-b border-border">
                        <tr className="text-xs uppercase tracking-wider text-muted-foreground text-left">
                          <th className="p-2">#</th>
                          <th className="p-2 text-right">Gross (g)</th>
                          <th className="p-2 text-right">Purity</th>
                          <th className="p-2 text-right">Pure (g)</th>
                          <th className="p-2"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bars.map((b, i) => {
                          const g = Number(b.gross_weight) || 0;
                          const p = Number(b.purity) || 0;
                          const pure = (g * p) / 1000;
                          return (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="p-1.5"><Input className="h-8 w-16" value={b.item_number} onChange={(e) => setBars((bs) => bs.map((x, j) => j === i ? { ...x, item_number: e.target.value } : x))} /></td>
                              <td className="p-1.5"><Input className="h-8 text-right tabular-nums" type="number" step="any" value={b.gross_weight} onChange={(e) => setBars((bs) => bs.map((x, j) => j === i ? { ...x, gross_weight: e.target.value } : x))} /></td>
                              <td className="p-1.5"><Input className="h-8 text-right tabular-nums" type="number" step="any" max="1000" value={b.purity} onChange={(e) => setBars((bs) => bs.map((x, j) => j === i ? { ...x, purity: e.target.value } : x))} /></td>
                              <td className="p-1.5 text-right tabular-nums text-muted-foreground">{fmtG(pure)}</td>
                              <td className="p-1.5 text-right">
                                <Button type="button" size="sm" variant="ghost" onClick={() => rmBar(i)} disabled={bars.length === 1}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                      <tfoot className="bg-muted/10 border-t border-border">
                        <tr className="text-sm">
                          <td className="p-2 text-xs uppercase tracking-wider text-muted-foreground" colSpan={2}>Totals</td>
                          <td className="p-2 text-right tabular-nums">{fmtG(totals.gross)}</td>
                          <td className="p-2 text-right tabular-nums text-muted-foreground">avg {fmtPurity(totals.avg)}</td>
                          <td className="p-2 text-right tabular-nums font-semibold">{fmtG(totals.pure)}</td>
                          <td></td>
                        </tr>
                        {direction === "receiving" && (
                          <tr className="text-sm">
                            <td className="p-2 text-xs uppercase tracking-wider text-muted-foreground" colSpan={4}>Total refining fee</td>
                            <td className="p-2 text-right tabular-nums font-semibold">{fmtDA(totals.fee)}</td>
                            <td></td>
                          </tr>
                        )}
                      </tfoot>
                    </table>
                  </div>
                </Card>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Saving…" : isEdit ? "Save changes" : "Create transaction"}</Button>
          </div>
        </form>
      </Card>
    </div>
  );
}

// =============================================================
// Receipt dialog
// =============================================================
function TransactionReceiptDialog({
  refinery, txId, onClose,
}: { refinery: Refinery; txId: string; onClose: () => void }) {
  const [tx, setTx] = useState<RefineryTransaction | null>(null);

  useEffect(() => {
    getTransaction({ data: { id: txId } }).then((t) => setTx(t as RefineryTransaction)).catch(() => {});
  }, [txId]);

  const exportPng = async (share: "download" | "whatsapp") => {
    const node = document.getElementById(`receipt-${txId}`);
    if (!node) return;
    const canvas = await html2canvas(node, { backgroundColor: "#1a1a1a", scale: 3 });
    const blob: Blob | null = await new Promise((r) => canvas.toBlob((b) => r(b), "image/png"));
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    if (share === "download") {
      const a = document.createElement("a");
      a.href = url; a.download = `receipt-${tx?.transaction_number ?? txId}.png`; a.click();
    }
    if (share === "whatsapp" && tx) {
      const msg = encodeURIComponent(
        `Hello ${tx.client_name ?? ""}, here is your refinery transaction receipt.\n` +
        `Transaction: ${tx.transaction_number}\n` +
        `Direction: ${tx.direction}\nType: ${tx.transaction_type}\n` +
        (tx.transaction_type === "gold" ? `Total pure gold: ${fmtG(Number(tx.total_pure_weight))}\n` : "") +
        (tx.transaction_type === "da" ? `DA amount: ${fmtDA(Number(tx.da_amount))}\n` : "") +
        (Number(tx.total_refining_fee) > 0 ? `Refining fee: ${fmtDA(Number(tx.total_refining_fee))}\n` : "") +
        (tx.new_purity_balance != null ? `New purity balance: ${fmtG(Number(tx.new_purity_balance))}\n` : "") +
        (tx.new_da_balance != null ? `New DA balance: ${fmtDA(Number(tx.new_da_balance))}\n` : "")
      );
      const phone = (tx.client_phone ?? "").replace(/[^\d]/g, "");
      window.open(`https://wa.me/${phone}?text=${msg}`, "_blank");
    }
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto w-[calc(100vw-1.5rem)] sm:w-full">
        <DialogHeader><DialogTitle>Transaction receipt</DialogTitle></DialogHeader>
        {!tx ? <p className="text-muted-foreground text-sm">Loading…</p> : (
          <>
            <div id={`receipt-${txId}`} className="rounded-lg border border-border p-6 bg-card text-card-foreground space-y-4">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <p className="font-display text-lg tracking-wide">ATHER GROUP</p>
                  <p className="text-xs text-muted-foreground uppercase tracking-[0.18em]">{refinery.name}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">{tx.transaction_number}</p>
                  <p className="text-xs text-muted-foreground">{tx.transaction_date}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Client</p><p>{tx.client_name}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Phone</p><p>{tx.client_phone ?? "—"}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Direction</p><p className="capitalize">{tx.direction}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Type</p><p className="uppercase">{tx.transaction_type}</p></div>
                <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p><p><StatusBadge status={tx.status} /></p></div>
              </div>

              {tx.transaction_type === "da" && (
                <div className="border-t border-border pt-3 text-sm">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">DA amount</p>
                  <p className="text-xl tabular-nums">{fmtDA(Number(tx.da_amount))}</p>
                </div>
              )}

              {tx.transaction_type === "gold" && tx.bars && tx.bars.length > 0 && (
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Gold bars</p>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground">
                      <tr className="text-left"><th className="py-1">#</th><th className="text-right">Gross</th><th className="text-right">Purity</th><th className="text-right">Pure</th></tr>
                    </thead>
                    <tbody>
                      {tx.bars.map((b, i) => (
                        <tr key={i} className="border-t border-border/50">
                          <td className="py-1">{b.item_number ?? i + 1}</td>
                          <td className="text-right tabular-nums">{fmtG(Number(b.gross_weight))}</td>
                          <td className="text-right tabular-nums">{fmtPurity(Number(b.purity))}</td>
                          <td className="text-right tabular-nums">{fmtG(Number(b.pure_weight))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <div className="grid grid-cols-3 gap-3 text-sm mt-3 pt-3 border-t border-border">
                    <div><p className="text-xs text-muted-foreground">Total gross</p><p className="tabular-nums">{fmtG(Number(tx.total_gross_weight))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Total pure</p><p className="tabular-nums">{fmtG(Number(tx.total_pure_weight))}</p></div>
                    <div><p className="text-xs text-muted-foreground">Avg purity</p><p className="tabular-nums">{fmtPurity(Number(tx.average_purity))}</p></div>
                  </div>
                  {tx.direction === "receiving" && Number(tx.total_refining_fee) > 0 && (
                    <div className="grid grid-cols-2 gap-3 text-sm mt-3">
                      <div><p className="text-xs text-muted-foreground">Fee price</p><p className="tabular-nums">{fmtDA(Number(tx.fee_price))}/g</p></div>
                      <div><p className="text-xs text-muted-foreground">Total refining fee</p><p className="tabular-nums">{fmtDA(Number(tx.total_refining_fee))}</p></div>
                    </div>
                  )}
                </div>
              )}

              {tx.status === "settled" && (
                <div className="border-t border-border pt-3 grid grid-cols-2 gap-3 text-sm">
                  <div><p className="text-xs text-muted-foreground">Prev purity</p><p className={`tabular-nums ${balClass(Number(tx.previous_purity_balance ?? 0))}`}>{signed(Number(tx.previous_purity_balance ?? 0), fmtG)}</p></div>
                  <div><p className="text-xs text-muted-foreground">New purity</p><p className={`tabular-nums ${balClass(Number(tx.new_purity_balance ?? 0))}`}>{signed(Number(tx.new_purity_balance ?? 0), fmtG)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Prev DA</p><p className={`tabular-nums ${balClass(Number(tx.previous_da_balance ?? 0))}`}>{signed(Number(tx.previous_da_balance ?? 0), fmtDA)}</p></div>
                  <div><p className="text-xs text-muted-foreground">New DA</p><p className={`tabular-nums ${balClass(Number(tx.new_da_balance ?? 0))}`}>{signed(Number(tx.new_da_balance ?? 0), fmtDA)}</p></div>
                </div>
              )}
              {tx.notes && (
                <div className="border-t border-border pt-3 text-sm">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider">Notes</p>
                  <p>{tx.notes}</p>
                </div>
              )}
            </div>
            <DialogFooter className="gap-2 flex-col sm:flex-row">
              <Button variant="outline" onClick={() => exportPng("download")} className="w-full sm:w-auto">
                <ImageIcon className="h-4 w-4 mr-1" /> Download image
              </Button>
              <Button onClick={() => exportPng("whatsapp")} className="w-full sm:w-auto">
                <Share2 className="h-4 w-4 mr-1" /> Share on WhatsApp
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Stock tab
// =============================================================
function StockTab({ refinery }: { refinery: Refinery }) {
  type Stock = { pure_gold_stock: number; da_stock: number };
  type Movement = {
    id: string; created_at: string; movement_type: string;
    gold_change: number; da_change: number;
    gold_stock_before: number; gold_stock_after: number;
    da_stock_before: number; da_stock_after: number;
    client?: { name: string } | null;
    transaction?: { transaction_number: string; direction: string; transaction_type: string } | null;
  };
  const [stock, setStock] = useState<Stock | null>(null);
  const [moves, setMoves] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const load = useCallback(async () => {
    try {
      const [s, m] = await Promise.all([
        getStock({ data: { refineryId: refinery.id } }),
        listStockMovements({ data: { refineryId: refinery.id } }),
      ]);
      setStock(s as Stock);
      setMoves(m as Movement[]);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [refinery.id]);
  useEffect(() => { load(); }, [load]);

  if (loading || !stock) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Stock</h1>
          <p className="text-sm text-muted-foreground">{refinery.name}</p>
        </div>
        <Button onClick={() => setAdjustOpen(true)} className="w-full sm:w-auto">
          <Pencil className="h-4 w-4 mr-2" /> Adjust stock
        </Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <StatCard icon={<Coins className="h-4 w-4 text-ember" />} label="Pure Gold Stock" value={fmtG(Number(stock.pure_gold_stock))} />
        <StatCard icon={<Wallet className="h-4 w-4 text-ember" />} label="DA Stock" value={fmtDA(Number(stock.da_stock))} />
      </div>
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="p-3">Date</th>
                <th className="p-3">#</th>
                <th className="p-3">Client</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Gold Δ</th>
                <th className="p-3 text-right">DA Δ</th>
                <th className="p-3 text-right">Gold after</th>
                <th className="p-3 text-right">DA after</th>
              </tr>
            </thead>
            <tbody>
              {moves.length === 0 && (
                <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No movements</td></tr>
              )}
              {moves.map((m) => (
                <tr key={m.id} className="border-b border-border last:border-0">
                  <td className="p-3 text-muted-foreground">{new Date(m.created_at).toLocaleString()}</td>
                  <td className="p-3 font-mono text-xs">{m.transaction?.transaction_number ?? "—"}</td>
                  <td className="p-3">{m.client?.name ?? "—"}</td>
                  <td className="p-3 text-xs uppercase tracking-wider text-muted-foreground">{m.movement_type.replace("_", " ")}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(Number(m.gold_change))}`}>{Number(m.gold_change) !== 0 ? signed(Number(m.gold_change), fmtG) : "—"}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(Number(m.da_change))}`}>{Number(m.da_change) !== 0 ? signed(Number(m.da_change), fmtDA) : "—"}</td>
                  <td className="p-3 text-right tabular-nums">{fmtG(Number(m.gold_stock_after))}</td>
                  <td className="p-3 text-right tabular-nums">{fmtDA(Number(m.da_stock_after))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
      {adjustOpen && (
        <AdjustStockDialog
          refineryId={refinery.id}
          currentGold={Number(stock.pure_gold_stock)}
          currentDa={Number(stock.da_stock)}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => { setAdjustOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function AdjustStockDialog({
  refineryId, currentGold, currentDa, onClose, onSaved,
}: {
  refineryId: string; currentGold: number; currentDa: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [gold, setGold] = useState(String(currentGold));
  const [da, setDa] = useState(String(currentDa));
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const g = Number(gold); const d = Number(da);
    if (!Number.isFinite(g) || g < 0 || !Number.isFinite(d) || d < 0) {
      toast.error("Stock values must be zero or positive");
      return;
    }
    setSaving(true);
    try {
      await adjustStock({ data: { refineryId, pure_gold_stock: g, da_stock: d, notes: notes || null } });
      toast.success("Stock adjusted");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] sm:w-full">
        <DialogHeader><DialogTitle>Adjust stock</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Set the absolute stock values. A movement record will be created for the difference.
          </p>
          <div className="space-y-2">
            <Label>Pure gold stock (g)</Label>
            <Input type="number" step="any" min="0" value={gold} onChange={(e) => setGold(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>DA stock</Label>
            <Input type="number" step="any" min="0" value={da} onChange={(e) => setDa(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Initial stock, recount, correction…" />
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Profile tab
// =============================================================
function ProfileTab() {
  type Profile = Awaited<ReturnType<typeof getMyRefineryProfile>>;
  const [p, setP] = useState<Profile | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getMyRefineryProfile().then((r) => {
      setP(r as Profile);
      setName((r as Profile).display_name ?? "");
      setPhone((r as Profile).phone ?? "");
    });
  }, []);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateMyRefineryProfile({ data: {
        display_name: name || null,
        phone: phone || null,
        password: password || undefined,
      }});
      toast.success("Profile updated");
      setPassword("");
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  if (!p) return <p className="text-muted-foreground text-sm">Loading…</p>;

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <h1 className="font-display text-2xl">Profile</h1>
        <p className="text-sm text-muted-foreground">Update your account details</p>
      </div>
      <Card className="p-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 text-sm">
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Email</p><p>{p.email ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Username</p><p>{p.username ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Role</p><p className="capitalize">{p.isAdmin ? "admin" : p.role ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Refinery</p><p>{p.refinery_name ?? "—"}</p></div>
          <div><p className="text-xs text-muted-foreground uppercase tracking-wider">Status</p><p className="capitalize">{p.status}</p></div>
        </div>

        <form onSubmit={submit} className="space-y-4 border-t border-border pt-6">
          <div className="space-y-2"><Label>Display name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div className="space-y-2"><Label>Phone</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} /></div>
          <div className="space-y-2"><Label>New password (leave blank to keep current)</Label><Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" /></div>
          <Button type="submit" disabled={saving}>{saving ? "Saving…" : "Save changes"}</Button>
        </form>
      </Card>
    </div>
  );
}
