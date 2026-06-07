import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  Scale, LogOut, Plus, Trash2, Share2, FileText, ArrowLeft, Wallet, Coins,
  TrendingUp, TrendingDown, AlertTriangle, Pencil, Image as ImageIcon, X,
  Eye, EyeOff, Monitor, Sun, Moon, Globe, ShieldCheck, Settings as SettingsIcon, User as UserIcon, Info,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
  suggestClientCode, checkClientCode,
  listTransactions, createTransaction, updateTransaction, deleteTransaction, cancelTransaction, getTransaction,
  createSettlement, getSettlement,
  getStock, listStockMovements, getDashboard, adjustStock, updateStockAdjustment, deleteStockAdjustment,
  createStockAdjustment, type StockAdjustmentMetal, type StockAdjustmentKind,
  createBuySell, type BuySellKind, type BuySellSettlement, type BuySellMetal,
  getMyRefineryProfile, updateMyRefineryProfile,
  getAccountStatement, logRefineryReport, listRefineryReportHistory,
  getNetPositionPrice, saveNetPositionPrice,
  listPositionSnapshots, recordPositionSnapshot, type PositionSnapshot,
  listClientNotes, addClientNote, deleteClientNote, type RefineryClientNote,
  createBackup, listBackups, getBackupPayload, deleteBackup,
  restoreBackupFromHistory, restoreBackupFromFile,
  getBackupSettings, updateBackupSettings, listAuditLog,
  type RefineryBackupMeta, type RefineryBackupSettings, type RefineryAuditLogRow,
  type Refinery, type RefineryClient, type RefineryTransaction,
  type RefineryAssignment, type RefineryDirection, type RefineryTxType,
  type AccountStatement, type SettlementPair, type StatementRow,
} from "@/lib/refineries.functions";
import { createRoot } from "react-dom/client";
import jsPDF from "jspdf";
import { AccountStatementReport } from "@/components/refineries/AccountStatement";
import { TransactionReceiptReport } from "@/components/refineries/TransactionReceipt";
import { SettlementReceiptReport } from "@/components/refineries/SettlementReceipt";
import { Download, History as HistoryIcon, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { useLang, type Lang } from "@/lib/purity-i18n";
import {
  getSwapOwnProfile, updateSwapOwnProfile, updateSwapOwnPassword,
  getUserPreferences, updateUserPreferences,
  signOutEverywhere, getLoginHistory,
} from "@/lib/swap-profile.functions";


type Tab = "dashboard" | "clients" | "transactions" | "buysell" | "stock" | "netposition" | "backup" | "profile" | "translations";
const TAB_DEFS: { id: Tab; key: string; adminOnly?: boolean }[] = [
  { id: "dashboard", key: "ref.tab.dashboard" },
  { id: "clients", key: "ref.tab.clients" },
  { id: "transactions", key: "ref.tab.transactions" },
  { id: "buysell", key: "ref.tab.buysell" },
  { id: "stock", key: "ref.tab.stock" },
  { id: "netposition", key: "ref.tab.netposition" },
  { id: "backup", key: "ref.tab.backup", adminOnly: true },
  { id: "profile", key: "ref.tab.profile" },
  { id: "translations", key: "ref.tab.translations", adminOnly: true },
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
    filter: s.filter === "owing-gold" || s.filter === "owing-da" ? (s.filter as "owing-gold" | "owing-da") : undefined,
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
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
      clientId={search.clientId}
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
  const { t: tr } = useLang();
  const grid = (
    <div className={embedded ? "" : "max-w-5xl mx-auto px-4 sm:px-6 py-8 sm:py-12"}>
      <h1 className="font-display text-3xl mb-2">{tr("ref.pageTitle")}</h1>
      <p className="text-sm text-muted-foreground mb-8">
        {tr("ref.pickRefinery")}
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
            <p className="text-sm text-muted-foreground">{tr("ref.tab.dashboard")} · {tr("ref.tab.clients")} · {tr("ref.tab.transactions")} · {tr("ref.tab.stock")}</p>
          </Card>
        ))}
      </div>
    </div>
  );
  if (embedded) return grid;
  return (
    <main className="min-h-screen bg-background text-foreground">
      <TopBar title="REFINERIES" subtitle={isAdmin ? tr("ref.pickRefinery") : ""} onSignOut={onSignOut} />
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
  const { t: tr } = useLang();
  return (
    <header className="border-b border-border bg-card/40">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 h-16 flex items-center justify-between gap-2">
        <div className="flex items-center gap-3">
          {onBack && (
            <Button variant="ghost" size="sm" onClick={onBack} className="-ml-2">
              <ArrowLeft className="h-4 w-4 mr-1" /> {tr("ref.pageTitle")}
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
          <LogOut className="h-4 w-4 mr-1" /> {tr("ref.signOut")}
        </Button>
      </div>
    </header>
  );
}

// =============================================================
// Shell with tabs
// =============================================================
function RefineryShell({
  refinery, assignment, tab, action, txId, clientId, onTab, onAction, onBack, onSignOut, embedded,
}: {
  refinery: Refinery;
  assignment: RefineryAssignment;
  tab: Tab;
  action?: "new" | "edit";
  txId?: string;
  clientId?: string;
  onTab: (t: Tab) => void;
  onAction: (action: "new" | "edit" | undefined, txId: string | undefined) => void;
  onBack?: () => void;
  onSignOut: () => void;
  embedded?: boolean;
}) {
  const showTxForm = tab === "transactions" && (action === "new" || action === "edit");

  const { t: tr } = useLang();

  const tabsBar = (
    <nav className="border-b border-border bg-card/20">
      <div className={`${embedded ? "" : "max-w-7xl mx-auto"} px-3 sm:px-6 flex items-center gap-1 overflow-x-auto`}>
        {embedded && onBack && (
          <Button variant="ghost" size="sm" onClick={onBack} className="-ml-1 mr-1">
            <ArrowLeft className="h-4 w-4 mr-1" /> {tr("ref.pageTitle")}
          </Button>
        )}
        <div className="flex gap-1 flex-1 min-w-0 overflow-x-auto">
          {TAB_DEFS.filter((td) => !td.adminOnly || assignment.isAdmin).map((td) => (
            <button
              key={td.id}
              onClick={() => onTab(td.id)}
              className={`px-3 sm:px-4 py-3 text-sm tracking-wide border-b-2 transition-colors whitespace-nowrap ${
                tab === td.id
                  ? "border-ember text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {tr(td.key)}
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
          {tab === "clients" && (
            clientId
              ? <ClientDetailsPage refinery={refinery} assignment={assignment} clientId={clientId} />
              : <ClientsTab refinery={refinery} assignment={assignment} />
          )}
          {tab === "transactions" && (
            <TransactionsTab refinery={refinery} assignment={assignment} onAction={onAction} />
          )}
          {tab === "buysell" && <BuySellTab refinery={refinery} assignment={assignment} />}
          {tab === "stock" && <StockTab refinery={refinery} />}
          {tab === "netposition" && <NetPositionTab refinery={refinery} />}
          {tab === "backup" && assignment.isAdmin && <BackupTab refinery={refinery} />}
          {tab === "translations" && assignment.isAdmin && <TranslationsTab />}
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
  const navigate = useNavigate();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await getDashboard({ data: { refineryId: refinery.id } });
      setData(d as Dash);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load"); }
    finally { setLoading(false); }
  }, [refinery.id]);

  useEffect(() => { load(); }, [load]);

  const goToClients = (filter?: "owing-gold" | "owing-da") =>
    navigate({ to: "/desk/refineries", search: { r: refinery.id, tab: "clients", filter } });

  if (loading || !data) return <p className="text-muted-foreground text-sm">Loading…</p>;

  // ---- Equity calculation (Pure Gold Equivalent) ----
  // Equity = Pure Gold Stock + Clients Owe Gold + Clients Owe DA (gold eq)
  //        − Refinery Owes Gold − Refinery Owes DA (gold eq)
  const goldPrice = Number(data.goldPrice || 0);
  const silverPrice = Number(data.silverPrice || 0);
  const silverStock = Number((data.stock as { silver_stock?: number }).silver_stock ?? 0);
  const daCash = Number(data.stock.da_stock);
  const goldStock = Number(data.stock.pure_gold_stock);
  const silverEq = goldPrice > 0 ? (silverStock * silverPrice) / goldPrice : 0;
  const daCashEq = goldPrice > 0 ? daCash / goldPrice : 0;
  const clientsOweDaEq = goldPrice > 0 ? data.clientsOweDa / goldPrice : 0;
  const refineryOwesDaEq = goldPrice > 0 ? data.refineryOwesDa / goldPrice : 0;
  const canCompute = goldPrice > 0; // DA gold-equivalent requires a gold price
  const totalAssets = goldStock + silverEq + daCashEq + data.clientsOweGold + clientsOweDaEq;
  const totalLiabilities = data.refineryOwesGold + refineryOwesDaEq;
  const refineryEquity =
    goldStock + data.clientsOweGold + clientsOweDaEq - data.refineryOwesGold - refineryOwesDaEq;

  // ---- Alerts ----
  type Alert = { tone: "danger" | "warn"; text: string; onClick?: () => void };
  const alerts: Alert[] = [];
  if (data.clientsOweDa > daCash && daCash >= 0) {
    alerts.push({
      tone: "danger",
      text: `Client DA exposure (${fmtDA(data.clientsOweDa)}) exceeds refinery DA stock (${fmtDA(daCash)}).`,
      onClick: () => goToClients("owing-da"),
    });
  }
  if (goldStock < 100) {
    alerts.push({ tone: "warn", text: `Refinery gold stock below threshold (${fmtG(goldStock)}).`, onClick: () => onTab("stock") });
  }
  // Biggest gold-owing client alert
  const biggestGold = [...data.negativeClients]
    .map((c) => ({ ...c, owed: Number(c.purity_balance) < 0 ? -Number(c.purity_balance) : 0 }))
    .filter((c) => c.owed > 0)
    .sort((a, b) => b.owed - a.owed)[0];
  if (biggestGold && biggestGold.owed >= 500) {
    alerts.push({
      tone: "danger",
      text: `${biggestGold.name} owes ${fmtG(biggestGold.owed)}.`,
      onClick: () => goToClients("owing-gold"),
    });
  }
  if (goldPrice <= 0) {
    alerts.push({ tone: "warn", text: "Net Position prices not set — DA/Silver conversion unavailable.", onClick: () => onTab("netposition") });
  }

  // ---- Negative clients with exposure (sorted highest negative first) ----
  const negRows = data.negativeClients.map((c) => {
    const g = Number(c.purity_balance);
    const d = Number(c.da_balance);
    const exposureGold = (g < 0 ? -g : 0) + (canCompute && d < 0 ? -d / goldPrice : 0);
    return { ...c, exposureGold };
  }).sort((a, b) => b.exposureGold - a.exposureGold);

  return (
    <div className="space-y-8">
      <header className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Dashboard</h1>
          <p className="text-sm text-muted-foreground">{refinery.name} overview</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" onClick={() => onTab("buysell")}>
            <Plus className="h-4 w-4 mr-1" /> Buy Gold
          </Button>
          <Button size="sm" className="bg-destructive hover:bg-destructive/90 text-destructive-foreground" onClick={() => onTab("buysell")}>
            <TrendingDown className="h-4 w-4 mr-1" /> Sell Gold
          </Button>
          <Button size="sm" variant="outline" onClick={() => onTab("stock")}>
            <Plus className="h-4 w-4 mr-1" /> Stock Adjustment
          </Button>
          <Button size="sm" variant="outline" onClick={() => onTab("clients")}>
            <Plus className="h-4 w-4 mr-1" /> Add Client
          </Button>
        </div>
      </header>

      {/* Top row: physical metrics + equity hero */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Coins className="h-4 w-4 text-amber-500" />} label="Pure Gold Stock" value={fmtG(goldStock)} valueClass="text-amber-500" />
        <StatCard icon={<Coins className="h-4 w-4 text-slate-400" />} label="Silver Stock" value={fmtG(silverStock)} valueClass="text-slate-300" />
        <StatCard icon={<Wallet className="h-4 w-4" />} label="DA Cash Stock" value={fmtDA(daCash)} />
        <EquityCard equity={refineryEquity} canCompute={canCompute} onClick={() => onTab("netposition")} />
      </div>

      {/* Second row: clients, exposure, today summary */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard label="Total Clients" value={String(data.totalClients)} onClick={() => onTab("clients")} />
        <StatCard
          label="Clients Owing Gold"
          value={String(data.negativePurity)}
          tone={data.negativePurity > 0 ? "warn" : undefined}
          onClick={() => goToClients("owing-gold")}
        />
        <StatCard
          label="Clients Owing DA"
          value={String(data.negativeDa)}
          tone={data.negativeDa > 0 ? "warn" : undefined}
          onClick={() => goToClients("owing-da")}
        />
        <TodaysActivityCard data={data} />
      </div>

      {/* Alerts */}
      {alerts.length > 0 && (
        <section>
          <h2 className="font-display text-lg flex items-center gap-2 mb-3">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Alerts
          </h2>
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <button
                key={i}
                onClick={a.onClick}
                className={`w-full text-left flex items-center gap-3 rounded-md border px-3 py-2 transition-colors ${
                  a.tone === "danger"
                    ? "border-destructive/40 bg-destructive/5 hover:bg-destructive/10"
                    : "border-amber-500/40 bg-amber-500/5 hover:bg-amber-500/10"
                }`}
              >
                <StatusDot tone={a.tone === "danger" ? "negative" : "warn"} />
                <span className="text-sm">{a.text}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Negative clients */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display text-lg flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" /> Clients with negative balances
          </h2>
          <Button size="sm" variant="ghost" onClick={() => onTab("clients")}>View all</Button>
        </div>
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead className="border-b border-border bg-muted/20">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                  <th className="p-3 w-8">Status</th>
                  <th className="p-3">Client</th>
                  <th className="p-3 text-right">Gold Balance</th>
                  <th className="p-3 text-right">DA Balance</th>
                  <th className="p-3 text-right">Exposure</th>
                  <th className="p-3">Last Activity</th>
                </tr>
              </thead>
              <tbody>
                {negRows.length === 0 && (
                  <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No negative balances</td></tr>
                )}
                {negRows.map((c) => {
                  const g = Number(c.purity_balance);
                  const d = Number(c.da_balance);
                  return (
                    <tr key={c.id} className="border-b border-border last:border-0">
                      <td className="p-3"><StatusDot tone="negative" /></td>
                      <td className="p-3 font-medium">{c.name}</td>
                      <td className={`p-3 text-right tabular-nums ${balClass(g)}`}>{signed(g, fmtG)}</td>
                      <td className={`p-3 text-right tabular-nums ${balClass(d)}`}>{signed(d, fmtDA)}</td>
                      <td className="p-3 text-right tabular-nums text-destructive">
                        {canCompute ? `−${fmtG(c.exposureGold)}` : "—"}
                      </td>
                      <td className="p-3 text-muted-foreground">{c.last_activity ?? "—"}</td>
                    </tr>
                  );
                })}
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
          <RecentTxTable rows={data.recent} onOpen={() => onTab("transactions")} />
        </Card>
      </section>
    </div>
  );
}

// Slowly pulsing colored dot
function StatusDot({ tone }: { tone: "positive" | "negative" | "neutral" | "warn" }) {
  const cls =
    tone === "positive" ? "bg-emerald-500 shadow-[0_0_10px_2px_rgba(16,185,129,0.55)]"
    : tone === "negative" ? "bg-destructive shadow-[0_0_10px_2px_rgba(239,68,68,0.55)]"
    : tone === "warn" ? "bg-amber-500 shadow-[0_0_10px_2px_rgba(245,158,11,0.55)]"
    : "bg-muted-foreground/60";
  return (
    <span className="relative inline-flex items-center justify-center">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${cls} animate-pulse`} />
    </span>
  );
}

function StatCard({
  icon, label, value, tone, valueClass, onClick,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: "warn";
  valueClass?: string;
  onClick?: () => void;
}) {
  const interactive = onClick ? "cursor-pointer hover:border-ember/40 transition-colors" : "";
  return (
    <Card className={`p-4 ${interactive}`} onClick={onClick}>
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className={`text-xl font-semibold tabular-nums ${tone === "warn" ? "text-amber-500" : ""} ${valueClass ?? ""}`}>{value}</p>
    </Card>
  );
}

function EquityCard({ equity, canCompute, onClick }: { equity: number; canCompute: boolean; onClick?: () => void }) {
  const positive = equity > 0.0001;
  const negative = equity < -0.0001;
  const valueCls = positive ? "text-emerald-500" : negative ? "text-destructive" : "text-muted-foreground";
  const borderCls = positive ? "border-emerald-500/40" : negative ? "border-destructive/40" : "border-amber-500/30";
  return (
    <Card
      onClick={onClick}
      className={`p-4 bg-gradient-to-br from-amber-500/10 via-background to-background ${borderCls} ${onClick ? "cursor-pointer hover:border-ember/60 transition-colors" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Refinery Equity</p>
        <Coins className="h-4 w-4 text-amber-500" />
      </div>
      <p className={`text-2xl font-semibold tabular-nums ${valueCls}`}>
        {canCompute ? signed(equity, fmtG) : "—"}
      </p>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground mt-1">
        {canCompute ? "Pure gold equivalent" : "Set prices in Net Position"}
      </p>
    </Card>
  );
}

function TodaysActivityCard({ data }: {
  data: {
    todayCount: number;
    todayGoldBought: number; todayGoldSold: number;
    todaySilverBought: number; todaySilverSold: number;
    todayBuyTotal: number; todaySellTotal: number;
    todayReceivedDa: number; todayDeliveredDa: number;
  };
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">Today's Activity</p>
        <TrendingUp className="h-4 w-4 text-emerald-500" />
      </div>
      <p className="text-xl font-semibold tabular-nums mb-1">{data.todayCount} tx</p>
      <div className="text-[11px] text-muted-foreground space-y-0.5 tabular-nums">
        <div className="flex justify-between"><span>Gold bought</span><span className="text-emerald-500">{fmtG(data.todayGoldBought)}</span></div>
        <div className="flex justify-between"><span>Gold sold</span><span className="text-destructive">{fmtG(data.todayGoldSold)}</span></div>
        <div className="flex justify-between"><span>Silver bought</span><span className="text-emerald-500">{fmtG(data.todaySilverBought)}</span></div>
        <div className="flex justify-between"><span>Silver sold</span><span className="text-destructive">{fmtG(data.todaySilverSold)}</span></div>
        <div className="flex justify-between"><span>Buy total</span><span className="text-emerald-500">{fmtDA(data.todayBuyTotal)}</span></div>
        <div className="flex justify-between"><span>Sell total</span><span className="text-destructive">{fmtDA(data.todaySellTotal)}</span></div>
        <div className="flex justify-between"><span>DA received</span><span className="text-emerald-500">{fmtDA(data.todayReceivedDa)}</span></div>
        <div className="flex justify-between"><span>DA delivered</span><span className="text-destructive">{fmtDA(data.todayDeliveredDa)}</span></div>
      </div>
    </Card>
  );
}

function txTypeBadge(t: RefineryTransaction) {
  const type = t.transaction_type;
  if (type === "buysell") {
    const buy = t.buysell_kind === "buy";
    return buy
      ? { label: "BUY", cls: "bg-emerald-600/15 text-emerald-500 border-emerald-600/30" }
      : { label: "SELL", cls: "bg-destructive/15 text-destructive border-destructive/30" };
  }
  if (type === "stock_adjustment") {
    return { label: "ADJUSTMENT", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
  }
  if (type === "settlement") {
    return { label: "SETTLEMENT", cls: "bg-sky-500/15 text-sky-400 border-sky-500/30" };
  }
  if (type === "gold") {
    return { label: "GOLD", cls: "bg-amber-500/15 text-amber-500 border-amber-500/30" };
  }
  return { label: "DA", cls: "bg-muted text-muted-foreground border-border" };
}

function RecentTxTable({ rows, onOpen }: { rows: Array<RefineryTransaction & { client_name?: string }>; onOpen?: () => void }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm min-w-[760px]">
        <thead className="border-b border-border bg-muted/20">
          <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
            <th className="p-3">Date</th>
            <th className="p-3">#</th>
            <th className="p-3">Client</th>
            <th className="p-3">Type</th>
            <th className="p-3 text-right">Gold</th>
            <th className="p-3 text-right">DA</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No transactions</td></tr>
          )}
          {rows.map((t) => {
            const badge = txTypeBadge(t);
            const goldVal = (t.transaction_type === "gold" || (t.transaction_type === "settlement" && t.settlement_kind === "gold") || t.transaction_type === "buysell")
              ? fmtG(Number(t.transaction_type === "buysell" ? (t.buysell_weight ?? 0) : t.total_pure_weight)) : "—";
            const daVal = t.transaction_type === "buysell"
              ? fmtDA(Number(t.buysell_total ?? 0))
              : (t.transaction_type === "da" || (t.transaction_type === "settlement" && t.settlement_kind === "da")
                  ? fmtDA(Number(t.da_amount))
                  : (Number(t.total_refining_fee) > 0 ? fmtDA(Number(t.total_refining_fee)) : "—"));
            return (
              <tr
                key={t.id}
                onClick={onOpen}
                className={`border-b border-border last:border-0 ${onOpen ? "cursor-pointer hover:bg-muted/20" : ""}`}
              >
                <td className="p-3 text-muted-foreground">{t.transaction_date}</td>
                <td className="p-3 font-mono text-xs">{t.transaction_number}</td>
                <td className="p-3">
                  {t.client_name}
                  {t.transaction_type === "settlement" && t.counterparty_client_name && (
                    <span className="text-xs text-muted-foreground"> {t.settlement_role === "from" ? "→" : "←"} {t.counterparty_client_name}</span>
                  )}
                </td>
                <td className="p-3">
                  <Badge className={badge.cls}>{badge.label}</Badge>
                </td>
                <td className="p-3 text-right tabular-nums">{goldVal}</td>
                <td className="p-3 text-right tabular-nums">{daVal}</td>
              </tr>
            );
          })}
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
  const search = Route.useSearch();
  const navigate = useNavigate();
  const filter = search.filter;
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

  const filtered = clients.filter((c) => {
    if (filter === "owing-gold") return Number(c.purity_balance) < 0;
    if (filter === "owing-da") return Number(c.da_balance) < 0;
    return true;
  });
  const filterLabel = filter === "owing-gold" ? "Clients owing gold" : filter === "owing-da" ? "Clients owing DA" : null;

  const clearFilter = () =>
    navigate({ to: "/desk/refineries", search: { r: refinery.id, tab: "clients" } });

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Clients</h1>
          <p className="text-sm text-muted-foreground">
            {filterLabel
              ? `${filtered.length} of ${clients.length} client(s) · filtered: ${filterLabel}`
              : `${clients.length} client(s) in ${refinery.name}`}
          </p>
        </div>
        <div className="flex gap-2 w-full sm:w-auto">
          {filter && (
            <Button variant="outline" size="sm" onClick={clearFilter}>
              <X className="h-4 w-4 mr-1" /> Clear filter
            </Button>
          )}
          {!readOnly && (
            <Button onClick={() => { setEditing(null); setOpen(true); }} className="w-full sm:w-auto">
              <Plus className="h-4 w-4 mr-1" /> New client
            </Button>
          )}
        </div>
      </div>


      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[820px]">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="p-3">Code</th>
                <th className="p-3">Client Name</th>
                <th className="p-3">Phone</th>
                <th className="p-3 text-right">Pure Gold</th>
                <th className="p-3 text-right">Dinar</th>
                <th className="p-3 text-right">Fee/g</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Loading…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">{clients.length === 0 ? "No clients yet" : "No clients match the current filter"}</td></tr>
              )}
              {filtered.map((c) => {
                const g = Number(c.purity_balance);
                const d = Number(c.da_balance);
                const tone: "negative" | "positive" | "neutral" =
                  g < 0 || d < 0 ? "negative" : (g > 0 || d > 0 ? "positive" : "neutral");
                return (
                <tr
                  key={c.id}
                  className="border-b border-border last:border-0 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => navigate({ to: "/desk/refineries", search: { r: refinery.id, tab: "clients", clientId: c.id } })}
                >
                  <td className="p-3 font-mono text-xs tracking-wider">
                    <span className="inline-flex items-center gap-2">
                      <StatusDot tone={tone} />
                      <span className="font-semibold">{c.code ?? "—"}</span>
                    </span>
                  </td>
                  <td className="p-3 font-medium">{c.name}</td>
                  <td className="p-3 text-muted-foreground">{c.phone ?? "—"}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(g)}`}>{signed(g, fmtG)}</td>
                  <td className={`p-3 text-right tabular-nums ${balClass(d)}`}>{signed(d, fmtDA)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtDA(Number(c.refining_fee_price))}</td>

                  <td className="p-3 text-right" onClick={(e) => e.stopPropagation()}>
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
                );
              })}
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
  const [code, setCode] = useState(editing?.code ?? "");
  const [phone, setPhone] = useState(editing?.phone ?? "");
  const [purity, setPurity] = useState(String(editing?.purity_balance ?? 0));
  const [da, setDa] = useState(String(editing?.da_balance ?? 0));
  const [fee, setFee] = useState(String(editing?.refining_fee_price ?? 0));
  const [notes, setNotes] = useState(editing?.notes ?? "");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [codeWarn, setCodeWarn] = useState<string | null>(null);
  // Status field removed from the Refineries module; default all clients to "active" for backend compatibility.
  const status: "active" = "active";
  const [saving, setSaving] = useState(false);

  const codeFormatOk = (v: string) => /^[A-Z]{2}\d{4}$/.test(v);

  // Auto-suggest a code when name is set and code is empty (new client only)
  const onNameBlur = async () => {
    if (editing || code.trim()) return;
    if (!name.trim()) return;
    try {
      const r = await suggestClientCode({ data: { name: name.trim() } });
      setCode(r.code);
      setCodeError(null);
      setCodeWarn(null);
    } catch { /* silent */ }
  };

  // Validate manually-entered code
  const onCodeBlur = async () => {
    const v = code.trim().toUpperCase();
    setCodeError(null);
    setCodeWarn(null);
    if (!v) return;
    if (!codeFormatOk(v)) {
      setCodeError("Format must be 2 capital letters + 4 digits (e.g. AM4821).");
      return;
    }
    setCode(v);
    try {
      const r = await checkClientCode({
        data: { code: v, excludeClientId: editing?.id ?? null },
      });
      if (r.duplicate) {
        setCodeError(`This code is already used${r.duplicateOf ? ` by ${r.duplicateOf}` : ""}.`);
      } else if (r.prefixCollision) {
        const sample = r.prefixOthers.slice(0, 2).map((o) => `${o.code} (${o.name})`).join(", ");
        setCodeWarn(`Prefix “${v.slice(0, 2)}” is also used by: ${sample}${r.prefixOthers.length > 2 ? "…" : ""}.`);
      }
    } catch { /* silent */ }
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) { toast.error("Name is required"); return; }
    const trimmedCode = code.trim().toUpperCase();
    if (trimmedCode && !codeFormatOk(trimmedCode)) {
      toast.error("Code must be 2 capital letters + 4 digits (e.g. AM4821).");
      return;
    }
    if (codeError) { toast.error(codeError); return; }
    setSaving(true);
    try {
      if (editing) {
        await updateClient({ data: {
          id: editing.id, name: name.trim(),
          code: trimmedCode || null,
          phone: phone || null,
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
          refinery_id: refineryId, name: name.trim(),
          code: trimmedCode || null,
          phone: phone || null,
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
            <Input value={name} onChange={(e) => setName(e.target.value)} onBlur={onNameBlur} required />
          </div>
          <div className="space-y-2">
            <Label>Client Code</Label>
            <Input
              value={code}
              onChange={(e) => { setCode(e.target.value.toUpperCase()); setCodeError(null); setCodeWarn(null); }}
              onBlur={onCodeBlur}
              placeholder="Auto-generated (e.g. AM4821)"
              maxLength={6}
              className="font-mono tracking-wider"
            />
            {codeError && <p className="text-xs text-destructive">{codeError}</p>}
            {!codeError && codeWarn && <p className="text-xs text-amber-500">{codeWarn}</p>}
            {!codeError && !codeWarn && (
              <p className="text-xs text-muted-foreground">2 capital letters + 4 digits. Leave blank to auto-generate from the client name.</p>
            )}
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
            <Button type="submit" disabled={saving || !!codeError}>{saving ? "Saving…" : "Save"}</Button>
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
  const [fromFeePrice, setFromFeePrice] = useState<string>("");
  const [toFeePrice, setToFeePrice] = useState<string>("");
  // User-edit tracking so we only auto-fill once per client selection
  const [fromFeeEdited, setFromFeeEdited] = useState(false);
  const [toFeeEdited, setToFeeEdited] = useState(false);

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
  // Auto-fill From fee price from selected From client
  useEffect(() => {
    if (type === "settlement" && settlementKind === "gold" && applyFee && fromClient && !fromFeeEdited) {
      setFromFeePrice(String(fromClient.refining_fee_price ?? 0));
    }
  }, [type, settlementKind, applyFee, fromClient, fromFeeEdited]);
  // Auto-fill To fee price from selected To client
  useEffect(() => {
    if (type === "settlement" && settlementKind === "gold" && applyFee && toClient && !toFeeEdited) {
      setToFeePrice(String(toClient.refining_fee_price ?? 0));
    }
  }, [type, settlementKind, applyFee, toClient, toFeeEdited]);

  const settlementPreview = useMemo(() => {
    const amt = Number(settlementAmount) || 0;
    const fromFp = Number(fromFeePrice) || 0;
    const toFp = Number(toFeePrice) || 0;
    const fromCredit = settlementKind === "gold" && applyFee ? amt * fromFp : 0;
    const toDebit = settlementKind === "gold" && applyFee ? amt * toFp : 0;
    const netProfit = toDebit - fromCredit;
    return { amt, fromFp, toFp, fromCredit, toDebit, netProfit };
  }, [settlementAmount, fromFeePrice, toFeePrice, settlementKind, applyFee]);


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
        const fromFp = Number(fromFeePrice) || 0;
        const toFp = Number(toFeePrice) || 0;
        if (settlementKind === "gold" && applyFee && (!(fromFp >= 0) || !(toFp >= 0))) {
          setSaving(false); toast.error("Fee prices must be ≥ 0"); return;
        }
        await createSettlement({ data: {
          refinery_id: refinery.id,
          from_client_id: fromClientId,
          to_client_id: toClientId,
          kind: settlementKind,
          amount: amt,
          apply_fee: settlementKind === "gold" ? applyFee : false,
          from_fee_price: settlementKind === "gold" && applyFee ? fromFp : 0,
          to_fee_price: settlementKind === "gold" && applyFee ? toFp : 0,
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
              fromFeePrice={fromFeePrice} setFromFeePrice={(s) => { setFromFeeEdited(true); setFromFeePrice(s); }}
              toFeePrice={toFeePrice} setToFeePrice={(s) => { setToFeeEdited(true); setToFeePrice(s); }}
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
  applyFee, setApplyFee,
  fromFeePrice, setFromFeePrice, toFeePrice, setToFeePrice,
  preview,
}: {
  clients: RefineryClient[];
  fromClientId: string; setFromClientId: (s: string) => void;
  toClientId: string; setToClientId: (s: string) => void;
  fromClient?: RefineryClient; toClient?: RefineryClient;
  kind: "gold" | "da"; setKind: (k: "gold" | "da") => void;
  amount: string; setAmount: (s: string) => void;
  applyFee: boolean; setApplyFee: (b: boolean) => void;
  fromFeePrice: string; setFromFeePrice: (s: string) => void;
  toFeePrice: string; setToFeePrice: (s: string) => void;
  preview: { amt: number; fromFp: number; toFp: number; fromCredit: number; toDebit: number; netProfit: number };
}) {
  const fromOptions = clients.filter((c) => c.id !== toClientId);
  const toOptions = clients.filter((c) => c.id !== fromClientId);

  const amt = preview.amt;
  const fromGoldImpact = kind === "gold" ? -amt : 0;
  const fromDaImpact = (kind === "da" ? -amt : 0) + (kind === "gold" && applyFee ? preview.fromCredit : 0);
  const toGoldImpact = kind === "gold" ? amt : 0;
  const toDaImpact = (kind === "da" ? amt : 0) - (kind === "gold" && applyFee ? preview.toDebit : 0);

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
                Credits the From client at their fee price and debits the To client at the entered fee price. The difference is recorded as refinery fee profit.
              </p>
            </div>
          </div>
          {applyFee && (
            <div className="space-y-3 pt-2 border-t border-border/40">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>From Client Fee Price (DA/g)</Label>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" value={fromFeePrice}
                    onChange={(e) => setFromFeePrice(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Auto-filled from {fromClient?.name ?? "From client"}{fromClient ? "" : ""} profile.</p>
                </div>
                <div className="space-y-2">
                  <Label>To Client Fee Price (DA/g)</Label>
                  <Input type="number" step="0.01" min="0" inputMode="decimal" value={toFeePrice}
                    onChange={(e) => setToFeePrice(e.target.value)} />
                  <p className="text-xs text-muted-foreground">Auto-filled from {toClient?.name ?? "To client"} profile · editable.</p>
                </div>
              </div>
              {amt > 0 && (
                <div className="space-y-1 text-sm rounded-md border border-border/40 bg-background/40 p-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">From Credit ({fmtG(amt)} × {fmtDA(preview.fromFp)}/g)</span>
                    <span className="tabular-nums font-semibold text-emerald-500">+{fmtDA(preview.fromCredit)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">To Debit ({fmtG(amt)} × {fmtDA(preview.toFp)}/g)</span>
                    <span className="tabular-nums font-semibold text-ember">−{fmtDA(preview.toDebit)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border/40 mt-1 pt-1">
                    <span className="font-medium">Refinery Fee Profit</span>
                    <span className={`tabular-nums font-semibold ${preview.netProfit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                      {preview.netProfit >= 0 ? "+" : ""}{fmtDA(preview.netProfit)}
                    </span>
                  </div>
                </div>
              )}
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

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, { data: adj }] = await Promise.all([
        supabase.from("refinery_stock").select("pure_gold_stock, da_stock, silver_stock").eq("refinery_id", refinery.id).maybeSingle(),
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

  useEffect(() => { load(); }, [load]);

  if (loading || !stock) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const visibleAdjustments = adjustments.filter((a) => metalFilter === "all" || a.adjustment_metal === metalFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Stock</h1>
          <p className="text-sm text-muted-foreground">{refinery.name} · physical inventory currently available</p>
        </div>
        <Button onClick={() => setAdjustOpen(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-2" /> New Stock Adjustment
        </Button>
      </div>

      {/* Physical stock cards */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="p-4 ring-1 ring-amber-500/20 bg-amber-500/5">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Coins className="h-4 w-4 text-ember" /> Pure Gold Stock</h3>
          <p className="text-2xl font-display tabular-nums">{fmtG(stock.pure_gold_stock)}</p>
        </Card>
        <Card className="p-4 ring-1 ring-slate-400/30 bg-slate-100/30 dark:bg-slate-800/30">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Coins className="h-4 w-4 text-slate-500" /> Silver Stock</h3>
          <p className="text-2xl font-display tabular-nums">{fmtG(stock.silver_stock)}</p>
        </Card>
        <Card className="p-4">
          <h3 className="font-semibold mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-ember" /> DA Cash Balance</h3>
          <p className="text-2xl font-display tabular-nums">{fmtDA(stock.da_stock)}</p>
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
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Stock Adjustments & Movement History</h3>
        </div>
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

// =============================================================
// Net Position tab
// =============================================================
function NetPositionTab({ refinery }: { refinery: Refinery }) {
  type Stock = { pure_gold_stock: number; da_stock: number; silver_stock: number };
  const [stock, setStock] = useState<Stock | null>(null);
  const [clients, setClients] = useState<RefineryClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [goldPrice, setGoldPrice] = useState<number>(0);
  const [silverPrice, setSilverPrice] = useState<number>(0);
  const [savedBy, setSavedBy] = useState<{ name: string | null; at: string | null }>({ name: null, at: null });
  const [saving, setSaving] = useState(false);
  const [draftGold, setDraftGold] = useState<string>("");
  const [draftSilver, setDraftSilver] = useState<string>("");
  const [history, setHistory] = useState<PositionSnapshot[]>([]);
  const [savingSnap, setSavingSnap] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data: s }, cls, price, snaps] = await Promise.all([
        supabase.from("refinery_stock").select("pure_gold_stock, da_stock, silver_stock").eq("refinery_id", refinery.id).maybeSingle(),
        listClients({ data: { refineryId: refinery.id } }),
        getNetPositionPrice({ data: { refineryId: refinery.id } }),
        listPositionSnapshots({ data: { refineryId: refinery.id, limit: 60 } }),
      ]);
      const stockRow = (s as { pure_gold_stock: number; da_stock: number; silver_stock: number } | null) ?? { pure_gold_stock: 0, da_stock: 0, silver_stock: 0 };
      setStock({
        pure_gold_stock: Number(stockRow.pure_gold_stock),
        da_stock: Number(stockRow.da_stock),
        silver_stock: Number(stockRow.silver_stock ?? 0),
      });
      setClients(cls);
      setGoldPrice(price.goldPrice);
      setSilverPrice(price.silverPrice);
      setDraftGold(String(price.goldPrice || ""));
      setDraftSilver(String(price.silverPrice || ""));
      setSavedBy({ name: price.setByUsername, at: price.setAt });
      setHistory(snaps);
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setLoading(false); }
  }, [refinery.id]);

  useEffect(() => { load(); }, [load]);

  async function onSavePrices() {
    const g = Number(draftGold); const s = Number(draftSilver);
    if (!Number.isFinite(g) || g <= 0) return toast.error("Gold price must be greater than 0");
    if (!Number.isFinite(s) || s < 0) return toast.error("Silver price must be ≥ 0");
    setSaving(true);
    try {
      await saveNetPositionPrice({ data: { refineryId: refinery.id, goldPrice: g, silverPrice: s } });
      toast.success("Prices saved");
      await load();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
    finally { setSaving(false); }
  }

  if (loading || !stock) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const canCompute = goldPrice > 0; // required for DA → gold equivalent

  // Sign convention: stored balances are positive when the refinery OWES the client.
  // Asset side (client owes refinery) is when stored balance < 0.
  const clientRows = clients.map((c) => {
    const storedGold = Number(c.purity_balance);
    const storedDa = Number(c.da_balance);
    const goldOwedToRefinery = storedGold < 0 ? -storedGold : 0;     // asset, grams
    const goldOwedToClient   = storedGold > 0 ? storedGold : 0;      // liability, grams
    const daOwedToRefinery   = storedDa < 0 ? -storedDa : 0;         // asset, DA
    const daOwedToClient     = storedDa > 0 ? storedDa : 0;          // liability, DA
    return { id: c.id, name: c.name, storedGold, storedDa,
             goldOwedToRefinery, goldOwedToClient,
             daOwedToRefinery, daOwedToClient };
  });

  // Aggregated assets / liabilities
  const clientsOweGold = clientRows.reduce((a, r) => a + r.goldOwedToRefinery, 0);
  const refineryOwesGold = clientRows.reduce((a, r) => a + r.goldOwedToClient, 0);
  const clientsOweDa = clientRows.reduce((a, r) => a + r.daOwedToRefinery, 0);
  const refineryOwesDa = clientRows.reduce((a, r) => a + r.daOwedToClient, 0);
  const netClientGold = clientsOweGold - refineryOwesGold;
  const netClientDa = clientsOweDa - refineryOwesDa;

  const silverValueDA = stock.silver_stock * silverPrice;
  const silverEq = canCompute ? silverValueDA / goldPrice : 0;
  const daCashEq = canCompute ? stock.da_stock / goldPrice : 0;
  const clientsOweDaEq = canCompute ? clientsOweDa / goldPrice : 0;
  const refineryOwesDaEq = canCompute ? refineryOwesDa / goldPrice : 0;
  const netClientDaEq = canCompute ? netClientDa / goldPrice : 0;

  // Refinery Equity (Pure Gold Equivalent):
  //   Pure Gold Stock + Clients Owe Gold + Clients Owe DA (gold eq)
  //   − Refinery Owes Gold − Refinery Owes DA (gold eq)
  const totalReceivables = clientsOweGold + clientsOweDaEq;
  const totalPayables = refineryOwesGold + refineryOwesDaEq;
  const refineryEquity = stock.pure_gold_stock + totalReceivables - totalPayables;
  // Extended balance-sheet view (informational only)
  const totalAssets =
    stock.pure_gold_stock + silverEq + daCashEq + clientsOweGold + clientsOweDaEq;
  const totalLiabilities = refineryOwesGold + refineryOwesDaEq;

  async function onSaveSnapshot() {
    if (!stock) return;
    setSavingSnap(true);
    try {
      await recordPositionSnapshot({
        data: {
          refineryId: refinery.id,
          pureGoldStock: stock.pure_gold_stock,
          silverStock: stock.silver_stock,
          daCashBalance: stock.da_stock,
          netGoldPosition: refineryEquity,
          goldPrice: goldPrice || null,
          silverPrice: silverPrice || null,
        },
      });
      toast.success("Snapshot saved");
      const snaps = await listPositionSnapshots({ data: { refineryId: refinery.id, limit: 60 } });
      setHistory(snaps);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setSavingSnap(false);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl">Net Position</h1>
        <p className="text-sm text-muted-foreground">{refinery.name} · refinery equity expressed in Pure Gold (real-time)</p>
      </div>

      {/* HERO: Inventory Pure Gold Stock (actual inventory only) */}
      <Card className="p-6 bg-gradient-to-br from-amber-500/15 via-background to-background border-amber-500/40">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.2em] text-amber-500/90">Inventory Pure Gold Stock</p>
            <p className="font-display text-5xl tabular-nums text-amber-500 mt-1">
              {fmtG(stock.pure_gold_stock)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              Actual pure gold currently held by the refinery. Excludes receivables, payables, DA, and silver.
            </p>
          </div>
          <Badge variant="secondary" className="text-sm px-3 py-1 bg-amber-500/15 text-amber-500 border-amber-500/30">
            Inventory
          </Badge>
        </div>
      </Card>

      {/* HERO: Net Physical Pure Gold Position */}
      {(() => {
        const netPhysical = stock.pure_gold_stock + clientsOweGold - refineryOwesGold;
        return (
          <Card className="p-6 bg-gradient-to-br from-amber-400/15 via-background to-background border-amber-400/40">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-amber-400/90">Net Physical Pure Gold Position</p>
                <p className={`font-display text-5xl tabular-nums mt-1 ${signClass(netPhysical)}`}>
                  {signed(netPhysical, fmtG)}
                </p>
                <div className="text-xs text-muted-foreground mt-2 space-y-0.5">
                  <p>Inventory: <span className="tabular-nums text-foreground">{fmtG(stock.pure_gold_stock)}</span></p>
                  <p>Client Receivables: <span className="tabular-nums text-emerald-500">+ {fmtG(clientsOweGold)}</span></p>
                  <p>Client Payables: <span className="tabular-nums text-red-500">− {fmtG(refineryOwesGold)}</span></p>
                </div>
              </div>
              <Badge variant="secondary" className={`text-sm px-3 py-1 ${statusBadgeCls(netPhysical)}`}>
                Real Gold Position
              </Badge>
            </div>
          </Card>
        );
      })()}

      <Card className="p-6 bg-gradient-to-br from-amber-500/10 via-background to-background border-amber-500/30">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Refinery Equity</p>
              <TooltipProvider delayDuration={150}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button type="button" className="text-muted-foreground hover:text-foreground transition-colors" aria-label="How is equity calculated?">
                      <Info className="h-3.5 w-3.5" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
                    <p className="font-semibold mb-1">Refinery Equity (Pure Gold)</p>
                    <p>= Pure Gold Stock Available</p>
                    <p>+ Clients Owe Refinery Gold</p>
                    <p>+ Clients Owe Refinery DA (gold equivalent)</p>
                    <p>− Refinery Owes Clients Gold</p>
                    <p>− Refinery Owes Clients DA (gold equivalent)</p>
                    <p className="mt-2 text-muted-foreground">Silver and DA cash are shown in Other Holdings.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
            <p className={`font-display text-5xl tabular-nums ${signClass(refineryEquity)}`}>
              {signed(refineryEquity, fmtG)}
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              {fmtG(stock.pure_gold_stock)} stock + {fmtG(totalReceivables)} receivables − {fmtG(totalPayables)} payables
            </p>
          </div>
          <div className="flex flex-col gap-2 items-start md:items-end">
            <Badge variant="secondary" className={`text-sm px-3 py-1 ${statusBadgeCls(refineryEquity)}`}>
              {refineryEquity > 0.0001 ? "Positive Equity" : refineryEquity < -0.0001 ? "Negative Equity" : "Neutral"}
            </Badge>
            <Button size="sm" variant="outline" onClick={onSaveSnapshot} disabled={savingSnap}>
              {savingSnap && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Today's Snapshot
            </Button>
          </div>
        </div>
      </Card>

      {/* Refinery Equity Breakdown */}
      <Card className="p-4 border-amber-500/20">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2">
          <Scale className="h-4 w-4 text-amber-500" /> Position Calculation Breakdown
        </h3>
        <div className="space-y-2 text-sm">
          <NPRow label="Pure Gold Stock Available" value={`+ ${fmtG(stock.pure_gold_stock)}`} cls="text-amber-500" />
          <NPRow label="Clients Owe Refinery Gold" value={`+ ${fmtG(clientsOweGold)}`} cls="text-emerald-500" />
          <NPRow
            label="Clients Owe Refinery DA (gold eq)"
            value={canCompute ? `+ ${fmtG(clientsOweDaEq)}` : "— set gold price"}
            cls={canCompute ? "text-emerald-500" : "text-muted-foreground"}
          />
          <NPRow label="Refinery Owes Clients Gold" value={`− ${fmtG(refineryOwesGold)}`} cls="text-red-500" />
          <NPRow
            label="Refinery Owes Clients DA (gold eq)"
            value={canCompute ? `− ${fmtG(refineryOwesDaEq)}` : "— set gold price"}
            cls={canCompute ? "text-red-500" : "text-muted-foreground"}
          />
          <div className="flex items-center justify-between pt-2 border-t-2 border-amber-500/40">
            <span className="text-xs uppercase tracking-[0.18em] text-amber-500 font-semibold">Final Refinery Equity</span>
            <span className={`font-display text-2xl tabular-nums ${signClass(refineryEquity)}`}>{signed(refineryEquity, fmtG)}</span>
          </div>
          <div className="pt-2 mt-2 border-t border-dashed border-border text-[11px] text-muted-foreground">
            <p className="uppercase tracking-wider mb-1">Formula Check</p>
            <p className="font-mono">
              {fmtG(stock.pure_gold_stock)} + {fmtG(totalReceivables)} − {fmtG(totalPayables)} = <span className={signClass(refineryEquity)}>{fmtG(refineryEquity)}</span>
            </p>
            {!canCompute && (
              <p className="mt-1 text-amber-600">DA gold-equivalent is excluded until a Gold Price is saved below.</p>
            )}
          </div>
        </div>
      </Card>

      {/* Price inputs */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><Wallet className="h-4 w-4 text-ember" /> Price Inputs <span className="text-xs font-normal text-muted-foreground">(for DA / silver display only)</span></h3>
        <div className="flex flex-wrap items-end gap-4">
          <div>
            <Label className="text-xs">Gold Price (DA / g)</Label>
            <Input type="number" value={draftGold} onChange={(e) => setDraftGold(e.target.value)} className="w-[180px]" />
          </div>
          <div>
            <Label className="text-xs">Silver Price (DA / g)</Label>
            <Input type="number" value={draftSilver} onChange={(e) => setDraftSilver(e.target.value)} className="w-[180px]" />
          </div>
          <Button onClick={onSavePrices} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Prices
          </Button>
          {savedBy.at && (
            <p className="text-xs text-muted-foreground">
              Last saved by <span className="font-medium">{savedBy.name ?? "—"}</span> on {new Date(savedBy.at).toLocaleString()}
            </p>
          )}
        </div>
        {!canCompute && (
          <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" /> Save a Gold Price greater than 0 to convert silver and DA into pure gold equivalent below.</p>
        )}
      </Card>

      {/* Refinery Holdings */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Other Holdings <span className="text-xs font-normal text-muted-foreground">(not included in Pure Gold Equity unless converted)</span></h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-xs uppercase tracking-wider text-amber-500/80">Pure Gold</p>
            <p className="font-display text-2xl tabular-nums text-amber-500 mt-1">{fmtG(stock.pure_gold_stock)} g</p>
          </div>
          <div className="rounded-md border border-slate-400/30 bg-slate-400/5 p-4">
            <p className="text-xs uppercase tracking-wider text-slate-300">Silver</p>
            <p className="font-display text-2xl tabular-nums text-slate-200 mt-1">{fmtG(stock.silver_stock)} g</p>
          </div>
          <div className="rounded-md border border-border bg-muted/10 p-4">
            <p className="text-xs uppercase tracking-wider text-muted-foreground">DA Cash</p>
            <p className="font-display text-2xl tabular-nums mt-1">{fmtDA(stock.da_stock)} DA</p>
          </div>
        </div>
      </Card>

      {/* Assets / Liabilities */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="p-4 border-emerald-500/30">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-emerald-500">
            <TrendingUp className="h-4 w-4" /> Assets
          </h3>
          <div className="space-y-2 text-sm">
            <NPRow label="Pure Gold Stock" value={fmtG(stock.pure_gold_stock)} cls="text-amber-500" />
            <NPRow label="Silver Equivalent" value={fmtG(silverEq)} cls="text-slate-300" />
            <NPRow label="DA Cash Equivalent" value={fmtG(daCashEq)} />
            <NPRow label="Clients Owe Refinery Gold" value={fmtG(clientsOweGold)} cls={signClass(clientsOweGold)} />
            <NPRow label="Clients Owe Refinery DA (g eq.)" value={fmtG(clientsOweDaEq)} cls={signClass(clientsOweDaEq)} />
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Assets</span>
            <span className="font-display text-lg tabular-nums text-emerald-500">{fmtG(totalAssets)}</span>
          </div>
        </Card>

        <Card className="p-4 border-red-500/30">
          <h3 className="font-semibold text-sm mb-3 flex items-center gap-2 text-red-500">
            <AlertTriangle className="h-4 w-4" /> Liabilities
          </h3>
          <div className="space-y-2 text-sm">
            <NPRow label="Refinery Owes Clients Gold" value={fmtG(refineryOwesGold)} cls={refineryOwesGold > 0.0001 ? "text-red-500" : "text-muted-foreground"} />
            <NPRow label="Refinery Owes Clients DA (g eq.)" value={fmtG(refineryOwesDaEq)} cls={refineryOwesDaEq > 0.0001 ? "text-red-500" : "text-muted-foreground"} />
          </div>
          <div className="mt-3 pt-3 border-t border-border flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Total Liabilities</span>
            <span className="font-display text-lg tabular-nums text-red-500">{fmtG(totalLiabilities)}</span>
          </div>
        </Card>
      </div>

      {/* Client Exposure Summary */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3">Client Exposure Summary</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <NPRow label="Clients Owe Refinery Gold" value={fmtG(clientsOweGold)} cls={signClass(clientsOweGold)} />
          <NPRow label="Refinery Owes Clients Gold" value={fmtG(refineryOwesGold)} cls={refineryOwesGold > 0.0001 ? "text-red-500" : "text-muted-foreground"} />
          <NPRow label="Net Client Gold Position" value={signed(netClientGold, fmtG)} cls={signClass(netClientGold)} />
          <div />
          <NPRow label="Clients Owe Refinery DA" value={fmtDA(clientsOweDa)} muted />
          <NPRow label="Refinery Owes Clients DA" value={fmtDA(refineryOwesDa)} muted />
          <NPRow label="Net Client DA Position" value={signed(netClientDa, fmtDA)} cls={signClass(netClientDa)} />
          <NPRow label="Net Client DA (Pure Gold Equivalent)" value={signed(netClientDaEq, fmtG)} cls={signClass(netClientDaEq)} />
        </div>
      </Card>

      {/* Client positions detail */}
      <Card>
        <div className="px-4 py-3 border-b border-border">
          <h3 className="font-semibold text-sm">Client Positions <span className="text-xs text-muted-foreground font-normal">· per-client breakdown</span></h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="p-3">Client</th>
                <th className="p-3 text-right">Owes Refinery Gold</th>
                <th className="p-3 text-right">Owed by Refinery Gold</th>
                <th className="p-3 text-right">Owes Refinery DA</th>
                <th className="p-3 text-right">Owed by Refinery DA</th>
              </tr>
            </thead>
            <tbody>
              {clientRows.length === 0 && (
                <tr><td colSpan={5} className="p-6 text-center text-muted-foreground">No clients</td></tr>
              )}
              {clientRows.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{r.name}</td>
                  <td className={`p-3 text-right tabular-nums ${r.goldOwedToRefinery > 0.0001 ? "text-emerald-500" : "text-muted-foreground"}`}>{r.goldOwedToRefinery > 0.0001 ? fmtG(r.goldOwedToRefinery) : "—"}</td>
                  <td className={`p-3 text-right tabular-nums ${r.goldOwedToClient > 0.0001 ? "text-red-500" : "text-muted-foreground"}`}>{r.goldOwedToClient > 0.0001 ? fmtG(r.goldOwedToClient) : "—"}</td>
                  <td className={`p-3 text-right tabular-nums ${r.daOwedToRefinery > 0.01 ? "text-emerald-500" : "text-muted-foreground"}`}>{r.daOwedToRefinery > 0.01 ? fmtDA(r.daOwedToRefinery) : "—"}</td>
                  <td className={`p-3 text-right tabular-nums ${r.daOwedToClient > 0.01 ? "text-red-500" : "text-muted-foreground"}`}>{r.daOwedToClient > 0.01 ? fmtDA(r.daOwedToClient) : "—"}</td>
                </tr>
              ))}
            </tbody>
            {clientRows.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border bg-muted/10 font-semibold">
                  <td className="p-3">Total</td>
                  <td className="p-3 text-right tabular-nums text-emerald-500">{fmtG(clientsOweGold)}</td>
                  <td className="p-3 text-right tabular-nums text-red-500">{fmtG(refineryOwesGold)}</td>
                  <td className="p-3 text-right tabular-nums text-emerald-500">{fmtDA(clientsOweDa)}</td>
                  <td className="p-3 text-right tabular-nums text-red-500">{fmtDA(refineryOwesDa)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </Card>

      {/* Calculation Breakdown */}
      <Card className="p-4">
        <h3 className="font-semibold text-sm mb-3 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-ember" /> Position Calculation Breakdown</h3>
        <div className="font-mono text-sm space-y-1.5">
          <BreakdownLine label="Pure Gold Stock" value={stock.pure_gold_stock} cls="text-amber-500" />
          <BreakdownLine label="Silver Equivalent" value={silverEq} cls="text-slate-300" />
          <BreakdownLine label="DA Cash Equivalent" value={daCashEq} />
          <BreakdownLine label="Clients Owe Refinery Gold" value={clientsOweGold} />
          <BreakdownLine label="Clients Owe Refinery DA (g eq.)" value={clientsOweDaEq} />
          <BreakdownLine label="Refinery Owes Clients Gold" value={-refineryOwesGold} />
          <BreakdownLine label="Refinery Owes Clients DA (g eq.)" value={-refineryOwesDaEq} />
          <div className="border-t border-border my-2" />
          <BreakdownLine label="REFINERY EQUITY" value={refineryEquity} cls={`font-bold ${signClass(refineryEquity)}`} />
        </div>
      </Card>

      {/* Position History */}
      <Card>
        <div className="px-4 py-3 border-b border-border flex items-center justify-between">
          <h3 className="font-semibold text-sm">Position History <span className="text-xs text-muted-foreground font-normal">· daily snapshots</span></h3>
          <Button size="sm" variant="outline" onClick={onSaveSnapshot} disabled={savingSnap || !canCompute}>
            {savingSnap && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}Save Today's Snapshot
          </Button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Pure Gold Stock</th>
                <th className="p-3 text-right">Silver Stock</th>
                <th className="p-3 text-right">DA Cash</th>
                <th className="p-3 text-right">Refinery Equity</th>
                <th className="p-3">Saved By</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 && (
                <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No snapshots yet. Save today's snapshot to start tracking.</td></tr>
              )}
              {history.map((s) => (
                <tr key={s.id} className="border-b border-border last:border-0">
                  <td className="p-3 font-medium">{s.snapshotDate}</td>
                  <td className="p-3 text-right tabular-nums text-amber-500">{fmtG(s.pureGoldStock)}</td>
                  <td className="p-3 text-right tabular-nums text-slate-300">{fmtG(s.silverStock)}</td>
                  <td className="p-3 text-right tabular-nums">{fmtDA(s.daCashBalance)}</td>
                  <td className={`p-3 text-right tabular-nums font-semibold ${signClass(s.netGoldPosition)}`}>{signed(s.netGoldPosition, fmtG)}</td>
                  <td className="p-3 text-xs text-muted-foreground">{s.createdByUsername ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function NPRow({ label, value, cls, muted }: { label: string; value: string; cls?: string; muted?: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
      <span className={`text-xs ${muted ? "text-muted-foreground" : ""}`}>{label}</span>
      <span className={`tabular-nums font-medium ${cls ?? ""}`}>{value}</span>
    </div>
  );
}

function BreakdownLine({ label, value, cls }: { label: string; value: number; cls?: string }) {
  const dots = ".".repeat(Math.max(2, 40 - label.length));
  return (
    <div className={`flex items-baseline gap-2 ${cls ?? ""}`}>
      <span>{label}</span>
      <span className="text-muted-foreground/40 truncate flex-1">{dots}</span>
      <span className="tabular-nums">{signed(value, fmtG)}</span>
    </div>
  );
}

function signClass(v: number): string {
  if (v > 0.0001) return "text-emerald-500";
  if (v < -0.0001) return "text-red-500";
  return "text-muted-foreground";
}

function statusLabel(v: number): string {
  if (v > 0.0001) return "Positive";
  if (v < -0.0001) return "Negative";
  return "Neutral";
}

function statusBadgeCls(v: number): string {
  if (v > 0.0001) return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
  if (v < -0.0001) return "bg-red-500/15 text-red-500 border-red-500/30";
  return "bg-muted text-muted-foreground";
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
type ProfileSubTab = "general" | "security" | "preferences" | "sessions";

function passwordStrength(p: string): { label: string; score: number; color: string } {
  let s = 0;
  if (p.length >= 8) s++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) s++;
  if (/\d/.test(p)) s++;
  if (/[^A-Za-z0-9]/.test(p)) s++;
  if (p.length >= 12) s++;
  const labels = ["Very weak", "Weak", "Fair", "Good", "Strong", "Very strong"];
  const colors = ["bg-destructive", "bg-destructive", "bg-amber-500", "bg-amber-500", "bg-emerald-500", "bg-emerald-500"];
  return { label: labels[s], score: s, color: colors[s] };
}

function fmtDateTime(s: string | null | undefined): string {
  if (!s) return "—";
  try { return new Date(s).toLocaleString(); } catch { return s; }
}

type SwapProfile = Awaited<ReturnType<typeof getSwapOwnProfile>>;
type SwapPrefs = Awaited<ReturnType<typeof getUserPreferences>>;
type LoginRow = Awaited<ReturnType<typeof getLoginHistory>>[number];

function ProfileTab() {
  const { lang, setLang } = useLang();
  const [sub, setSub] = useState<ProfileSubTab>("general");
  const [loading, setLoading] = useState(true);

  // General
  const [p, setP] = useState<SwapProfile | null>(null);
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [savingGeneral, setSavingGeneral] = useState(false);

  // Security
  const [currentPwd, setCurrentPwd] = useState("");
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
  const strength = passwordStrength(pwd);
  const pwdMatch = pwd === pwd2;

  // Preferences
  const [prefs, setPrefs] = useState<SwapPrefs>({
    theme: "system", number_format: "en", date_format: "DD/MM/YYYY", locale: "en",
  } as SwapPrefs);
  const [savingPrefs, setSavingPrefs] = useState(false);

  // Sessions
  const [history, setHistory] = useState<LoginRow[]>([]);
  const [signingOutAll, setSigningOutAll] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [pr, prRes, h] = await Promise.all([
          getSwapOwnProfile(),
          getUserPreferences().catch(() => null),
          getLoginHistory().catch(() => []),
        ]);
        if (cancelled) return;
        setP(pr);
        setDisplayName(pr.displayName ?? "");
        setEmail(pr.email ?? pr.authEmail ?? "");
        setPhone(pr.phone ?? "");
        if (prRes) setPrefs(prRes as SwapPrefs);
        setHistory(h as LoginRow[]);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load profile");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveGeneral = async (e: FormEvent) => {
    e.preventDefault();
    setSavingGeneral(true);
    try {
      await updateSwapOwnProfile({ data: {
        display_name: displayName,
        email: email || "",
        phone: phone || "",
      }});
      toast.success("Profile updated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSavingGeneral(false); }
  };

  const changePassword = async (e: FormEvent) => {
    e.preventDefault();
    if (!currentPwd) { toast.error("Current password is required"); return; }
    if (pwd.length < 6) { toast.error("New password must be at least 6 characters"); return; }
    if (pwd !== pwd2) { toast.error("New password and confirmation do not match"); return; }
    setSavingPwd(true);
    try {
      await updateSwapOwnPassword({ data: { current_password: currentPwd, password: pwd } });
      toast.success("Password changed");
      setCurrentPwd(""); setPwd(""); setPwd2("");
      // refresh password_changed_at
      try { setP(await getSwapOwnProfile()); } catch { /* ignore */ }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSavingPwd(false); }
  };

  const savePref = async (next: SwapPrefs) => {
    setPrefs(next);
    setSavingPrefs(true);
    try {
      await updateUserPreferences({ data: {
        theme: next.theme as "light" | "dark" | "system",
        number_format: next.number_format as "en" | "eu",
        date_format: next.date_format as "DD/MM/YYYY" | "MM/DD/YYYY" | "YYYY-MM-DD",
      }});
      // Apply theme immediately
      if (typeof document !== "undefined") {
        const root = document.documentElement;
        const wantDark = next.theme === "dark"
          || (next.theme === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
        root.classList.toggle("dark", wantDark);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save preferences");
    } finally { setSavingPrefs(false); }
  };

  const changeLanguage = (l: Lang) => {
    setLang(l); // persists per-user + applies dir immediately
    toast.success(l === "ar" ? "تم تغيير اللغة" : l === "fr" ? "Langue mise à jour" : "Language updated");
  };

  const signOutAll = async () => {
    if (!confirm("Sign out of all other devices? You will stay signed in here.")) return;
    setSigningOutAll(true);
    try {
      await signOutEverywhere();
      toast.success("Signed out of all devices");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally { setSigningOutAll(false); }
  };

  if (loading) return <p className="text-muted-foreground text-sm">Loading…</p>;

  const subTabs: Array<{ id: ProfileSubTab; label: string; icon: typeof UserIcon }> = [
    { id: "general", label: "General", icon: UserIcon },
    { id: "security", label: "Security", icon: ShieldCheck },
    { id: "preferences", label: "Preferences", icon: SettingsIcon },
    { id: "sessions", label: "Sessions", icon: Monitor },
  ];

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl">Profile</h1>
        <p className="text-sm text-muted-foreground">Manage your account, security and preferences</p>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-border">
        {subTabs.map((t) => {
          const Icon = t.icon;
          const active = sub === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setSub(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                active ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {sub === "general" && (
        <Card className="p-6 space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Username</p>
              <p className="font-medium">{p?.username ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Role</p>
              <p className="font-medium capitalize">{p?.isAdmin ? "admin" : (p?.role ?? "—")}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Assigned Refinery</p>
              <p className="font-medium">{p?.refineryName ?? "—"}</p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Created</p>
              <p className="font-medium">{fmtDateTime(p?.createdAt)}</p>
            </div>
          </div>

          <form onSubmit={saveGeneral} className="space-y-4 border-t border-border pt-6">
            <div className="space-y-2">
              <Label>Display Name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={120} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={32} placeholder="+213 …" />
            </div>
            <Button type="submit" disabled={savingGeneral}>
              {savingGeneral ? "Saving…" : "Save changes"}
            </Button>
          </form>
        </Card>
      )}

      {sub === "security" && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <div>
              <h3 className="text-sm font-semibold">Change password</h3>
              <p className="text-xs text-muted-foreground">Your current password is required to set a new one.</p>
            </div>
            <form onSubmit={changePassword} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs">Current password</Label>
                <div className="relative">
                  <Input
                    type={showCurrent ? "text" : "password"}
                    value={currentPwd}
                    onChange={(e) => setCurrentPwd(e.target.value)}
                    autoComplete="current-password"
                  />
                  <button type="button" onClick={() => setShowCurrent((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showCurrent ? "Hide password" : "Show password"}>
                    {showCurrent ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">New password</Label>
                <div className="relative">
                  <Input
                    type={showNew ? "text" : "password"}
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowNew((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showNew ? "Hide password" : "Show password"}>
                    {showNew ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwd && (
                  <div className="space-y-1">
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full ${strength.color} transition-all`} style={{ width: `${(strength.score / 5) * 100}%` }} />
                    </div>
                    <p className="text-[11px] text-muted-foreground">Strength: {strength.label}</p>
                  </div>
                )}
              </div>
              <div className="space-y-2">
                <Label className="text-xs">Confirm new password</Label>
                <div className="relative">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    value={pwd2}
                    onChange={(e) => setPwd2(e.target.value)}
                    autoComplete="new-password"
                  />
                  <button type="button" onClick={() => setShowConfirm((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label={showConfirm ? "Hide password" : "Show password"}>
                    {showConfirm ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                {pwd2 && !pwdMatch && <p className="text-[11px] text-destructive">Passwords do not match.</p>}
              </div>
              <Button type="submit" disabled={savingPwd || !currentPwd || !pwd || !pwdMatch}>
                {savingPwd ? "Saving…" : "Change password"}
              </Button>
            </form>
          </Card>

          <Card className="p-6">
            <h3 className="text-sm font-semibold mb-4">Account activity</h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Login</p>
                <p className="font-medium">{fmtDateTime(p?.lastSignInAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Password Last Changed</p>
                <p className="font-medium">{fmtDateTime(p?.passwordChangedAt)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Account Created</p>
                <p className="font-medium">{fmtDateTime(p?.createdAt)}</p>
              </div>
            </div>
          </Card>
        </div>
      )}

      {sub === "preferences" && (
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-primary" />
              <h3 className="text-sm font-semibold">Language</h3>
            </div>
            <p className="text-xs text-muted-foreground">Choose the interface language. Arabic switches the app to right-to-left.</p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {([
                { id: "en" as Lang, label: "English", sub: "Default" },
                { id: "fr" as Lang, label: "Français", sub: "French" },
                { id: "ar" as Lang, label: "العربية", sub: "Arabic (RTL)" },
              ]).map((opt) => {
                const active = lang === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => changeLanguage(opt.id)}
                    className={`text-left rounded-md border px-4 py-3 transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <div className="font-medium">{opt.label}</div>
                    <div className="text-xs text-muted-foreground">{opt.sub}</div>
                  </button>
                );
              })}
            </div>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-semibold">Date format</h3>
            <Select value={prefs.date_format} onValueChange={(v) => savePref({ ...prefs, date_format: v as SwapPrefs["date_format"] })}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY">DD/MM/YYYY</SelectItem>
                <SelectItem value="MM/DD/YYYY">MM/DD/YYYY</SelectItem>
                <SelectItem value="YYYY-MM-DD">YYYY-MM-DD</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-semibold">Number format</h3>
            <Select value={prefs.number_format} onValueChange={(v) => savePref({ ...prefs, number_format: v as SwapPrefs["number_format"] })}>
              <SelectTrigger className="max-w-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="en">1,000.00</SelectItem>
                <SelectItem value="eu">1.000,00</SelectItem>
              </SelectContent>
            </Select>
          </Card>

          <Card className="p-6 space-y-4">
            <h3 className="text-sm font-semibold">Theme</h3>
            <div className="grid grid-cols-3 gap-2 max-w-md">
              {([
                { id: "light" as const, label: "Light", icon: Sun },
                { id: "dark" as const, label: "Dark", icon: Moon },
                { id: "system" as const, label: "System", icon: Monitor },
              ]).map((opt) => {
                const Icon = opt.icon;
                const active = prefs.theme === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => savePref({ ...prefs, theme: opt.id })}
                    className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
                      active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
                    }`}
                  >
                    <Icon className="h-4 w-4" /> {opt.label}
                  </button>
                );
              })}
            </div>
            {savingPrefs && <p className="text-[11px] text-muted-foreground">Saving…</p>}
          </Card>
        </div>
      )}

      {sub === "sessions" && (
        <div className="space-y-6">
          <Card className="p-6 space-y-3">
            <h3 className="text-sm font-semibold">Current session</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Signed in as</p>
                <p className="font-medium">{p?.email ?? p?.authEmail ?? "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wider">Last Login</p>
                <p className="font-medium">{fmtDateTime(p?.lastSignInAt)}</p>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold">Recent logins</h3>
              <Button variant="outline" size="sm" onClick={signOutAll} disabled={signingOutAll}>
                <LogOut className="h-4 w-4 mr-1" /> {signingOutAll ? "Signing out…" : "Logout All Devices"}
              </Button>
            </div>
            {history.length === 0 ? (
              <p className="text-sm text-muted-foreground">No recent login history.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground border-b border-border">
                      <th className="p-2">When</th>
                      <th className="p-2">Device</th>
                      <th className="p-2">Browser</th>
                      <th className="p-2">IP</th>
                      <th className="p-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row.id} className="border-b border-border last:border-0">
                        <td className="p-2">{fmtDateTime(row.occurred_at)}</td>
                        <td className="p-2">{row.device ?? "—"}</td>
                        <td className="p-2">{row.browser ?? "—"}</td>
                        <td className="p-2 font-mono text-xs">{row.ip ?? "—"}</td>
                        <td className={`p-2 capitalize ${row.status === "success" ? "text-emerald-500" : "text-destructive"}`}>{row.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
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
    root.render(<AccountStatementReport data={statement} />);

    // Poll until React 18 concurrent renderer has committed AND pages are laid out.
    // The previous double-rAF approach raced on first click (commit hadn't happened yet).
    const waitForPages = async (): Promise<HTMLElement[]> => {
      const deadline = Date.now() + 5000;
      while (Date.now() < deadline) {
        const wrapper = host.firstElementChild as HTMLElement | null;
        if (wrapper) {
          const pages = Array.from(
            wrapper.querySelectorAll<HTMLElement>("[data-statement-page]"),
          );
          if (pages.length > 0 && pages[0].offsetHeight > 0) return pages;
        }
        await new Promise<void>((r) => requestAnimationFrame(() => r()));
      }
      throw new Error("Statement renderer timed out before producing pages");
    };

    const pages = await waitForPages();
    // Wait for fonts so text is crisp
    try { await (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready; } catch { /* noop */ }
    // One more frame so font swap is painted before capture.
    await new Promise<void>((r) => requestAnimationFrame(() => r()));

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
  } catch (err) {
    // Surface technical detail in the console for debugging; the caller shows a clean toast.
    console.error("[AccountStatement] renderStatementToCanvases failed:", err);
    throw err;
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
  const [busy, setBusy] = useState<null | "preview" | "pdf" | "png" | "share">(null);
  const [history, setHistory] = useState<StatementHistoryRow[]>([]);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreviewUrl = useCallback(() => {
    if (previewUrlRef.current) {
      URL.revokeObjectURL(previewUrlRef.current);
      previewUrlRef.current = null;
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try { setHistory(await listRefineryReportHistory({ data: { refineryId: refinery.id, clientId: client.id } })); }
    catch { /* ignore */ }
  }, [refinery.id, client.id]);

  useEffect(() => {
    if (open) { setStatement(null); revokePreviewUrl(); loadHistory(); }
  }, [open, loadHistory, revokePreviewUrl]);

  // Cleanup blob URL on unmount
  useEffect(() => () => revokePreviewUrl(), [revokePreviewUrl]);

  const fileBase = `${(client.code ?? client.name).replace(/\s+/g, "_")}_Statement`;

  const loadStatement = useCallback(
    async (silent = false): Promise<AccountStatement | null> => {
      if (from > to) {
        if (!silent) toast.error("Start date must be before end date");
        return null;
      }
      setLoading(true);
      try {
        const s = await getAccountStatement({
          data: { refineryId: refinery.id, clientId: client.id, from, to },
        });
        setStatement(s);
        await logRefineryReport({ data: {
          refinery_id: refinery.id, client_id: client.id, date_from: from, date_to: to,
          statement_number: s.statement_number, format: "PREVIEW", channel: "preview",
        } }).catch(() => null);
        loadHistory();
        return s;
      } catch (e) {
        console.error("[AccountStatement] load failed:", e);
        if (!silent) toast.error(e instanceof Error ? e.message : "Failed to load statement");
        return null;
      } finally {
        setLoading(false);
      }
    },
    [from, to, refinery.id, client.id, loadHistory],
  );

  // Auto-load statement when dialog opens or date range changes so the
  // renderer is always primed before the user clicks PDF / PNG / Share.
  useEffect(() => {
    if (!open) return;
    void loadStatement(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, from, to]);

  const ensureStatement = async (): Promise<AccountStatement | null> => {
    if (statement) return statement;
    return loadStatement(false);
  };

  const preview = async () => {
    if (busy !== null) return;
    console.log("[AccountStatement] Preview clicked", { from, to, clientId: client.id });
    setBusy("preview");
    try {
      const s = await ensureStatement();
      if (!s) { console.warn("[AccountStatement] Preview: no statement available"); return; }
      const canvases = await renderStatementToCanvases(s);
      if (!canvases.length) throw new Error("Renderer returned no pages");
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
      const blob = pdf.output("blob");
      // Always create a fresh URL so stale data is never shown
      revokePreviewUrl();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      const win = window.open(url, "_blank", "noopener,noreferrer");
      if (!win) {
        toast.error("Preview blocked by popup blocker — allow popups and try again");
        console.error("[AccountStatement] window.open returned null (popup blocked)");
      } else {
        console.log("[AccountStatement] Preview opened", { pages: canvases.length });
      }
    } catch (e) {
      console.error("[AccountStatement] Preview failed:", e);
      toast.error(e instanceof Error ? `Preview failed: ${e.message}` : "Preview failed");
    } finally {
      setBusy(null);
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
            await nav.share({ files: [file], title: filename, text: `${client.code ?? client.name} — ${refinery.name} statement` });
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
            Account Statement — <span className="font-mono">{client.code ?? client.name}</span>
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
          <Button onClick={preview} disabled={busy !== null} className="flex-1 min-w-[120px]">
            {busy === "preview" ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Opening preview…</> : loading ? <><Loader2 className="h-4 w-4 mr-1 animate-spin" />Loading…</> : <><FileText className="h-4 w-4 mr-1" />Preview</>}
          </Button>
          <Button variant="outline" onClick={downloadPdf} disabled={loading || busy !== null || !statement} className="flex-1 min-w-[120px]">
            {busy === "pdf" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Download className="h-4 w-4 mr-1" />}
            {loading && !statement ? "Preparing…" : "PDF"}
          </Button>
          <Button variant="outline" onClick={() => downloadOrSharePng("download")} disabled={loading || busy !== null || !statement} className="flex-1 min-w-[120px]">
            {busy === "png" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <ImageIcon className="h-4 w-4 mr-1" />}
            {loading && !statement ? "Preparing…" : "PNG"}
          </Button>
          <Button variant="outline" onClick={() => downloadOrSharePng("whatsapp")} disabled={loading || busy !== null || !statement} className="flex-1 min-w-[120px]">
            {busy === "share" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Share2 className="h-4 w-4 mr-1" />}
            {loading && !statement ? "Preparing…" : "Share"}
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

// =============================================================
// Embedded variant (rendered inside ATHER Desk sidebar layout)
// =============================================================
export function RefineriesEmbedded() {
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as {
    r?: string;
    rtab?: Tab;
    action?: "new" | "edit";
    txId?: string;
  };
  const rtab: Tab = (search.rtab as Tab) ?? "dashboard";
  const [assignment, setAssignment] = useState<RefineryAssignment | null>(null);
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [a, refs] = await Promise.all([getMyRefineryAssignment(), listRefineries()]);
        setAssignment(a);
        setRefineries(refs);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load refineries");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const activeRefinery = useMemo(
    () => refineries.find((r) => r.id === search.r) ?? null,
    [refineries, search.r],
  );

  const navTo = (next: {
    r?: string;
    rtab?: Tab;
    action?: "new" | "edit";
    txId?: string;
  }) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: "/desk/app/refineries" as any, search: next as any });
  };

  if (loading) {
    return (
      <p className="text-sm text-muted-foreground tracking-[0.25em] py-10 text-center">
        LOADING…
      </p>
    );
  }

  if (!search.r || !activeRefinery) {
    return (
      <RefineryPicker
        refineries={refineries}
        isAdmin={Boolean(assignment?.isAdmin)}
        onSignOut={() => {}}
        embedded
        onPick={(id) => navTo({ r: id, rtab: "dashboard" })}
      />
    );
  }

  return (
    <RefineryShell
      refinery={activeRefinery}
      assignment={assignment!}
      tab={rtab}
      action={search.action}
      txId={search.txId}
      onTab={(t) => navTo({ r: activeRefinery.id, rtab: t })}
      onAction={(action, txId) =>
        navTo({ r: activeRefinery.id, rtab: "transactions", action, txId })
      }
      onBack={assignment?.isAdmin ? () => navTo({}) : undefined}
      onSignOut={() => {}}
      embedded
    />
  );
}

// =============================================================
// Buy / Sell Gold (DA-priced)
// =============================================================
function BuySellTab({ refinery, assignment }: { refinery: Refinery; assignment: RefineryAssignment }) {
  const [rows, setRows] = useState<RefineryTransaction[]>([]);
  const [clients, setClients] = useState<RefineryClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [openKind, setOpenKind] = useState<BuySellKind | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [tx, cl] = await Promise.all([
        listTransactions({ data: { refineryId: refinery.id } }),
        listClients({ data: { refineryId: refinery.id } }),
      ]);
      setRows(tx.filter((t) => t.transaction_type === "buysell"));
      setClients(cl);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [refinery.id]);

  useEffect(() => { load(); }, [load]);

  // Quick statistics for the period (today by default)
  const today = new Date().toISOString().slice(0, 10);
  const todayRows = rows.filter((r) => (r.transaction_date ?? "").startsWith(today));
  const sumWeight = (kind: BuySellKind, metal: BuySellMetal) =>
    todayRows.filter((r) => r.buysell_kind === kind && (r.buysell_metal ?? "gold") === metal)
      .reduce((s, r) => s + Number(r.buysell_weight ?? 0), 0);
  const sumTotal = (kind: BuySellKind) =>
    todayRows.filter((r) => r.buysell_kind === kind)
      .reduce((s, r) => s + Number(r.buysell_total ?? 0), 0);

  return (
    <div className="space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl">Buy / Sell Metals</h1>
          <p className="text-sm text-muted-foreground">
            Record physical gold and silver purchases and sales paid in DA.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setOpenKind("buy")}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1" /> Buy
          </Button>
          <Button
            onClick={() => setOpenKind("sell")}
            className="bg-destructive hover:bg-destructive/90 text-destructive-foreground"
          >
            <TrendingDown className="h-4 w-4 mr-1" /> Sell
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard label="Today · Gold bought" value={fmtG(sumWeight("buy", "gold"))} icon={<TrendingUp className="h-4 w-4 text-amber-500" />} />
        <StatCard label="Today · Gold sold" value={fmtG(sumWeight("sell", "gold"))} icon={<TrendingDown className="h-4 w-4 text-amber-500" />} />
        <StatCard label="Today · Silver bought" value={fmtG(sumWeight("buy", "silver"))} icon={<TrendingUp className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Today · Silver sold" value={fmtG(sumWeight("sell", "silver"))} icon={<TrendingDown className="h-4 w-4 text-muted-foreground" />} />
        <StatCard label="Today · Buy total (DA)" value={fmtDA(sumTotal("buy"))} icon={<TrendingUp className="h-4 w-4 text-emerald-500" />} />
        <StatCard label="Today · Sell total (DA)" value={fmtDA(sumTotal("sell"))} icon={<TrendingDown className="h-4 w-4 text-destructive" />} />
      </div>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/20">
              <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="p-3">Date</th>
                <th className="p-3">Tx #</th>
                <th className="p-3">Client</th>
                <th className="p-3">Metal</th>
                <th className="p-3">Type</th>
                <th className="p-3 text-right">Weight</th>
                <th className="p-3 text-right">Price / g</th>
                <th className="p-3 text-right">Total DA</th>
                <th className="p-3">Settlement</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">No Buy/Sell transactions yet.</td></tr>
              )}
              {rows.map((r) => {
                const buy = r.buysell_kind === "buy";
                const metal = (r.buysell_metal ?? "gold") as BuySellMetal;
                const isGold = metal === "gold";
                return (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="p-3 text-muted-foreground tabular-nums">{r.transaction_date}</td>
                    <td className="p-3 font-mono text-xs">{r.transaction_number}</td>
                    <td className="p-3">{r.client_name ?? "—"}</td>
                    <td className="p-3">
                      <Badge className={isGold
                        ? "bg-amber-500/15 text-amber-500 border-amber-500/30"
                        : "bg-muted text-muted-foreground border-border"}>
                        {isGold ? "GOLD" : "SILVER"}
                      </Badge>
                    </td>
                    <td className="p-3">
                      <Badge className={buy ? "bg-emerald-600/15 text-emerald-500 border-emerald-600/30" : "bg-destructive/15 text-destructive border-destructive/30"}>
                        {buy ? "BUY" : "SELL"}
                      </Badge>
                    </td>
                    <td className="p-3 text-right tabular-nums">{fmtG(Number(r.buysell_weight ?? 0))}</td>
                    <td className="p-3 text-right tabular-nums">{fmtDA(Number(r.buysell_price_per_gram ?? 0))}</td>
                    <td className="p-3 text-right tabular-nums font-semibold">{fmtDA(Number(r.buysell_total ?? 0))}</td>
                    <td className="p-3">
                      <span className="text-xs uppercase tracking-wider">
                        {r.buysell_settlement === "cash" ? "Cash" : "Settlement"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {openKind && (
        <BuySellDialog
          refinery={refinery}
          clients={clients}
          kind={openKind}
          isAdmin={assignment.isAdmin}
          onClose={() => setOpenKind(null)}
          onSaved={() => { setOpenKind(null); load(); }}
        />
      )}
    </div>
  );
}

function BuySellDialog({
  refinery, clients, kind, isAdmin, onClose, onSaved,
}: {
  refinery: Refinery;
  clients: RefineryClient[];
  kind: BuySellKind;
  isAdmin: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState<string>("");
  const [metal, setMetal] = useState<BuySellMetal>("gold");
  const [date, setDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [weight, setWeight] = useState<string>("");
  const [purity, setPurity] = useState<string>("1000");
  const [price, setPrice] = useState<string>("");
  const [settlement, setSettlement] = useState<BuySellSettlement>("settlement");
  const [notes, setNotes] = useState<string>("");
  const [saving, setSaving] = useState(false);

  void isAdmin;
  const w = Number(weight) || 0;
  const p = Number(price) || 0;
  const total = Math.round(w * p);
  const metalLabel = metal === "gold" ? "Gold" : "Silver";

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!clientId) { toast.error("Select a client"); return; }
    if (w <= 0) { toast.error("Weight must be greater than 0"); return; }
    if (p < 0) { toast.error("Price per gram must be >= 0"); return; }
    setSaving(true);
    try {
      await createBuySell({ data: {
        refineryId: refinery.id,
        clientId,
        kind,
        metal,
        settlement,
        weight: w,
        purity: Number(purity) || 1000,
        pricePerGram: p,
        date,
        notes: notes || null,
      }});
      toast.success(`${kind === "buy" ? "Bought" : "Sold"} ${fmtG(w)} of ${metalLabel} for ${fmtDA(total)}`);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === "buy" ? (
              <span className="inline-flex items-center gap-2 text-emerald-500"><Plus className="h-4 w-4" /> Buy {metalLabel}</span>
            ) : (
              <span className="inline-flex items-center gap-2 text-destructive"><TrendingDown className="h-4 w-4" /> Sell {metalLabel}</span>
            )}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <Label>Client</Label>
            <Select value={clientId} onValueChange={setClientId}>
              <SelectTrigger><SelectValue placeholder="Select a client" /></SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Metal Type</Label>
            <Select value={metal} onValueChange={(v) => setMetal(v as BuySellMetal)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="gold">Gold</SelectItem>
                <SelectItem value="silver">Silver</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Date</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <Label>Settlement</Label>
              <Select value={settlement} onValueChange={(v) => setSettlement(v as BuySellSettlement)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="settlement">Settlement (affects DA balance)</SelectItem>
                  <SelectItem value="cash">Cash (no balance change)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <Label>Weight (g)</Label>
              <Input type="number" step="0.01" min="0" value={weight} onChange={(e) => setWeight(e.target.value)} />
            </div>
            <div>
              <Label>Purity (‰)</Label>
              <Input type="number" step="0.01" min="0" max="1000" value={purity} onChange={(e) => setPurity(e.target.value)} />
            </div>
            <div>
              <Label>Price / g (DA)</Label>
              <Input type="number" step="0.01" min="0" value={price} onChange={(e) => setPrice(e.target.value)} />
            </div>
          </div>
          <div className="rounded-md border border-border bg-muted/20 px-3 py-2 flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">Total amount</span>
            <span className={`tabular-nums font-semibold ${kind === "buy" ? "text-emerald-500" : "text-destructive"}`}>{fmtDA(total)}</span>
          </div>
          <div>
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button
              type="submit"
              disabled={saving}
              className={kind === "buy" ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-destructive hover:bg-destructive/90 text-destructive-foreground"}
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
              {kind === "buy" ? `Record Buy` : `Record Sell`}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================
// Client Details Page (360° view)
// =============================================================
const TX_TYPE_LABEL: Record<string, string> = {
  gold: "Gold Movement",
  da: "DA Movement",
  settlement: "Settlement",
  buysell: "Buy / Sell",
  stock_adjustment: "Stock Adjustment",
};

type ClientStmtRow = StatementRow;

function ClientDetailsPage({
  refinery, assignment, clientId,
}: { refinery: Refinery; assignment: RefineryAssignment; clientId: string }) {
  const navigate = useNavigate();
  const [client, setClient] = useState<RefineryClient | null>(null);
  const [statement, setStatement] = useState<AccountStatement | null>(null);
  const [notes, setNotes] = useState<RefineryClientNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"transactions" | "statement" | "timeline" | "notes">("transactions");
  const [editOpen, setEditOpen] = useState(false);
  const [stmtOpen, setStmtOpen] = useState(false);
  const [filterType, setFilterType] = useState<string>("all");
  const [filterFrom, setFilterFrom] = useState<string>("");
  const [filterTo, setFilterTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 25;
  const [newNote, setNewNote] = useState("");
  const [savingNote, setSavingNote] = useState(false);

  const readOnly = assignment.role === "viewer" && !assignment.isAdmin;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      // Load client via listClients (cheap), filter for this id
      const all = await listClients({ data: { refineryId: refinery.id } });
      const c = all.find((x) => x.id === clientId) ?? null;
      setClient(c);
      // Wide statement window (10 years back, 1 year forward) for full history
      const today = new Date();
      const from = `${today.getFullYear() - 10}-01-01`;
      const to = `${today.getFullYear() + 1}-12-31`;
      const [stmt, ns] = await Promise.all([
        getAccountStatement({ data: { refineryId: refinery.id, clientId, from, to } }),
        listClientNotes({ data: { refineryId: refinery.id, clientId } }),
      ]);
      setStatement(stmt);
      setNotes(ns);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load client");
    } finally {
      setLoading(false);
    }
  }, [refinery.id, clientId]);
  useEffect(() => { load(); }, [load]);

  const backToClients = () =>
    navigate({ to: "/desk/refineries", search: { r: refinery.id, tab: "clients" } });

  const submitNote = async () => {
    const body = newNote.trim();
    if (!body) return;
    setSavingNote(true);
    try {
      await addClientNote({ data: { refineryId: refinery.id, clientId, body } });
      setNewNote("");
      const ns = await listClientNotes({ data: { refineryId: refinery.id, clientId } });
      setNotes(ns);
      toast.success("Note added");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to add note");
    } finally { setSavingNote(false); }
  };

  const removeNote = async (id: string) => {
    if (!confirm("Delete this note?")) return;
    try {
      await deleteClientNote({ data: { id } });
      setNotes((prev) => prev.filter((n) => n.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  };

  // ───── Derived: filtered + paginated transactions (newest first) ─────
  const allRows = useMemo<ClientStmtRow[]>(() => {
    if (!statement) return [];
    return [...statement.rows].reverse();
  }, [statement]);

  const filteredRows = useMemo(() => {
    return allRows.filter((r) => {
      if (filterType !== "all" && r.type !== filterType) return false;
      if (filterFrom && r.date < filterFrom) return false;
      if (filterTo && r.date > filterTo) return false;
      return true;
    });
  }, [allRows, filterType, filterFrom, filterTo]);

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const pagedRows = useMemo(() => {
    const start = (page - 1) * PAGE_SIZE;
    return filteredRows.slice(start, start + PAGE_SIZE);
  }, [filteredRows, page]);

  useEffect(() => { setPage(1); }, [filterType, filterFrom, filterTo]);

  // ───── Derived: balance timeline (daily snapshots from running balances) ─────
  const timeline = useMemo(() => {
    if (!statement) return [];
    // Take last running balance per day (rows are oldest-first in statement.rows)
    const byDay = new Map<string, { gold: number; da: number }>();
    statement.rows.forEach((r) => {
      byDay.set(r.date, { gold: r.running_gold, da: r.running_da });
    });
    return Array.from(byDay.entries())
      .sort(([a], [b]) => (a < b ? 1 : -1))
      .slice(0, 60);
  }, [statement]);

  if (loading || !client || !statement) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={backToClients}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Clients
        </Button>
        <p className="text-sm text-muted-foreground tracking-[0.25em]">LOADING CLIENT…</p>
      </div>
    );
  }

  const g = Number(client.purity_balance);
  const d = Number(client.da_balance);
  const tone: "negative" | "positive" | "neutral" =
    g < 0 || d < 0 ? "negative" : (g > 0 || d > 0 ? "positive" : "neutral");
  const statusLabel = tone === "negative" ? "Negative" : tone === "positive" ? "Positive" : "Neutral";
  const statusCls =
    tone === "negative" ? "text-destructive" : tone === "positive" ? "text-emerald-500" : "text-muted-foreground";

  return (
    <div className="space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
          <button onClick={() => navigate({ to: "/desk/refineries", search: { r: refinery.id, tab: "dashboard" } })} className="hover:text-foreground transition-colors">
            Refineries
          </button>
          <span>›</span>
          <span>{refinery.name}</span>
          <span>›</span>
          <button onClick={backToClients} className="hover:text-foreground transition-colors">Clients</button>
          <span>›</span>
          <span className="text-foreground font-medium">{client.name}</span>
        </div>
        <Button variant="outline" size="sm" onClick={backToClients}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back to Clients
        </Button>
      </div>

      {/* Header + quick actions */}
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <StatusDot tone={tone} />
            <h1 className="font-display text-3xl tracking-tight">{client.name}</h1>
          </div>
          <p className="text-sm text-muted-foreground mt-1 tracking-wide uppercase">Client Overview</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {!readOnly && (
            <>
              <Button
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => navigate({ to: "/desk/refineries", search: { r: refinery.id, tab: "buysell" } })}
              >
                <Plus className="h-4 w-4 mr-1" /> Buy Gold
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="border-destructive/40 text-destructive hover:bg-destructive/10"
                onClick={() => navigate({ to: "/desk/refineries", search: { r: refinery.id, tab: "buysell" } })}
              >
                <TrendingDown className="h-4 w-4 mr-1" /> Sell Gold
              </Button>
            </>
          )}
          <Button size="sm" variant="outline" onClick={() => setStmtOpen(true)}>
            <FileText className="h-4 w-4 mr-1" /> Generate Statement
          </Button>
          {!readOnly && (
            <Button size="sm" variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-1" /> Edit Client
            </Button>
          )}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <SummaryCard label="Current Gold" value={signed(g, fmtG)} cls={balClass(g)} />
        <SummaryCard label="Current DA" value={signed(d, fmtDA)} cls={balClass(d)} />
        <SummaryCard label="Refining Fee" value={`${fmtDA(Number(client.refining_fee_price))}/g`} />
        <SummaryCard label="Status" value={statusLabel} cls={statusCls} />
        <SummaryCard label="Phone" value={client.phone ?? "—"} muted />
        <SummaryCard label="Refinery" value={refinery.name} muted />
      </div>

      {/* Tabs */}
      <div className="border-b border-border flex gap-1 overflow-x-auto">
        {([
          { id: "transactions", label: `Transactions (${allRows.length})` },
          { id: "statement", label: "Account Statement" },
          { id: "timeline", label: "Balance Timeline" },
          { id: "notes", label: `Notes (${notes.length})` },
        ] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm tracking-wide border-b-2 transition-colors whitespace-nowrap ${
              activeTab === t.id ? "border-ember text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab body */}
      {activeTab === "transactions" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">From</Label>
              <Input type="date" value={filterFrom} onChange={(e) => setFilterFrom(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">To</Label>
              <Input type="date" value={filterTo} onChange={(e) => setFilterTo(e.target.value)} className="w-44" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Type</Label>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="gold_received">Gold Received</SelectItem>
                  <SelectItem value="gold_delivered">Gold Delivered</SelectItem>
                  <SelectItem value="da_received">DA Received</SelectItem>
                  <SelectItem value="da_paid">DA Paid</SelectItem>
                  <SelectItem value="refining_fee">Refining Fee</SelectItem>
                  <SelectItem value="settlement">Settlement</SelectItem>
                  <SelectItem value="adjustment">Adjustment</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {(filterFrom || filterTo || filterType !== "all") && (
              <Button size="sm" variant="ghost" onClick={() => { setFilterFrom(""); setFilterTo(""); setFilterType("all"); }}>
                <X className="h-4 w-4 mr-1" /> Reset
              </Button>
            )}
          </div>

          <Card>
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[900px]">
                <thead className="border-b border-border bg-muted/20">
                  <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground whitespace-nowrap">
                    <th className="p-3">Date</th>
                    <th className="p-3">Type</th>
                    <th className="p-3 text-center">Dir</th>
                    <th className="p-3 text-right">Gold (g)</th>
                    <th className="p-3 text-right">DA</th>
                    <th className="p-3">Description</th>
                    <th className="p-3 text-right">Run. Gold</th>
                    <th className="p-3 text-right">Run. DA</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedRows.length === 0 && (
                    <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">No transactions</td></tr>
                  )}
                  {pagedRows.map((r, i) => {
                    const goldNet = r.gold_credit - r.gold_debit;
                    const daNet = r.da_credit - r.da_debit;
                    const isIn = goldNet > 0 || daNet > 0;
                    const isOut = goldNet < 0 || daNet < 0;
                    const dirLabel = r.type === "refining_fee" ? "FEE" : isIn ? "IN" : isOut ? "OUT" : "—";
                    const dirCls =
                      r.type === "refining_fee" ? "bg-ember/15 text-ember border-ember/40"
                      : isIn ? "bg-emerald-500/15 text-emerald-500 border-emerald-500/30"
                      : isOut ? "bg-destructive/15 text-destructive border-destructive/30"
                      : "bg-muted/30 text-muted-foreground border-border";
                    return (
                      <tr key={i} className="border-b border-border last:border-0">
                        <td className="p-3 whitespace-nowrap">{r.date}</td>
                        <td className="p-3">{r.type.replace(/_/g, " ")}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded border text-[10px] font-bold ${dirCls}`}>{dirLabel}</span>
                        </td>
                        <td className={`p-3 text-right tabular-nums ${goldNet > 0 ? "text-emerald-500" : goldNet < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {goldNet !== 0 ? `${goldNet > 0 ? "+" : ""}${fmtG(goldNet)}` : "—"}
                        </td>
                        <td className={`p-3 text-right tabular-nums ${daNet > 0 ? "text-emerald-500" : daNet < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                          {daNet !== 0 ? `${daNet > 0 ? "+" : ""}${fmtDA(daNet)}` : "—"}
                        </td>
                        <td className="p-3 text-muted-foreground text-xs">{r.description}</td>
                        <td className="p-3 text-right tabular-nums">{fmtG(r.running_gold)}</td>
                        <td className="p-3 text-right tabular-nums">{fmtDA(r.running_da)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>

          {totalPages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">
                Page {page} of {totalPages} · {filteredRows.length} transactions
              </span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
                <Button size="sm" variant="outline" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>Next</Button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === "statement" && (
        <Card className="p-6 text-center space-y-3">
          <FileText className="h-8 w-8 mx-auto text-ember" />
          <h3 className="font-display text-lg">Generate Account Statement</h3>
          <p className="text-sm text-muted-foreground">Select a date range, preview, and download as PDF.</p>
          <Button onClick={() => setStmtOpen(true)}>
            <FileText className="h-4 w-4 mr-1" /> Open Statement Generator
          </Button>
        </Card>
      )}

      {activeTab === "timeline" && (
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/20">
                <tr className="text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Gold Balance</th>
                  <th className="p-3 text-right">DA Balance</th>
                </tr>
              </thead>
              <tbody>
                {timeline.length === 0 && (
                  <tr><td colSpan={3} className="p-6 text-center text-muted-foreground">No history yet</td></tr>
                )}
                {timeline.map(([date, b]) => (
                  <tr key={date} className="border-b border-border last:border-0">
                    <td className="p-3 whitespace-nowrap">{date}</td>
                    <td className={`p-3 text-right tabular-nums ${balClass(b.gold)}`}>{signed(b.gold, fmtG)}</td>
                    <td className={`p-3 text-right tabular-nums ${balClass(b.da)}`}>{signed(b.da, fmtDA)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {activeTab === "notes" && (
        <div className="space-y-4">
          {!readOnly && (
            <Card className="p-4 space-y-2">
              <Label className="text-xs uppercase tracking-wider text-muted-foreground">Add internal note</Label>
              <Textarea
                value={newNote}
                onChange={(e) => setNewNote(e.target.value)}
                placeholder="Internal note (not visible to client)…"
                rows={3}
              />
              <div className="flex justify-end">
                <Button size="sm" onClick={submitNote} disabled={savingNote || !newNote.trim()}>
                  {savingNote ? "Saving…" : "Add note"}
                </Button>
              </div>
            </Card>
          )}
          {notes.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No notes yet</p>
          ) : (
            <div className="space-y-2">
              {notes.map((n) => (
                <Card key={n.id} className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">{n.author_name || "Unknown"}</span>
                      {" · "}
                      {new Date(n.created_at).toLocaleString()}
                    </div>
                    <Button size="sm" variant="ghost" className="text-destructive h-7 w-7 p-0" onClick={() => removeNote(n.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                  <p className="text-sm mt-2 whitespace-pre-wrap">{n.body}</p>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {editOpen && (
        <ClientDialog
          refineryId={refinery.id}
          editing={client}
          onClose={() => setEditOpen(false)}
          onSaved={() => { setEditOpen(false); load(); }}
        />
      )}
      {stmtOpen && (
        <AccountStatementDialog
          open
          onClose={() => setStmtOpen(false)}
          refinery={refinery}
          client={client}
        />
      )}
    </div>
  );
}

function SummaryCard({ label, value, cls, muted }: { label: string; value: string; cls?: string; muted?: boolean }) {
  return (
    <Card className="p-4">
      <p className="text-xs uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-2 text-lg font-display tabular-nums ${cls ?? (muted ? "text-muted-foreground" : "")}`}>{value}</p>
    </Card>
  );
}

// =============================================================
// Backup Tab (admin only)
// =============================================================
function fmtBytes(n: number): string {
  if (!n) return "0 B";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}
function fmtAuditWhen(s: string): string {
  try { return new Date(s).toLocaleString(); } catch { return s; }
}
const KIND_BADGE: Record<string, string> = {
  manual: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  scheduled: "bg-sky-500/15 text-sky-300 border-sky-500/30",
  safety: "bg-amber-500/15 text-amber-300 border-amber-500/30",
};

function BackupTab({ refinery }: { refinery: Refinery }) {
  const [backups, setBackups] = useState<RefineryBackupMeta[]>([]);
  const [audit, setAudit] = useState<RefineryAuditLogRow[]>([]);
  const [settings, setSettings] = useState<RefineryBackupSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [savingSettings, setSavingSettings] = useState(false);
  const [restoring, setRestoring] = useState(false);
  // Restore-from-history confirm
  const [restoreFromBackup, setRestoreFromBackup] = useState<RefineryBackupMeta | null>(null);
  const [confirmText, setConfirmText] = useState("");
  // Restore-from-file
  const [uploadedPayload, setUploadedPayload] = useState<{
    fileName: string;
    sizeBytes: number;
    payload: unknown;
  } | null>(null);
  const [uploadConfirmText, setUploadConfirmText] = useState("");

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const [b, a, s] = await Promise.all([
        listBackups({ data: { refineryId: refinery.id } }),
        listAuditLog({ data: { refineryId: refinery.id, limit: 100 } }),
        getBackupSettings({ data: { refineryId: refinery.id } }),
      ]);
      setBackups(b);
      setAudit(a);
      setSettings(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load backup data");
    } finally {
      setLoading(false);
    }
  }, [refinery.id]);

  useEffect(() => { reload(); }, [reload]);

  function downloadJson(name: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    document.body.removeChild(a); URL.revokeObjectURL(url);
  }

  async function handleCreate() {
    setCreating(true);
    try {
      const meta = await createBackup({ data: { refineryId: refinery.id } });
      toast.success(`Backup created: ${meta.file_name}`);
      // Auto-download the newly created backup
      try {
        const full = await getBackupPayload({ data: { backupId: meta.id } });
        downloadJson(full.file_name, full.payload);
      } catch { /* download is optional; backup is saved */ }
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to create backup");
    } finally {
      setCreating(false);
    }
  }

  async function handleDownload(b: RefineryBackupMeta) {
    try {
      const full = await getBackupPayload({ data: { backupId: b.id } });
      downloadJson(full.file_name, full.payload);
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Download failed");
    }
  }

  async function handleDelete(b: RefineryBackupMeta) {
    if (!confirm(`Delete backup "${b.file_name}"? This cannot be undone.`)) return;
    try {
      await deleteBackup({ data: { backupId: b.id } });
      toast.success("Backup deleted");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  async function handleConfirmRestoreFromHistory() {
    if (!restoreFromBackup) return;
    setRestoring(true);
    try {
      await restoreBackupFromHistory({
        data: { backupId: restoreFromBackup.id, confirmText },
      });
      toast.success("Backup restored. Refreshing data…");
      setRestoreFromBackup(null);
      setConfirmText("");
      await reload();
      // Trigger upstream pages to refresh by reloading window
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  async function handleUploadFile(file: File) {
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error("File too large (max 50MB).");
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed || parsed.schema_version !== 1 || !parsed.refinery?.id) {
        throw new Error("Invalid backup file structure.");
      }
      if (parsed.refinery.id !== refinery.id) {
        throw new Error(`Backup belongs to a different refinery (${parsed.refinery.name ?? parsed.refinery.id}).`);
      }
      setUploadedPayload({ fileName: file.name, sizeBytes: file.size, payload: parsed });
      setUploadConfirmText("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not read backup file");
    }
  }

  async function handleConfirmRestoreFromFile() {
    if (!uploadedPayload) return;
    setRestoring(true);
    try {
      await restoreBackupFromFile({
        data: {
          refineryId: refinery.id,
          payload: uploadedPayload.payload,
          sourceFileName: uploadedPayload.fileName,
          confirmText: uploadConfirmText,
        },
      });
      toast.success("Backup restored. Refreshing data…");
      setUploadedPayload(null);
      setUploadConfirmText("");
      await reload();
      setTimeout(() => window.location.reload(), 500);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Restore failed");
    } finally {
      setRestoring(false);
    }
  }

  async function handleSaveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setSavingSettings(true);
    try {
      await updateBackupSettings({
        data: {
          refineryId: refinery.id,
          daily_enabled: settings.daily_enabled,
          daily_time: settings.daily_time.slice(0, 5),
          keep_last: settings.keep_last,
        },
      });
      toast.success("Scheduled backup settings saved");
      await reload();
    } catch (e2) {
      toast.error(e2 instanceof Error ? e2.message : "Failed to save settings");
    } finally {
      setSavingSettings(false);
    }
  }

  const latest = backups[0];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-display text-2xl">Backup &amp; Restore</h2>
        <p className="text-sm text-muted-foreground">
          Admin-only. Backups include all refinery data — clients, transactions, stock, prices, and audit history.
        </p>
      </div>

      {/* A. Create Backup */}
      <Card className="p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="font-display text-lg">A. Create Backup</h3>
            <p className="text-sm text-muted-foreground">Snapshot the entire refinery into a downloadable JSON file.</p>
            {latest && (
              <p className="text-xs text-muted-foreground mt-2">
                Last backup: <span className="text-foreground">{latest.file_name}</span> ·
                {" "}{fmtAuditWhen(latest.created_at)} · {fmtBytes(latest.file_size_bytes)}
                {latest.created_by_email ? ` · by ${latest.created_by_email}` : ""}
              </p>
            )}
          </div>
          <Button onClick={handleCreate} disabled={creating} className="gap-2">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {creating ? "Creating…" : "Create Backup"}
          </Button>
        </div>
      </Card>

      {/* B. Restore Backup (from file) */}
      <Card className="p-6 border-destructive/30">
        <h3 className="font-display text-lg flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-destructive" /> B. Restore Backup
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          Upload a previously downloaded backup file (.json) to restore this refinery.
        </p>
        <div className="mt-4 flex items-center gap-3">
          <input
            type="file"
            accept="application/json,.json"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleUploadFile(f);
              e.target.value = "";
            }}
            className="block text-sm text-muted-foreground file:mr-3 file:px-3 file:py-2 file:rounded-md file:border-0 file:bg-secondary file:text-foreground file:cursor-pointer"
          />
        </div>
      </Card>

      {/* C. Backup History */}
      <Card className="p-6">
        <h3 className="font-display text-lg">C. Backup History</h3>
        <p className="text-sm text-muted-foreground">All saved backups for this refinery. Safety backups are created automatically before any restore.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">Date</th>
                <th className="text-left py-2 px-2">Kind</th>
                <th className="text-left py-2 px-2">File Name</th>
                <th className="text-left py-2 px-2">Created By</th>
                <th className="text-right py-2 px-2">Size</th>
                <th className="text-right py-2 px-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Loading…</td></tr>
              )}
              {!loading && backups.length === 0 && (
                <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">No backups yet.</td></tr>
              )}
              {backups.map((b) => (
                <tr key={b.id} className="border-b border-border/50 hover:bg-card/40">
                  <td className="py-2 px-2 whitespace-nowrap">{fmtAuditWhen(b.created_at)}</td>
                  <td className="py-2 px-2">
                    <span className={`text-xs px-2 py-0.5 rounded border ${KIND_BADGE[b.kind] ?? "bg-secondary"}`}>
                      {b.kind.toUpperCase()}
                    </span>
                  </td>
                  <td className="py-2 px-2 font-mono text-xs">{b.file_name}</td>
                  <td className="py-2 px-2 text-muted-foreground">{b.created_by_email ?? "—"}</td>
                  <td className="py-2 px-2 text-right">{fmtBytes(b.file_size_bytes)}</td>
                  <td className="py-2 px-2 text-right">
                    <div className="inline-flex gap-1">
                      <Button size="sm" variant="ghost" onClick={() => handleDownload(b)} title="Download">
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => { setRestoreFromBackup(b); setConfirmText(""); }} title="Restore" className="text-amber-400 hover:text-amber-300">
                        <HistoryIcon className="h-4 w-4" />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => handleDelete(b)} title="Delete" className="text-destructive hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* D. Scheduled Backup Settings */}
      <Card className="p-6">
        <h3 className="font-display text-lg">D. Scheduled Backup Settings</h3>
        <p className="text-sm text-muted-foreground">Automatically create a backup every day at the chosen time.</p>
        {settings && (
          <form onSubmit={handleSaveSettings} className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
            <div>
              <Label className="text-xs uppercase">Enable Daily Backup</Label>
              <div className="mt-2 flex items-center gap-2">
                <Checkbox
                  id="daily-enabled"
                  checked={settings.daily_enabled}
                  onCheckedChange={(v) => setSettings({ ...settings, daily_enabled: Boolean(v) })}
                />
                <label htmlFor="daily-enabled" className="text-sm">
                  {settings.daily_enabled ? "Enabled" : "Disabled"}
                </label>
              </div>
            </div>
            <div>
              <Label className="text-xs uppercase">Backup Time (24h)</Label>
              <Input
                type="time"
                value={settings.daily_time.slice(0, 5)}
                onChange={(e) => setSettings({ ...settings, daily_time: e.target.value })}
                className="mt-2"
              />
            </div>
            <div>
              <Label className="text-xs uppercase">Keep Last N Backups</Label>
              <Input
                type="number" min={1} max={500}
                value={settings.keep_last}
                onChange={(e) => setSettings({ ...settings, keep_last: Math.max(1, Math.min(500, Number(e.target.value) || 30)) })}
                className="mt-2"
              />
            </div>
            <div className="sm:col-span-3">
              <Button type="submit" disabled={savingSettings} className="gap-2">
                {savingSettings ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Settings
              </Button>
            </div>
          </form>
        )}
      </Card>

      {/* Audit Log */}
      <Card className="p-6">
        <h3 className="font-display text-lg">Audit Log</h3>
        <p className="text-sm text-muted-foreground">Recent backup and restore actions for this refinery.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left py-2 px-2">When</th>
                <th className="text-left py-2 px-2">User</th>
                <th className="text-left py-2 px-2">Action</th>
                <th className="text-left py-2 px-2">File</th>
                <th className="text-left py-2 px-2">IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 && (
                <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">No audit entries yet.</td></tr>
              )}
              {audit.map((row) => (
                <tr key={row.id} className="border-b border-border/50">
                  <td className="py-1.5 px-2 whitespace-nowrap text-xs text-muted-foreground">{fmtAuditWhen(row.created_at)}</td>
                  <td className="py-1.5 px-2 text-xs">{row.user_email ?? "system"}</td>
                  <td className="py-1.5 px-2">
                    <span className="text-xs uppercase tracking-wider">{row.action.replace(/_/g, " ")}</span>
                  </td>
                  <td className="py-1.5 px-2 font-mono text-xs">{row.file_name ?? "—"}</td>
                  <td className="py-1.5 px-2 text-xs text-muted-foreground">{row.ip ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Confirm restore from history */}
      <Dialog open={!!restoreFromBackup} onOpenChange={(o) => { if (!o) { setRestoreFromBackup(null); setConfirmText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Restore Backup
            </DialogTitle>
          </DialogHeader>
          {restoreFromBackup && (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                Restoring this backup will <strong>overwrite current refinery data</strong>.
                This action cannot be undone unless you create a new backup first. A safety backup of the
                current state will be automatically created before the restore.
              </div>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">File:</span> <span className="font-mono">{restoreFromBackup.file_name}</span></div>
                <div><span className="text-muted-foreground">Created:</span> {fmtAuditWhen(restoreFromBackup.created_at)}</div>
                <div><span className="text-muted-foreground">Size:</span> {fmtBytes(restoreFromBackup.file_size_bytes)}</div>
              </div>
              <div>
                <Label className="text-xs uppercase">Type <span className="font-mono">RESTORE</span> to confirm</Label>
                <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="mt-2" placeholder="RESTORE" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setRestoreFromBackup(null); setConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "RESTORE" || restoring}
              onClick={handleConfirmRestoreFromHistory}
              className="gap-2"
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Restore Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirm restore from uploaded file */}
      <Dialog open={!!uploadedPayload} onOpenChange={(o) => { if (!o) { setUploadedPayload(null); setUploadConfirmText(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Restore From File
            </DialogTitle>
          </DialogHeader>
          {uploadedPayload && (
            <div className="space-y-4">
              <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
                Restoring this file will <strong>overwrite current refinery data</strong>.
                A safety backup will be created automatically beforehand.
              </div>
              <div className="text-sm space-y-1">
                <div><span className="text-muted-foreground">File:</span> <span className="font-mono">{uploadedPayload.fileName}</span></div>
                <div><span className="text-muted-foreground">Size:</span> {fmtBytes(uploadedPayload.sizeBytes)}</div>
              </div>
              <div>
                <Label className="text-xs uppercase">Type <span className="font-mono">RESTORE</span> to confirm</Label>
                <Input value={uploadConfirmText} onChange={(e) => setUploadConfirmText(e.target.value)} className="mt-2" placeholder="RESTORE" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setUploadedPayload(null); setUploadConfirmText(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={uploadConfirmText !== "RESTORE" || restoring}
              onClick={handleConfirmRestoreFromFile}
              className="gap-2"
            >
              {restoring ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Restore Now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}


// =============================================================
// Translation Management (admin only)
// =============================================================
function TranslationsTab() {
  const { t: tr } = useLang();
  type OverrideRow = { key: string; locale: "en" | "fr" | "ar"; value: string };
  const [keys, setKeys] = useState<string[]>([]);
  const [base, setBase] = useState<Record<"en" | "fr" | "ar", Record<string, string>>>({ en: {}, fr: {}, ar: {} });
  const [overrides, setOverrides] = useState<Record<string, OverrideRow>>({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const mod = await import("@/lib/purity-i18n");
        const fns = await import("@/lib/translations.functions");
        const rows = await fns.listTranslationOverrides();
        if (!mounted) return;
        setKeys(mod.translationKeys);
        setBase({ en: mod.baseDicts.en, fr: mod.baseDicts.fr, ar: mod.baseDicts.ar });
        const map: Record<string, OverrideRow> = {};
        for (const r of rows) map[`${r.key}__${r.locale}`] = { key: r.key, locale: r.locale, value: r.value };
        setOverrides(map);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load translations");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return keys;
    return keys.filter((k) =>
      k.toLowerCase().includes(q) ||
      (base.en[k] ?? "").toLowerCase().includes(q) ||
      (base.fr[k] ?? "").toLowerCase().includes(q) ||
      (base.ar[k] ?? "").toLowerCase().includes(q),
    );
  }, [keys, search, base]);

  const current = (key: string, locale: "fr" | "ar") =>
    overrides[`${key}__${locale}`]?.value ?? base[locale][key] ?? "";

  const save = async (key: string, locale: "fr" | "ar", value: string) => {
    const sig = `${key}__${locale}`;
    setSaving(sig);
    try {
      const fns = await import("@/lib/translations.functions");
      if (!value.trim()) {
        await fns.deleteTranslationOverride({ data: { key, locale } });
        setOverrides((m) => { const n = { ...m }; delete n[sig]; return n; });
        toast.success("Override removed");
      } else {
        await fns.upsertTranslationOverride({ data: { key, locale, value } });
        setOverrides((m) => ({ ...m, [sig]: { key, locale, value } }));
        toast.success("Translation saved");
      }
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("desk-translations-updated"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(null);
    }
  };

  const exportJson = () => {
    const out = { fr: {} as Record<string, string>, ar: {} as Record<string, string> };
    for (const r of Object.values(overrides)) {
      if (r.locale === "fr" || r.locale === "ar") out[r.locale][r.key] = r.value;
    }
    const blob = new Blob([JSON.stringify(out, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "translation-overrides.json";
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importJson = async (file: File) => {
    try {
      const text = await file.text();
      const json = JSON.parse(text) as { fr?: Record<string, string>; ar?: Record<string, string> };
      const entries: OverrideRow[] = [];
      for (const loc of ["fr", "ar"] as const) {
        const d = json[loc] ?? {};
        for (const [k, v] of Object.entries(d)) {
          if (typeof v === "string" && v.trim()) entries.push({ key: k, locale: loc, value: v });
        }
      }
      const fns = await import("@/lib/translations.functions");
      await fns.bulkImportTranslationOverrides({ data: { entries } });
      const next: Record<string, OverrideRow> = { ...overrides };
      for (const e of entries) next[`${e.key}__${e.locale}`] = e;
      setOverrides(next);
      toast.success(`Imported ${entries.length} translations`);
      if (typeof window !== "undefined") {
        window.dispatchEvent(new Event("desk-translations-updated"));
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Import failed");
    }
  };

  return (
    <div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between mb-4">
        <div>
          <h2 className="font-display text-xl mb-1">{tr("ref.transMgmt.title")}</h2>
          <p className="text-sm text-muted-foreground">{tr("ref.transMgmt.subtitle")}</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={exportJson}>
            <Download className="h-4 w-4 mr-1" /> {tr("ref.transMgmt.export")}
          </Button>
          <label className="inline-flex items-center px-3 py-1.5 text-sm border border-border rounded cursor-pointer hover:bg-card">
            {tr("ref.transMgmt.import")}
            <input
              type="file"
              accept="application/json"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importJson(f);
                e.target.value = "";
              }}
            />
          </label>
        </div>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={tr("ref.transMgmt.search")}
        className="mb-4 max-w-md"
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">{tr("ref.transMgmt.empty")}</p>
      ) : (
        <div className="border border-border rounded overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-card/40">
              <tr>
                <th className="text-left px-3 py-2 font-medium">{tr("ref.transMgmt.key")}</th>
                <th className="text-left px-3 py-2 font-medium">{tr("ref.transMgmt.english")}</th>
                <th className="text-left px-3 py-2 font-medium">{tr("ref.transMgmt.french")}</th>
                <th className="text-left px-3 py-2 font-medium">{tr("ref.transMgmt.arabic")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, 500).map((k) => (
                <TranslationRow
                  key={k}
                  tkey={k}
                  english={base.en[k] ?? ""}
                  frValue={current(k, "fr")}
                  arValue={current(k, "ar")}
                  frOverridden={!!overrides[`${k}__fr`]}
                  arOverridden={!!overrides[`${k}__ar`]}
                  onSave={save}
                  savingSig={saving}
                />
              ))}
            </tbody>
          </table>
          {filtered.length > 500 && (
            <p className="text-xs text-muted-foreground p-2">Showing first 500 of {filtered.length}. Refine your search to see more.</p>
          )}
        </div>
      )}
    </div>
  );
}

function TranslationRow({
  tkey, english, frValue, arValue, frOverridden, arOverridden, onSave, savingSig,
}: {
  tkey: string;
  english: string;
  frValue: string;
  arValue: string;
  frOverridden: boolean;
  arOverridden: boolean;
  onSave: (key: string, locale: "fr" | "ar", value: string) => Promise<void>;
  savingSig: string | null;
}) {
  const [fr, setFr] = useState(frValue);
  const [ar, setAr] = useState(arValue);
  useEffect(() => { setFr(frValue); }, [frValue]);
  useEffect(() => { setAr(arValue); }, [arValue]);
  const frSig = `${tkey}__fr`;
  const arSig = `${tkey}__ar`;
  return (
    <tr className="border-t border-border align-top">
      <td className="px-3 py-2 font-mono text-xs text-muted-foreground whitespace-nowrap">{tkey}</td>
      <td className="px-3 py-2 text-xs text-muted-foreground max-w-[16rem]">{english}</td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <Input value={fr} onChange={(e) => setFr(e.target.value)} className="h-8 text-xs" />
          <Button size="sm" variant={frOverridden ? "default" : "outline"} onClick={() => onSave(tkey, "fr", fr)} disabled={savingSig === frSig || fr === frValue}>
            {savingSig === frSig ? "…" : "Save"}
          </Button>
        </div>
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1">
          <Input value={ar} onChange={(e) => setAr(e.target.value)} className="h-8 text-xs" dir="rtl" />
          <Button size="sm" variant={arOverridden ? "default" : "outline"} onClick={() => onSave(tkey, "ar", ar)} disabled={savingSig === arSig || ar === arValue}>
            {savingSig === arSig ? "…" : "Save"}
          </Button>
        </div>
      </td>
    </tr>
  );
}
