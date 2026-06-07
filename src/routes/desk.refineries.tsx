import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
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
  createSettlement, getSettlement,
  getStock, listStockMovements, getDashboard, adjustStock, updateStockAdjustment, deleteStockAdjustment,
  createStockAdjustment, type StockAdjustmentMetal, type StockAdjustmentKind,
  getMyRefineryProfile, updateMyRefineryProfile,
  getAccountStatement, logRefineryReport, listRefineryReportHistory,
  type Refinery, type RefineryClient, type RefineryTransaction,
  type RefineryAssignment, type RefineryDirection, type RefineryTxType,
  type AccountStatement, type SettlementPair,
} from "@/lib/refineries.functions";
import { createRoot } from "react-dom/client";
import jsPDF from "jspdf";
import { AccountStatementReport } from "@/components/refineries/AccountStatement";
import { TransactionReceiptReport } from "@/components/refineries/TransactionReceipt";
import { SettlementReceiptReport } from "@/components/refineries/SettlementReceipt";
import { Download, History as HistoryIcon, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";


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
const RECEIPT_BUCKET = "refinery-receipts";
const RECEIPT_SIGNED_URL_SECONDS = 60 * 60 * 24 * 7;
const receiptFileName = (receiptNumber: string, extension: "pdf" | "png") =>
  `${receiptNumber.replace(/[^A-Za-z0-9._-]/g, "_")}.${extension}`;

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
  refineries, isAdmin, onSignOut, embedded, onPick,
}: {
  refineries: Refinery[];
  isAdmin: boolean;
  onSignOut: () => void;
  embedded?: boolean;
  onPick?: (refineryId: string) => void;
}) {
  const navigate = useNavigate();
  const pick = (id: string) => {
    if (onPick) onPick(id);
    else navigate({ to: "/desk/refineries", search: { r: id, tab: "dashboard" } });
  };
  const grid = (
    <div className={embedded ? "" : "max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12"}>
      <h1 className="font-display text-3xl mb-2">Refineries</h1>
      <p className="text-sm text-muted-foreground mb-8">
        Choose a refinery to manage its clients, transactions, and stock.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {refineries.map((r) => (
          <Card
            key={r.id}
            className="p-6 cursor-pointer hover:border-ember/60 transition-colors"
            onClick={() => pick(r.id)}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-md bg-ember/15 border border-ember/40 flex items-center justify-center">
                <Scale className="h-5 w-5 text-ember" />
              </div>
              <div>
                <p className="font-display text-lg tracking-wide">{r.name}</p>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">Open dashboard, clients, transactions, and stock.</p>
          </Card>
        ))}
      </div>
    </div>
  );
  if (embedded) return grid;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar title="REFINERIES" subtitle={isAdmin ? "Select a refinery" : ""} onSignOut={onSignOut} />
      {grid}
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
  refinery, assignment, tab, action, txId, onTab, onAction, onBack, onSignOut, embedded,
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
  embedded?: boolean;
}) {
  const showTxForm = tab === "transactions" && (action === "new" || action === "edit");

  const tabsBar = (
    <nav className="border-b border-border bg-card/20">
      <div className={`${embedded ? "" : "max-w-7xl mx-auto"} px-3 sm:px-6 flex items-center gap-1 overflow-x-auto`}>
        {embedded && onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-1 mr-1">
            <ArrowLeft className="h-4 w-4 mr-1" /> Refineries
          </Button>
        )}
        <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto">
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
      </div>
    </nav>
  );

  const body = (
    <div className={`${embedded ? "" : "max-w-7xl mx-auto"} px-3 sm:px-6 py-6 sm:py-8`}>
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
  );

  if (embedded) {
    return (
      <div>
        <div className="mb-4">
          <h1 className="font-display text-2xl">{refinery.name}</h1>
        </div>
        {tabsBar}
        {body}
      </div>
    );
  }

  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar title={refinery.name.toUpperCase()} subtitle="" onSignOut={onSignOut} onBack={onBack} />
      {tabsBar}
      {body}
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
        <StatCard icon={<Coins className="h-4 w-4" />} label="Silver Stock" value={fmtG(Number((data.stock as { silver_stock?: number }).silver_stock ?? 0))} />
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
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">No transactions</td></tr>
          )}
          {rows.map((t) => (
            <tr key={t.id} className="border-b border-border last:border-0">
              <td className="p-3 text-muted-foreground">{t.transaction_date}</td>
              <td className="p-3 font-mono text-xs">{t.transaction_number}</td>
              <td className="p-3">
                {t.client_name}
                {t.transaction_type === "settlement" && t.counterparty_client_name && (
                  <span className="text-xs text-muted-foreground"> {t.settlement_role === "from" ? "→" : "←"} {t.counterparty_client_name}</span>
                )}
              </td>
              <td className="p-3 capitalize">{t.transaction_type === "settlement" ? "—" : t.direction}</td>
              <td className="p-3 uppercase">{t.transaction_type}</td>
              <td className="p-3 text-right tabular-nums">{(t.transaction_type === "gold" || (t.transaction_type === "settlement" && t.settlement_kind === "gold")) ? fmtG(Number(t.total_pure_weight)) : "—"}</td>
              <td className="p-3 text-right tabular-nums">{t.transaction_type === "da" || (t.transaction_type === "settlement" && t.settlement_kind === "da") ? fmtDA(Number(t.da_amount)) : (Number(t.total_refining_fee) > 0 ? fmtDA(Number(t.total_refining_fee)) : "—")}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}



// =============================================================
// Clients tab
// =============================================================
function ClientsTab({ refinery, assignment }: { refinery: Refinery; assignment: RefineryAssignment }) {
  const [clients, setClients] = useState<RefineryClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<RefineryClient | null>(null);
  const [stmtClient, setStmtClient] = useState<RefineryClient | null>(null);
  const readOnly = assignment.role === "viewer" && !assignment.isAdmin;
  const canDelete = assignment.isAdmin || assignment.role === "manager";
  const canStatement = assignment.isAdmin || assignment.role === "manager";

  const handleDelete = async (c: RefineryClient) => {
    if (!confirm(`Delete client "${c.name}"? This cannot be undone.`)) return;
    try {
      await deleteClient({ data: { id: c.id } });
      toast.success("Client deleted");
      load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Delete failed"); }
  };

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
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && clients.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No clients yet</td></tr>
              )}
              {clients.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(Number(c.purity_balance))}`}>{signed(Number(c.purity_balance), fmtG)}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(Number(c.da_balance))}`}>{signed(Number(c.da_balance), fmtDA)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtDA(Number(c.refining_fee_price))}</td>
                  
                  <td className="p-3 text-right">
                    <div className="inline-flex gap-1">
                      {canStatement && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-ember hover:bg-ember/10"
                          onClick={() => setStmtClient(c)}
                          title="Account Statement"
                        >
                          <FileText className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {!readOnly && (
                        <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="sm" variant="ghost" className="text-destructive" onClick={() => handleDelete(c)} title="Delete">
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

      {open && (
        <ClientDialog
          refineryId={refinery.id}
          editing={editing}
          onClose={() => setOpen(false)}
          onSaved={() => { setOpen(false); load(); }}
        />
      )}
      {stmtClient && (
        <AccountStatementDialog
          open
          onClose={() => setStmtClient(null)}
          refinery={refinery}
          client={stmtClient}
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
  // Status field removed from the Refineries module; default all clients to "active" for backend compatibility.
  const status: "active" = "active";
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
                </div>
                <p className="text-sm font-medium truncate mt-1">
                  {t.client_name}
                  {t.transaction_type === "settlement" && t.counterparty_client_name && (
                    <span className="text-xs text-muted-foreground"> {t.settlement_role === "from" ? "→" : "←"} {t.counterparty_client_name}</span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t.transaction_date} · {t.transaction_type === "settlement" ? <span className="uppercase">SETTLEMENT</span> : <><span className="capitalize">{t.direction}</span> · <span className="uppercase">{t.transaction_type}</span></>}
                </p>
                <div className="mt-2 text-sm tabular-nums">
                  {t.transaction_type === "gold" ? (
                    <>Gross {fmtG(Number(t.total_gross_weight))} · Pure {fmtG(Number(t.total_pure_weight))}</>
                  ) : t.transaction_type === "settlement" ? (
                    t.settlement_kind === "gold"
                      ? <>Gold {fmtG(Number(t.settlement_amount ?? 0))}{t.settlement_role === "from" ? " sent" : " received"}</>
                      : <>DA {fmtDA(Number(t.settlement_amount ?? 0))}{t.settlement_role === "from" ? " sent" : " received"}</>
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
              {!readOnly && t.status !== "cancelled" && t.transaction_type !== "settlement" && (
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
                
                <th className="p-3 text-right whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No transactions yet</td></tr>
              )}
              {rows.map((t) => (
                <tr key={t.id} className="border-b border-border last:border-0">
                  <td className="p-3 text-muted-foreground whitespace-nowrap">{t.transaction_date}</td>
                  <td className="p-3 font-mono text-xs whitespace-nowrap">{t.transaction_number}</td>
                  <td className="p-3 whitespace-nowrap">
                    {t.client_name}
                    {t.transaction_type === "settlement" && t.counterparty_client_name && (
                      <span className="text-xs text-muted-foreground"> {t.settlement_role === "from" ? "→" : "←"} {t.counterparty_client_name}</span>
                    )}
                  </td>
                  <td className="p-3 capitalize whitespace-nowrap">{t.transaction_type === "settlement" ? "—" : t.direction}</td>
                  <td className="p-3 uppercase whitespace-nowrap">
                    {t.transaction_type === "settlement"
                      ? <span className="text-ember font-semibold">SETTLEMENT</span>
                      : t.transaction_type}
                  </td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{t.transaction_type === "gold" ? fmtG(Number(t.total_gross_weight)) : "—"}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{(t.transaction_type === "gold" || (t.transaction_type === "settlement" && t.settlement_kind === "gold")) ? fmtG(Number(t.settlement_amount ?? t.total_pure_weight)) : "—"}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{(t.transaction_type === "da" || (t.transaction_type === "settlement" && t.settlement_kind === "da")) ? fmtDA(Number(t.settlement_amount ?? t.da_amount)) : "—"}</td>
                  <td className="p-3 text-right tabular-nums whitespace-nowrap">{Number(t.total_refining_fee) > 0 ? fmtDA(Number(t.total_refining_fee)) : "—"}</td>
                  
                  <td className="p-3 text-right whitespace-nowrap">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setViewing(t.id)} title="View receipt"><FileText className="h-3.5 w-3.5" /></Button>
                      {!readOnly && t.status !== "cancelled" && t.transaction_type !== "settlement" && (
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

  // Settlement-only state
  const [fromClientId, setFromClientId] = useState<string>("");
  const [toClientId, setToClientId] = useState<string>("");
  const [settlementKind, setSettlementKind] = useState<"gold" | "da">("gold");
  const [settlementAmount, setSettlementAmount] = useState<string>("");
  const [applyFee, setApplyFee] = useState<boolean>(false);
  const [settlementFeePrice, setSettlementFeePrice] = useState<string>("");

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
    const w730 = pure > 0 ? (pure * 1000) / 730 : 0; // equivalent weight at 730 purity
    return { gross, pure, avg, w730, fee: w730 * feeP };
  }, [bars, feePrice]);

  // Settlement live preview
  const fromClient = clients.find((c) => c.id === fromClientId);
  const toClient = clients.find((c) => c.id === toClientId);
  useEffect(() => {
    if (type === "settlement" && settlementKind === "gold" && applyFee && toClient && !settlementFeePrice) {
      setSettlementFeePrice(String(toClient.refining_fee_price));
    }
  }, [type, settlementKind, applyFee, toClient, settlementFeePrice]);

  const settlementPreview = useMemo(() => {
    const amt = Number(settlementAmount) || 0;
    const fp = Number(settlementFeePrice) || 0;
    const w730 = settlementKind === "gold" && applyFee && amt > 0 ? (amt * 1000) / 730 : 0;
    const fee = w730 * fp;
    return { amt, fp, w730, fee };
  }, [settlementAmount, settlementFeePrice, settlementKind, applyFee]);

  const addBar = () => setBars((bs) => [...bs, { item_number: String(bs.length + 1), item_type: "bar", gross_weight: "", purity: "" }]);
  const rmBar = (i: number) => setBars((bs) => bs.filter((_, idx) => idx !== i));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      // ----- Settlement branch -----
      if (type === "settlement") {
        if (isEdit) { setSaving(false); toast.error("Settlements cannot be edited; delete and recreate."); return; }
        if (!fromClientId || !toClientId) { setSaving(false); toast.error("Select both clients"); return; }
        if (fromClientId === toClientId) { setSaving(false); toast.error("From and To must be different clients"); return; }
        const amt = Number(settlementAmount);
        if (!(amt > 0)) { setSaving(false); toast.error("Amount must be greater than 0"); return; }
        const fp = Number(settlementFeePrice) || 0;
        if (settlementKind === "gold" && applyFee && !(fp >= 0)) {
          setSaving(false); toast.error("Fee price must be ≥ 0"); return;
        }
        await createSettlement({ data: {
          refinery_id: refinery.id,
          from_client_id: fromClientId,
          to_client_id: toClientId,
          kind: settlementKind,
          amount: amt,
          apply_fee: settlementKind === "gold" ? applyFee : false,
          fee_price: settlementKind === "gold" && applyFee ? fp : 0,
          transaction_date: date,
          notes: notes || null,
        }});
        toast.success("Settlement created");
        onSaved();
        return;
      }

      // ----- Existing Gold / DA branch -----
      if (!clientId) { toast.error("Select a client"); setSaving(false); return; }
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
        if (direction === "receiving") {
          const fp = Number(feePrice);
          if (!(fp >= 0)) { setSaving(false); toast.error("Refining fee price must be ≥ 0"); return; }
          payload.fee_price = fp;
        }
        const validBars = bars.filter((b) => b.gross_weight !== "" || b.purity !== "");
        if (validBars.length === 0) { setSaving(false); toast.error("Add at least one gold bar"); return; }
        for (let i = 0; i < validBars.length; i++) {
          const b = validBars[i];
          const g = Number(b.gross_weight);
          const p = Number(b.purity);
          if (!(g > 0)) { setSaving(false); toast.error(`Bar #${i + 1}: gross weight must be > 0`); return; }
          if (!(p >= 1 && p <= 1000)) { setSaving(false); toast.error(`Bar #${i + 1}: purity must be between 1 and 1000`); return; }
        }
        payload.bars = validBars.map((b) => ({
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
            {type !== "settlement" ? (
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
            ) : (
              <div className="space-y-2">
                <Label>Date</Label>
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </div>
            )}
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => setType(v as RefineryTxType)} disabled={isEdit}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold</SelectItem>
                  <SelectItem value="da">DA</SelectItem>
                  <SelectItem value="settlement">Settlement (Client → Client)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {type !== "settlement" && (
            <>
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
            </>
          )}

          {type === "settlement" && (
            <SettlementFields
              clients={clients}
              fromClientId={fromClientId} setFromClientId={setFromClientId}
              toClientId={toClientId} setToClientId={setToClientId}
              fromClient={fromClient} toClient={toClient}
              kind={settlementKind} setKind={setSettlementKind}
              amount={settlementAmount} setAmount={setSettlementAmount}
              applyFee={applyFee} setApplyFee={setApplyFee}
              feePrice={settlementFeePrice} setFeePrice={setSettlementFeePrice}
              preview={settlementPreview}
            />
          )}

          {type === "da" && (
            <div className="space-y-2">
              <Label>DA amount *</Label>
              <Input type="number" step="any" min="0" value={daAmount} onChange={(e) => setDaAmount(e.target.value)} required />
            </div>
          )}

          {type === "gold" && (
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <Label>Gold bars</Label>
                  <Button type="button" size="sm" variant="outline" onClick={addBar}>
                    <Plus className="h-3.5 w-3.5 mr-1" /> Add gold bar
                  </Button>
                </div>

                {/* Desktop table */}
                <Card className="hidden md:block overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col style={{ width: "56px" }} />
                        <col />
                        <col />
                        <col />
                        {direction === "receiving" && <col />}
                        <col style={{ width: "56px" }} />
                      </colgroup>
                      <thead className="bg-muted/20 border-b border-border">
                        <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                          <th className="p-3 text-left">#</th>
                          <th className="p-3 text-right">Gross Weight (g)</th>
                          <th className="p-3 text-right">Purity</th>
                          <th className="p-3 text-right">Pure Gold (g)</th>
                          {direction === "receiving" && <th className="p-3 text-right">Equivalent @ 730</th>}
                          <th className="p-3"></th>
                        </tr>
                      </thead>
                      <tbody>
                        {bars.map((b, i) => {
                          const g = Number(b.gross_weight) || 0;
                          const p = Number(b.purity) || 0;
                          const pure = (g * p) / 1000;
                          const eq730 = (g * p) / 730;
                          return (
                            <tr key={i} className="border-b border-border last:border-0">
                              <td className="p-2 text-muted-foreground tabular-nums text-center">{i + 1}</td>
                              <td className="p-2">
                                <Input className="h-9 text-right tabular-nums" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
                                  value={b.gross_weight}
                                  onChange={(e) => setBars((bs) => bs.map((x, j) => j === i ? { ...x, gross_weight: e.target.value } : x))} />
                              </td>
                              <td className="p-2">
                                <Input className="h-9 text-right tabular-nums" type="number" step="0.1" min="1" max="1000" inputMode="decimal" placeholder="0"
                                  value={b.purity}
                                  onChange={(e) => setBars((bs) => bs.map((x, j) => j === i ? { ...x, purity: e.target.value } : x))} />
                              </td>
                              <td className="p-2 text-right tabular-nums">{g > 0 && p > 0 ? fmtG(pure) : <span className="text-muted-foreground">—</span>}</td>
                              {direction === "receiving" && (
                                <td className="p-2 text-right tabular-nums">{g > 0 && p > 0 ? fmtG(eq730) : <span className="text-muted-foreground">—</span>}</td>
                              )}
                              <td className="p-2 text-right">
                                <Button type="button" size="icon" variant="ghost" className="h-8 w-8" onClick={() => rmBar(i)} disabled={bars.length === 1}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </Card>

                {/* Mobile cards */}
                <div className="md:hidden space-y-3">
                  {bars.map((b, i) => {
                    const g = Number(b.gross_weight) || 0;
                    const p = Number(b.purity) || 0;
                    const pure = (g * p) / 1000;
                    const eq730 = (g * p) / 730;
                    return (
                      <Card key={i} className="p-3 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-xs uppercase tracking-wider text-muted-foreground">Bar #{i + 1}</span>
                          <Button type="button" size="icon" variant="ghost" className="h-8 w-8 -mr-1 -mt-1" onClick={() => rmBar(i)} disabled={bars.length === 1}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Gross Weight (g)</Label>
                            <Input className="h-9 text-right tabular-nums" type="number" step="0.01" min="0" inputMode="decimal" placeholder="0.00"
                              value={b.gross_weight}
                              onChange={(e) => setBars((bs) => bs.map((x, j) => j === i ? { ...x, gross_weight: e.target.value } : x))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Purity</Label>
                            <Input className="h-9 text-right tabular-nums" type="number" step="0.1" min="1" max="1000" inputMode="decimal" placeholder="0"
                              value={b.purity}
                              onChange={(e) => setBars((bs) => bs.map((x, j) => j === i ? { ...x, purity: e.target.value } : x))} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs text-muted-foreground">Pure Gold (g)</Label>
                            <div className="h-9 px-3 flex items-center justify-end rounded-md bg-muted/30 border border-border tabular-nums text-sm">
                              {g > 0 && p > 0 ? fmtG(pure) : <span className="text-muted-foreground">—</span>}
                            </div>
                          </div>
                          {direction === "receiving" && (
                            <div className="space-y-1">
                              <Label className="text-xs text-muted-foreground">Equivalent @ 730</Label>
                              <div className="h-9 px-3 flex items-center justify-end rounded-md bg-muted/30 border border-border tabular-nums text-sm">
                                {g > 0 && p > 0 ? fmtG(eq730) : <span className="text-muted-foreground">—</span>}
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Summary box */}
              <Card className="p-4 space-y-2 bg-muted/10">
                <p className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Summary</p>
                <div className="flex items-center justify-between text-sm py-1 border-b border-border/60">
                  <span className="text-muted-foreground">Total Gross Weight</span>
                  <span className="tabular-nums">{fmtG(totals.gross)}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1 border-b border-border/60">
                  <span className="text-muted-foreground">Average Purity</span>
                  <span className="tabular-nums">{fmtPurity(totals.avg)}</span>
                </div>
                <div className="flex items-center justify-between text-sm py-1 border-b border-border/60">
                  <span className="text-muted-foreground">Total Pure Gold</span>
                  <span className="tabular-nums font-semibold">{fmtG(totals.pure)}</span>
                </div>
                {direction === "receiving" && (
                  <div className="flex items-center justify-between text-sm py-1 border-b border-border/60">
                    <span className="text-muted-foreground">Total Equivalent @ 730</span>
                    <span className="tabular-nums font-semibold">{fmtG(totals.w730)}</span>
                  </div>
                )}
                {direction === "receiving" && (
                  <>
                    <div className="flex items-center justify-between gap-3 text-sm py-1 border-b border-border/60">
                      <Label className="text-muted-foreground font-normal whitespace-nowrap">Refining Fee Price (DA/g)</Label>
                      <Input type="number" step="0.01" min="0" inputMode="decimal" className="h-9 w-32 text-right tabular-nums"
                        value={feePrice} onChange={(e) => setFeePrice(e.target.value)} />
                    </div>
                    <div className="flex items-center justify-between text-sm pt-2">
                      <span className="text-muted-foreground">Total Refining Fee</span>
                      <span className="tabular-nums font-semibold text-ember">{fmtDA(totals.fee)}</span>
                    </div>
                  </>
                )}
              </Card>
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
// Settlement form fields
// =============================================================
function SettlementFields({
  clients, fromClientId, setFromClientId, toClientId, setToClientId,
  fromClient, toClient, kind, setKind, amount, setAmount,
  applyFee, setApplyFee, feePrice, setFeePrice, preview,
}: {
  clients: RefineryClient[];
  fromClientId: string; setFromClientId: (s: string) => void;
  toClientId: string; setToClientId: (s: string) => void;
  fromClient?: RefineryClient; toClient?: RefineryClient;
  kind: "gold" | "da"; setKind: (k: "gold" | "da") => void;
  amount: string; setAmount: (s: string) => void;
  applyFee: boolean; setApplyFee: (b: boolean) => void;
  feePrice: string; setFeePrice: (s: string) => void;
  preview: { amt: number; fp: number; w730: number; fee: number };
}) {
  const fromOptions = clients.filter((c) => c.id !== toClientId);
  const toOptions = clients.filter((c) => c.id !== fromClientId);

  const amt = preview.amt;
  const fromGoldImpact = kind === "gold" ? -amt : 0;
  const fromDaImpact = kind === "da" ? -amt : 0;
  const toGoldImpact = kind === "gold" ? amt : 0;
  const toDaImpact = (kind === "da" ? amt : 0) - (kind === "gold" && applyFee ? preview.fee : 0);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>From Client *</Label>
          <Select value={fromClientId} onValueChange={setFromClientId}>
            <SelectTrigger><SelectValue placeholder="Sender" /></SelectTrigger>
            <SelectContent>
              {fromOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {fromClient && (
            <p className="text-xs text-muted-foreground">
              Gold <span className={`tabular-nums ${balClass(Number(fromClient.purity_balance))}`}>{signed(Number(fromClient.purity_balance), fmtG)}</span>
              {" · "}DA <span className={`tabular-nums ${balClass(Number(fromClient.da_balance))}`}>{signed(Number(fromClient.da_balance), fmtDA)}</span>
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label>To Client *</Label>
          <Select value={toClientId} onValueChange={setToClientId}>
            <SelectTrigger><SelectValue placeholder="Receiver" /></SelectTrigger>
            <SelectContent>
              {toOptions.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
            </SelectContent>
          </Select>
          {toClient && (
            <p className="text-xs text-muted-foreground">
              Gold <span className={`tabular-nums ${balClass(Number(toClient.purity_balance))}`}>{signed(Number(toClient.purity_balance), fmtG)}</span>
              {" · "}DA <span className={`tabular-nums ${balClass(Number(toClient.da_balance))}`}>{signed(Number(toClient.da_balance), fmtDA)}</span>
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label>Settlement Kind *</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as "gold" | "da")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="gold">Pure Gold Settlement</SelectItem>
              <SelectItem value="da">DA Settlement</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>{kind === "gold" ? "Pure Gold Amount (g) *" : "DA Amount *"}</Label>
          <Input type="number" step="any" min="0" inputMode="decimal" value={amount}
            onChange={(e) => setAmount(e.target.value)} required />
        </div>
      </div>

      {kind === "gold" && (
        <Card className="p-4 space-y-3 bg-muted/10">
          <div className="flex items-start gap-3">
            <Checkbox id="apply-fee" checked={applyFee}
              onCheckedChange={(v) => setApplyFee(Boolean(v))} className="mt-1" />
            <div className="flex-1">
              <Label htmlFor="apply-fee" className="cursor-pointer font-medium">Apply Refinery Fee</Label>
              <p className="text-xs text-muted-foreground mt-1">
                When checked, charges the receiving client a refining fee based on Weight @ 730.
              </p>
            </div>
          </div>
          {applyFee && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t border-border/40">
              <div className="space-y-2">
                <Label>Refinery Fee Price (DA/g)</Label>
                <Input type="number" step="0.01" min="0" inputMode="decimal" value={feePrice}
                  onChange={(e) => setFeePrice(e.target.value)} />
              </div>
              <div className="space-y-1 text-sm">
                <div className="flex justify-between"><span className="text-muted-foreground">Weight @ 730</span><span className="tabular-nums">{fmtG(preview.w730)}</span></div>
                <div className="flex justify-between"><span className="text-muted-foreground">Total Refinery Fee</span><span className="tabular-nums font-semibold text-ember">{fmtDA(preview.fee)}</span></div>
                <p className="text-xs text-muted-foreground pt-1">Charged to {toClient?.name ?? "receiving client"}</p>
              </div>
            </div>
          )}
        </Card>
      )}

      {amt > 0 && fromClient && toClient && (
        <Card className="p-4 bg-muted/10">
          <p className="text-xs uppercase tracking-wider text-muted-foreground mb-3">Preview — Resulting Balances</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
            <div className="space-y-1">
              <p className="font-medium">{fromClient.name} <span className="text-xs text-muted-foreground">(From)</span></p>
              {fromGoldImpact !== 0 && (
                <div className="flex justify-between"><span>Gold</span><span className="tabular-nums">{fmtG(Number(fromClient.purity_balance))} → <span className={balClass(Number(fromClient.purity_balance) + fromGoldImpact)}>{fmtG(Number(fromClient.purity_balance) + fromGoldImpact)}</span></span></div>
              )}
              {fromDaImpact !== 0 && (
                <div className="flex justify-between"><span>DA</span><span className="tabular-nums">{fmtDA(Number(fromClient.da_balance))} → <span className={balClass(Number(fromClient.da_balance) + fromDaImpact)}>{fmtDA(Number(fromClient.da_balance) + fromDaImpact)}</span></span></div>
              )}
            </div>
            <div className="space-y-1">
              <p className="font-medium">{toClient.name} <span className="text-xs text-muted-foreground">(To)</span></p>
              {toGoldImpact !== 0 && (
                <div className="flex justify-between"><span>Gold</span><span className="tabular-nums">{fmtG(Number(toClient.purity_balance))} → <span className={balClass(Number(toClient.purity_balance) + toGoldImpact)}>{fmtG(Number(toClient.purity_balance) + toGoldImpact)}</span></span></div>
              )}
              {toDaImpact !== 0 && (
                <div className="flex justify-between"><span>DA</span><span className="tabular-nums">{fmtDA(Number(toClient.da_balance))} → <span className={balClass(Number(toClient.da_balance) + toDaImpact)}>{fmtDA(Number(toClient.da_balance) + toDaImpact)}</span></span></div>
              )}
            </div>
          </div>
        </Card>
      )}
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
  const [settlement, setSettlement] = useState<SettlementPair | null>(null);
  const [busy, setBusy] = useState<null | "pdf" | "png" | "share">(null);

  useEffect(() => {
    let cancelled = false;
    getTransaction({ data: { id: txId } })
      .then(async (t) => {
        if (cancelled) return;
        const tt = t as RefineryTransaction;
        setTx(tt);
        if (tt.transaction_type === "settlement" && tt.settlement_group_id) {
          try {
            const pair = await getSettlement({ data: { group_id: tt.settlement_group_id } });
            if (!cancelled) setSettlement(pair);
          } catch { /* ignore */ }
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [txId]);

  const isSettlement = tx?.transaction_type === "settlement" && Boolean(settlement);

  const renderReceiptCanvas = useCallback(async (): Promise<HTMLCanvasElement | null> => {
    if (!tx) return null;
    if (tx.transaction_type === "settlement" && !settlement) return null;
    const host = document.createElement("div");
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.zIndex = "-1";
    host.style.background = "#ffffff";
    document.body.appendChild(host);
    const root = createRoot(host);
    try {
      await new Promise<void>((resolve) => {
        root.render(
          isSettlement && settlement
            ? <SettlementReceiptReport settlement={settlement} refineryName={refinery.name} />
            : <TransactionReceiptReport tx={tx} refineryName={refinery.name} />
        );
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      const target = host.firstElementChild as HTMLElement | null;
      if (!target) return null;
      return await html2canvas(target, {
        backgroundColor: "#ffffff", scale: 3, useCORS: true, logging: false,
      });
    } finally {
      root.unmount();
      host.remove();
    }
  }, [tx, refinery.name, settlement, isSettlement]);

  const createReceiptPdfBlob = useCallback(async (): Promise<Blob> => {
    const canvas = await renderReceiptCanvas();
    if (!canvas) throw new Error("Render failed");
    const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const ratio = canvas.width / canvas.height;
    let w = pageW, h = w / ratio;
    if (h > pageH) { h = pageH; w = h * ratio; }
    const x = (pageW - w) / 2, y = (pageH - h) / 2;
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", x, y, w, h, undefined, "FAST");
    return pdf.output("blob");
  }, [renderReceiptCanvas]);

  const uploadReceiptPdfAndGetSignedUrl = useCallback(async (): Promise<{ signedUrl: string; fileName: string }> => {
    if (!tx) throw new Error("Receipt is not ready");
    const fileName = receiptFileName(tx.transaction_number, "pdf");
    const storagePath = `${tx.refinery_id}/${tx.id}/${fileName}`;
    const pdfBlob = await createReceiptPdfBlob();

    const { error: uploadError } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .upload(storagePath, pdfBlob, {
        contentType: "application/pdf",
        cacheControl: "3600",
        upsert: true,
      });
    if (uploadError) throw new Error(uploadError.message);

    const { data, error: signError } = await supabase.storage
      .from(RECEIPT_BUCKET)
      .createSignedUrl(storagePath, RECEIPT_SIGNED_URL_SECONDS, { download: fileName });
    if (signError || !data?.signedUrl) throw new Error(signError?.message || "Could not create share link");

    return { signedUrl: data.signedUrl, fileName };
  }, [createReceiptPdfBlob, tx]);

  const downloadPdf = async () => {
    if (!tx) return;
    setBusy("pdf");
    try {
      const pdfBlob = await createReceiptPdfBlob();
      const url = URL.createObjectURL(pdfBlob);
      const a = document.createElement("a");
      a.href = url; a.download = receiptFileName(tx.transaction_number, "pdf"); a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF failed");
    } finally { setBusy(null); }
  };

  const exportPng = async (channel: "download" | "whatsapp") => {
    if (!tx) return;
    setBusy(channel === "whatsapp" ? "share" : "png");
    const shareWindow = channel === "whatsapp" ? window.open("", "_blank") : null;
    try {
      if (channel === "whatsapp") {
        if (!shareWindow) throw new Error("WhatsApp popup was blocked");
        const { signedUrl, fileName } = await uploadReceiptPdfAndGetSignedUrl();
        const msg = encodeURIComponent(
          `Hello ${tx.client_name ?? ""}, here is your refinery transaction receipt.\n` +
          `Receipt: ${fileName}\n` +
          `Transaction: ${tx.transaction_number}\n` +
          `${signedUrl}`
        );
        const phone = (tx.client_phone ?? "").replace(/[^\d]/g, "");
        const whatsappUrl = phone ? `https://wa.me/${phone}?text=${msg}` : `https://wa.me/?text=${msg}`;
        shareWindow.location.href = whatsappUrl;
        toast.success("WhatsApp share link opened");
        return;
      }

      const canvas = await renderReceiptCanvas();
      if (!canvas) throw new Error("Render failed");
      const blob: Blob = await new Promise((resolve, reject) =>
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"),
      );
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = receiptFileName(tx.transaction_number, "png"); a.click();
      toast.success("Image downloaded");
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      shareWindow?.close();
      toast.error(
        channel === "whatsapp"
          ? "Unable to share receipt. Please download the file and send it manually."
          : e instanceof Error ? e.message : "Export failed",
      );
    } finally { setBusy(null); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto w-[calc(100vw-1.5rem)] sm:w-full">
        <DialogHeader><DialogTitle>{tx?.transaction_type === "settlement" ? "Settlement Receipt" : "Transaction Receipt"}</DialogTitle></DialogHeader>
        {!tx || (tx.transaction_type === "settlement" && !settlement) ? <p className="text-muted-foreground text-sm">Loading…</p> : (
          <>
            <div className="bg-white rounded-lg overflow-hidden shadow-sm" style={{ display: "flex", justifyContent: "center" }}>
              <div style={{ transform: "scale(0.78)", transformOrigin: "top center", width: 794 }}>
                {isSettlement && settlement
                  ? <SettlementReceiptReport settlement={settlement} refineryName={refinery.name} />
                  : <TransactionReceiptReport tx={tx} refineryName={refinery.name} />}
              </div>
            </div>
            <DialogFooter className="gap-2 flex-col sm:flex-row">
              <Button variant="outline" onClick={downloadPdf} disabled={busy !== null} className="w-full sm:w-auto">
                {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />} Download PDF
              </Button>
              <Button variant="outline" onClick={() => exportPng("download")} disabled={busy !== null} className="w-full sm:w-auto">
                {busy === "png" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-1" />} Download Image
              </Button>
              <Button onClick={() => exportPng("whatsapp")} disabled={busy !== null} className="w-full sm:w-auto">
                {busy === "share" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />} Share on WhatsApp
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
  type Stock = { pure_gold_stock: number; da_stock: number; silver_stock: number };
  type AdjTx = {
    id: string;
    transaction_number: string;
    transaction_date: string;
    created_at: string;
    adjustment_metal: StockAdjustmentMetal | null;
    adjustment_kind: StockAdjustmentKind | null;
    adjustment_delta: number | null;
    previous_gold_stock: number | null;
    new_gold_stock: number | null;
    previous_silver_stock: number | null;
    new_silver_stock: number | null;
    previous_da_stock: number | null;
    new_da_stock: number | null;
    notes: string | null;
    created_by_name?: string | null;
  };
  const [stock, setStock] = useState<Stock | null>(null);
  const [adjustments, setAdjustments] = useState<AdjTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [adjustOpen, setAdjustOpen] = useState(false);
  const [metalFilter, setMetalFilter] = useState<"all" | "gold" | "silver" | "da">("all");
  const [goldPrice, setGoldPrice] = useState<number>(() => Number(localStorage.getItem("ather:refinery:goldPrice") || 12000));
  const [silverPrice, setSilverPrice] = useState<number>(() => Number(localStorage.getItem("ather:refinery:silverPrice") || 150));

  useEffect(() => {
    localStorage.setItem("ather:refinery:goldPrice", String(goldPrice));
    localStorage.setItem("ather:refinery:silverPrice", String(silverPrice));
  }, [goldPrice, silverPrice]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Stock + bars count + adjustments transactions
      const [{ data: s }, { data: bars }, { data: adj }] = await Promise.all([
        supabase.from("refinery_stock").select("pure_gold_stock, da_stock, silver_stock").eq("refinery_id", refinery.id).maybeSingle(),
        supabase
          .from("refinery_transaction_gold_bars")
          .select("gross_weight, purity, transaction:refinery_transactions!inner(refinery_id, direction, status)")
          .eq("transaction.refinery_id", refinery.id),
        supabase
          .from("refinery_transactions")
          .select("id, transaction_number, transaction_date, created_at, adjustment_metal, adjustment_kind, adjustment_delta, previous_gold_stock, new_gold_stock, previous_silver_stock, new_silver_stock, previous_da_stock, new_da_stock, notes, created_by")
          .eq("refinery_id", refinery.id)
          .eq("transaction_type", "stock_adjustment")
          .order("created_at", { ascending: false }),
      ]);
      const stockRow = (s as { pure_gold_stock: number; da_stock: number; silver_stock: number } | null) ?? { pure_gold_stock: 0, da_stock: 0, silver_stock: 0 };
      setStock({
        pure_gold_stock: Number(stockRow.pure_gold_stock),
        da_stock: Number(stockRow.da_stock),
        silver_stock: Number(stockRow.silver_stock ?? 0),
      });
      // Bars + avg purity
      type BarRow = { gross_weight: number; purity: number; transaction: { direction: string; status: string } | { direction: string; status: string }[] };
      const list = (bars ?? []) as unknown as BarRow[];
      let count = 0; let sumPG = 0; let sumG = 0;
      for (const b of list) {
        const t = Array.isArray(b.transaction) ? b.transaction[0] : b.transaction;
        if (!t || t.status !== "settled") continue;
        const sign = t.direction === "receiving" ? 1 : -1;
        count += sign;
        sumPG += sign * Number(b.gross_weight) * Number(b.purity);
        sumG += sign * Number(b.gross_weight);
      }
      const avgPurity = sumG > 0 ? sumPG / sumG : 0;
      setAvg({ bars: Math.max(0, count), purity: avgPurity });

      // Resolve usernames
      const adjList = (adj ?? []) as unknown as Array<AdjTx & { created_by: string | null }>;
      const ids = Array.from(new Set(adjList.map((a) => a.created_by).filter(Boolean))) as string[];
      let nameMap: Record<string, string> = {};
      if (ids.length) {
        const { data: profs } = await supabase.from("swap_profiles").select("id, username").in("id", ids);
        nameMap = Object.fromEntries((profs ?? []).map((p) => [p.id, p.username]));
      }
      setAdjustments(adjList.map((a) => ({ ...a, created_by_name: a.created_by ? (nameMap[a.created_by] ?? null) : null })));
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [refinery.id]);

  const [avg, setAvg] = useState<{ bars: number; purity: number }>({ bars: 0, purity: 0 });
  useEffect(() => { load(); }, [load]);

  if (loading || !stock) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const visibleAdjustments = adjustments.filter((a) => metalFilter === "all" || a.adjustment_metal === metalFilter);
  const goldValue = stock.pure_gold_stock * goldPrice;
  const silverValue = stock.silver_stock * silverPrice;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Stock</h1>
          <p className="text-sm text-muted-foreground">{refinery.name}</p>
        </div>
        <Button onClick={() => setAdjustOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" /> New Stock Adjustment
        </Button>
      </div>

      {/* Price inputs */}
      <Card className="p-3">
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs">Gold Price (DA / g)</Label>
            <Input type="number" value={goldPrice} onChange={(e) => setGoldPrice(Number(e.target.value))} className="w-[160px]" />
          </div>
          <div>
            <Label className="text-xs">Silver Price (DA / g)</Label>
            <Input type="number" value={silverPrice} onChange={(e) => setSilverPrice(Number(e.target.value))} className="w-[160px]" />
          </div>
          <p className="text-xs text-muted-foreground">Stored locally; used to estimate values.</p>
        </div>
      </Card>

      {/* GOLD + SILVER + DA cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 ring-1 ring-amber-500/20 bg-amber-500/5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Coins className="h-4 w-4 text-ember" /> Gold Stock</h3>
          <div className="space-y-1.5 text-sm">
            <Row2 label="Pure Gold Stock" value={fmtG(stock.pure_gold_stock)} bold />
            <Row2 label="Total Gold Bars" value={String(avg.bars)} />
            <Row2 label="Average Purity" value={`${avg.purity.toFixed(2)}%`} />
            <Row2 label="Estimated Gold Value" value={fmtDA(goldValue)} cls="text-amber-600" />
          </div>
        </Card>
        <Card className="p-4 ring-1 ring-slate-400/30 bg-slate-100/30 dark:bg-slate-800/30">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Coins className="h-4 w-4 text-slate-500" /> Silver Stock</h3>
          <div className="space-y-1.5 text-sm">
            <Row2 label="Silver Stock" value={fmtG(stock.silver_stock)} bold />
            <Row2 label="Total Silver Pieces" value="—" />
            <Row2 label="Average Silver Purity" value="—" />
            <Row2 label="Estimated Silver Value" value={fmtDA(silverValue)} cls="text-slate-500" />
          </div>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-ember" /> DA Stock</h3>
          <div className="space-y-1.5 text-sm">
            <Row2 label="DA Balance" value={fmtDA(stock.da_stock)} bold />
          </div>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">Filter:</span>
        {(["all", "gold", "silver", "da"] as const).map((k) => (
          <Button key={k} size="sm" variant={metalFilter === k ? "default" : "outline"} onClick={() => setMetalFilter(k)}>
            {k === "all" ? "All Metals" : k === "da" ? "DA" : k[0].toUpperCase() + k.slice(1)}
          </Button>
        ))}
      </div>

      {/* Adjustment history */}
      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="p-3">Date</th>
                <th className="p-3">Tx #</th>
                <th className="p-3">Metal</th>
                <th className="p-3">Kind</th>
                <th className="p-3 text-right">Delta</th>
                <th className="p-3 text-right">Before</th>
                <th className="p-3 text-right">After</th>
                <th className="p-3">By</th>
                <th className="p-3">Notes</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleAdjustments.length === 0 && (
                <tr><td colSpan={10} className="p-6 text-center text-muted-foreground">No stock adjustments</td></tr>
              )}
              {visibleAdjustments.map((a) => {
                const metal = a.adjustment_metal ?? "gold";
                const before = metal === "gold" ? a.previous_gold_stock : metal === "silver" ? a.previous_silver_stock : a.previous_da_stock;
                const after  = metal === "gold" ? a.new_gold_stock      : metal === "silver" ? a.new_silver_stock      : a.new_da_stock;
                const fmt = metal === "da" ? fmtDA : fmtG;
                const delta = Number(a.adjustment_delta ?? 0);
                return (
                  <tr key={a.id} className="border-b border-border last:border-0">
                    <td className="p-3 text-muted-foreground whitespace-nowrap">{new Date(a.created_at).toLocaleString()}</td>
                    <td className="p-3 font-mono text-xs">{a.transaction_number}</td>
                    <td className="p-3"><Badge variant="secondary" className="uppercase">{metal}</Badge></td>
                    <td className="p-3 text-xs uppercase tracking-wider">{a.adjustment_kind ?? "—"}</td>
                    <td className={`p-3 text-right tabular-nums ${balClass(delta)}`}>{signed(delta, fmt)}</td>
                    <td className="p-3 text-right tabular-nums text-muted-foreground">{before != null ? fmt(Number(before)) : "—"}</td>
                    <td className="p-3 text-right tabular-nums">{after != null ? fmt(Number(after)) : "—"}</td>
                    <td className="p-3 text-xs text-muted-foreground">{a.created_by_name ?? "—"}</td>
                    <td className="p-3 max-w-[260px] truncate text-muted-foreground" title={a.notes ?? ""}>{a.notes ?? "—"}</td>
                    <td className="p-3 text-right">
                      <Button
                        variant="ghost" size="icon" title="Delete"
                        onClick={async () => {
                          if (!confirm("Delete this stock adjustment? Stock will be reversed.")) return;
                          try {
                            await deleteTransaction({ data: { id: a.id } });
                            toast.success("Adjustment deleted");
                            load();
                          } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
                        }}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {adjustOpen && (
        <NewStockAdjustmentDialog
          refineryId={refinery.id}
          currentGold={stock.pure_gold_stock}
          currentSilver={stock.silver_stock}
          currentDa={stock.da_stock}
          onClose={() => setAdjustOpen(false)}
          onSaved={() => { setAdjustOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function Row2({ label, value, cls, bold }: { label: string; value: string; cls?: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${cls ?? ""}`}>{value}</span>
    </div>
  );
}

function NewStockAdjustmentDialog({
  refineryId, currentGold, currentSilver, currentDa, onClose, onSaved,
}: {
  refineryId: string;
  currentGold: number; currentSilver: number; currentDa: number;
  onClose: () => void; onSaved: () => void;
}) {
  const [metal, setMetal] = useState<StockAdjustmentMetal>("gold");
  const [kind, setKind] = useState<StockAdjustmentKind>("add");
  const [amount, setAmount] = useState<string>("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const cur = metal === "gold" ? currentGold : metal === "silver" ? currentSilver : currentDa;
  const fmt = metal === "da" ? fmtDA : fmtG;
  const amt = Number(amount);
  const signedDelta = (kind === "remove" || kind === "loss") ? -Math.abs(amt) : Math.abs(amt);
  const projected = cur + (Number.isFinite(amt) ? signedDelta : 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error("Amount must be greater than 0");
      return;
    }
    if (projected < 0) {
      toast.error("Resulting stock would be negative");
      return;
    }
    if (!notes.trim()) {
      toast.error("Please provide a reason / note");
      return;
    }
    setSaving(true);
    try {
      await createStockAdjustment({ data: { refineryId, metal, kind, amount: Math.abs(amt), notes: notes.trim() } });
      toast.success("Stock adjustment transaction created");
      onSaved();
    } catch (err) { toast.error(err instanceof Error ? err.message : "Failed"); }
    finally { setSaving(false); }
  };

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md w-[calc(100vw-1.5rem)] sm:w-full">
        <DialogHeader>
          <DialogTitle>New Stock Adjustment Transaction</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            A real transaction will be created and saved to the transaction history & audit log.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Metal</Label>
              <Select value={metal} onValueChange={(v) => setMetal(v as StockAdjustmentMetal)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="gold">Gold (g)</SelectItem>
                  <SelectItem value="silver">Silver (g)</SelectItem>
                  <SelectItem value="da">DA</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Adjustment Kind</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as StockAdjustmentKind)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="add">Add Stock</SelectItem>
                  <SelectItem value="remove">Remove Stock</SelectItem>
                  <SelectItem value="correction">Correction</SelectItem>
                  <SelectItem value="loss">Loss</SelectItem>
                  <SelectItem value="manual">Manual Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Amount ({metal === "da" ? "DA" : "grams"})</Label>
            <Input type="number" step="any" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" />
            <p className="text-xs text-muted-foreground">
              Current: {fmt(cur)} → Projected: <span className={balClass(projected - cur)}>{fmt(projected)}</span>
            </p>
          </div>
          <div className="space-y-2">
            <Label>Reason / Notes <span className="text-destructive">*</span></Label>
            <Textarea required value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Initial stock, recount, melt loss, correction…" />
          </div>
          <DialogFooter className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} className="w-full sm:w-auto">Cancel</Button>
            <Button type="submit" disabled={saving} className="w-full sm:w-auto">{saving ? "Saving…" : "Create Adjustment"}</Button>
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

// =============================================================
// Account Statement dialog
// =============================================================

function isoToday(): string { return new Date().toISOString().slice(0, 10); }
function isoMonthStart(): string { return isoToday().slice(0, 7) + "-01"; }

type StatementHistoryRow = Awaited<ReturnType<typeof listRefineryReportHistory>>[number];

/**
 * Render the AccountStatementReport off-screen and return one canvas per page.
 * The SAME template is used for both PDF and PNG to guarantee identical output.
 */
async function renderStatementToCanvases(
  statement: AccountStatement,
): Promise<HTMLCanvasElement[]> {
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-99999px";
  host.style.top = "0";
  host.style.zIndex = "-1";
  host.style.background = "#ffffff";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    await new Promise<void>((resolve) => {
      root.render(<AccountStatementReport data={statement} />);
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
    });
    // Wait for fonts so text is crisp
    try { await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* noop */ }

    const wrapper = host.firstElementChild as HTMLElement | null;
    if (!wrapper) throw new Error("Statement render failed");
    const pages = Array.from(wrapper.querySelectorAll<HTMLElement>("[data-statement-page]"));
    if (pages.length === 0) throw new Error("Statement has no pages");

    const canvases: HTMLCanvasElement[] = [];
    for (const page of pages) {
      const c = await html2canvas(page, {
        backgroundColor: "#ffffff",
        scale: 2.5,
        useCORS: true,
        logging: false,
      });
      canvases.push(c);
    }
    return canvases;
  } finally {
    try { root.unmount(); } catch { /* noop */ }
    try { host.remove(); } catch { /* noop */ }
  }
}

/** Stitch multiple page canvases into one tall PNG canvas (white background). */
function stitchCanvasesVertically(canvases: HTMLCanvasElement[]): HTMLCanvasElement {
  const width = Math.max(...canvases.map((c) => c.width));
  const gap = canvases.length > 1 ? 16 : 0;
  const height = canvases.reduce((s, c) => s + c.height, 0) + gap * (canvases.length - 1);
  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const ctx = out.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D not supported");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);
  let y = 0;
  for (const c of canvases) {
    const x = Math.floor((width - c.width) / 2);
    ctx.drawImage(c, x, y);
    y += c.height + gap;
  }
  return out;
}

function canvasToBlob(canvas: HTMLCanvasElement, type = "image/png"): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encode failed"))), type),
  );
}

function AccountStatementDialog({
  open, onClose, refinery, client,
}: { open: boolean; onClose: () => void; refinery: Refinery; client: RefineryClient }) {
  const [from, setFrom] = useState(isoMonthStart());
  const [to, setTo] = useState(isoToday());
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState<null | "pdf" | "png" | "share">(null);
  const [history, setHistory] = useState<StatementHistoryRow[]>([]);

  const loadHistory = useCallback(async () => {
    try { setHistory(await listRefineryReportHistory({ data: { refineryId: refinery.id, clientId: client.id } })); }
    catch { /* ignore */ }
  }, [refinery.id, client.id]);

  useEffect(() => {
    if (open) { setStatement(null); loadHistory(); }
  }, [open, loadHistory]);

  const fileBase = `${client.name.replace(/\s+/g, "_")}_Statement`;

  const preview = async () => {
    if (from > to) { toast.error("Start date must be before end date"); return; }
    setLoading(true);
    try {
      const s = await getAccountStatement({ data: { refineryId: refinery.id, clientId: client.id, from, to } });
      setStatement(s);
      await logRefineryReport({ data: {
        refinery_id: refinery.id, client_id: client.id, date_from: from, date_to: to,
        statement_number: s.statement_number, format: "PREVIEW", channel: "preview",
      } }).catch(() => null);
      loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally { setLoading(false); }
  };

  const ensureStatement = async (): Promise<AccountStatement | null> => {
    if (statement) return statement;
    if (from > to) { toast.error("Start date must be before end date"); return null; }
    try {
      const s = await getAccountStatement({ data: { refineryId: refinery.id, clientId: client.id, from, to } });
      setStatement(s);
      return s;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
      return null;
    }
  };

  const downloadPdf = async () => {
    const s = await ensureStatement(); if (!s) return;
    setBusy("pdf");
    try {
      const canvases = await renderStatementToCanvases(s);
      const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
      const pageW = pdf.internal.pageSize.getWidth();
      const pageH = pdf.internal.pageSize.getHeight();
      canvases.forEach((c, i) => {
        if (i > 0) pdf.addPage();
        const ratio = c.width / c.height;
        let w = pageW, h = w / ratio;
        if (h > pageH) { h = pageH; w = h * ratio; }
        const x = (pageW - w) / 2, y = (pageH - h) / 2;
        pdf.addImage(c.toDataURL("image/png"), "PNG", x, y, w, h, undefined, "FAST");
      });
      const filename = `${fileBase}_${s.range.from}_${s.range.to}.pdf`;
      pdf.save(filename);
      await logRefineryReport({ data: {
        refinery_id: refinery.id, client_id: client.id, date_from: from, date_to: to,
        statement_number: s.statement_number, format: "PDF", channel: "download",
      } }).catch(() => null);
      loadHistory();
      toast.success("PDF downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PDF failed");
    } finally { setBusy(null); }
  };

  const downloadOrSharePng = async (channel: "download" | "whatsapp") => {
    const s = await ensureStatement(); if (!s) return;
    setBusy(channel === "whatsapp" ? "share" : "png");
    try {
      const canvases = await renderStatementToCanvases(s);
      // Stitch all pages vertically — identical content to the PDF, one PNG file.
      const stitched = stitchCanvasesVertically(canvases);
      const blob = await canvasToBlob(stitched, "image/png");
      const filename = `${fileBase}_${s.range.from}_${s.range.to}.png`;
      const file = new File([blob], filename, { type: "image/png" });

      let didShare = false;
      if (channel === "whatsapp") {
        const nav = navigator as Navigator & {
          canShare?: (d: ShareData) => boolean;
          share?: (d: ShareData) => Promise<void>;
        };
        if (nav.share && nav.canShare?.({ files: [file] })) {
          try {
            await nav.share({ files: [file], title: filename, text: `${client.name} — ${refinery.name} statement` });
            didShare = true;
          } catch (err) {
            const name = (err as { name?: string } | null)?.name;
            if (name === "AbortError") {
              toast.message("Share cancelled");
              return;
            }
            // Other errors: fall back to download.
          }
        }
      }

      if (!didShare) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = filename;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      await logRefineryReport({ data: {
        refinery_id: refinery.id, client_id: client.id, date_from: from, date_to: to,
        statement_number: s.statement_number, format: "PNG", channel,
      } }).catch(() => null);
      loadHistory();
      toast.success(channel === "whatsapp" && didShare ? "Shared" : "PNG ready");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "PNG failed");
    } finally {
      setBusy(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-5xl max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="font-display tracking-wide">
            Account Statement — {client.name}
          </DialogTitle>
          <p className="text-xs text-muted-foreground">{refinery.name}{client.phone ? ` · ${client.phone}` : ""}</p>
        </DialogHeader>


        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Start date</Label>
            <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setStatement(null); }} />
          </div>
          <div className="space-y-1.5">
            <Label>End date</Label>
            <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setStatement(null); }} />
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button onClick={preview} disabled={loading} className="flex-1 min-w-[120px]">
            {loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Loading…</> : <><FileText className="h-4 w-4 mr-1" />Preview</>}
          </Button>
          <Button variant="outline" onClick={downloadPdf} disabled={busy !== null} className="flex-1 min-w-[120px]">
            {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            PDF
          </Button>
          <Button variant="outline" onClick={() => downloadOrSharePng("download")} disabled={busy !== null} className="flex-1 min-w-[120px]">
            {busy === "png" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-1" />}
            PNG
          </Button>
          <Button variant="outline" onClick={() => downloadOrSharePng("whatsapp")} disabled={busy !== null} className="flex-1 min-w-[120px]">
            {busy === "share" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
            Share
          </Button>
        </div>

        {statement && (
          <Card className="p-3 sm:p-4 bg-card/40">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3 text-xs">
              <Meta label="Statement №" value={statement.statement_number} mono />
              <Meta label="Generated" value={new Date(statement.generated_at).toLocaleString()} />
              <Meta label="By" value={statement.generated_by} />
              <Meta label="Range" value={`${statement.range.from} → ${statement.range.to}`} />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-4">
              <StatTile label="Opening Gold" value={fmtG(statement.opening_gold)} />
              <StatTile label="Closing Gold" value={fmtG(statement.closing_gold)} highlight />
              <StatTile label="Opening DA" value={fmtDA(statement.opening_da)} />
              <StatTile label="Closing DA" value={fmtDA(statement.closing_da)} highlight />
              <StatTile label="Gold Received" value={fmtG(statement.summary.total_gold_received)} good />
              <StatTile label="Gold Delivered" value={fmtG(statement.summary.total_gold_delivered)} bad />
              <StatTile label="DA Received" value={fmtDA(statement.summary.total_da_received)} good />
              <StatTile label="DA Paid" value={fmtDA(statement.summary.total_da_paid)} bad />
              <StatTile label="Refining Fees" value={fmtDA(statement.summary.total_refining_fees)} />
              <StatTile label="Transactions" value={String(statement.summary.transaction_count)} />
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs tabular-nums">
                <thead className="text-muted-foreground">
                  <tr className="border-b border-border">
                    <th className="text-left p-2">Date</th>
                    <th className="text-left p-2">Ref</th>
                    <th className="text-left p-2">Type</th>
                    <th className="text-left p-2">Description</th>
                    <th className="text-right p-2">Gold Dr</th>
                    <th className="text-right p-2">Gold Cr</th>
                    <th className="text-right p-2">DA Dr</th>
                    <th className="text-right p-2">DA Cr</th>
                    <th className="text-right p-2">Bal Gold</th>
                    <th className="text-right p-2">Bal DA</th>
                  </tr>
                </thead>
                <tbody>
                  {statement.rows.length === 0 && (
                    <tr><td colSpan={10} className="text-center p-6 text-muted-foreground">No transactions in this period.</td></tr>
                  )}
                  {statement.rows.map((r, i) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="p-2">{r.date}</td>
                      <td className="p-2 font-mono text-[10px]">{r.reference}</td>
                      <td className="p-2 capitalize">{r.type.replace(/_/g, " ")}</td>
                      <td className="p-2">{r.description}</td>
                      <td className="p-2 text-right text-destructive">{r.gold_debit ? fmtG(r.gold_debit) : "—"}</td>
                      <td className="p-2 text-right text-emerald-500">{r.gold_credit ? fmtG(r.gold_credit) : "—"}</td>
                      <td className="p-2 text-right text-destructive">{r.da_debit ? fmtDA(r.da_debit) : "—"}</td>
                      <td className="p-2 text-right text-emerald-500">{r.da_credit ? fmtDA(r.da_credit) : "—"}</td>
                      <td className="p-2 text-right font-medium">{fmtG(r.running_gold)}</td>
                      <td className="p-2 text-right font-medium">{fmtDA(r.running_da)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {history.length > 0 && (
          <div className="mt-3">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-muted-foreground mb-2">
              <HistoryIcon className="h-3.5 w-3.5" /> Report history
            </div>
            <div className="rounded-md border border-border divide-y divide-border max-h-48 overflow-y-auto">
              {history.slice(0, 20).map((h) => (
                <div key={h.id} className="flex items-center justify-between px-3 py-2 text-xs">
                  <div className="min-w-0">
                    <div className="font-medium truncate">{h.date_from} → {h.date_to}</div>
                    <div className="text-muted-foreground truncate">
                      {h.statement_number ?? "—"} · {h.generated_by_username ?? "—"} · {new Date(h.created_at).toLocaleString()}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0">{h.format} · {h.channel}</Badge>
                </div>
              ))}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      <div className={`text-xs mt-0.5 ${mono ? "font-mono" : ""} truncate`}>{value}</div>
    </div>
  );
}

function StatTile({ label, value, good, bad, highlight }: { label: string; value: string; good?: boolean; bad?: boolean; highlight?: boolean }) {
  const color = good ? "text-emerald-500" : bad ? "text-destructive" : highlight ? "text-ember" : "text-foreground";
  return (
    <div className={`p-2.5 rounded-md border ${highlight ? "border-ember/40 bg-ember/5" : "border-border bg-card/30"}`}>
      <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className={`text-sm font-semibold tabular-nums mt-0.5 ${color}`}>{value}</div>
    </div>
  );
}
