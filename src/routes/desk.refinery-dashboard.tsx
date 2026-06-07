import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft, Coins, Wallet, TrendingUp, TrendingDown, AlertTriangle,
  Plus, FileText, Download, Share2, RefreshCcw, ShieldCheck, Banknote,
  ArrowDownToLine, ArrowUpFromLine, Scale,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import jsPDF from "jspdf";
import {
  listRefineries, getMyRefineryAssignment, getRefineryDashboardOverview,
  type Refinery, type RefineryDashboardOverview,
} from "@/lib/refineries.functions";

export const Route = createFileRoute("/desk/refinery-dashboard")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Refinery Dashboard" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    r: typeof s.r === "string" ? s.r : undefined,
  }),
  component: RefineryDashboardPage,
});

// ----- formatters -----
const fmtG = (n: number) =>
  `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
const fmtDA = (n: number) =>
  `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })} DA`;
const fmtPct = (n: number) =>
  `${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
const balCls = (n: number) =>
  n > 0 ? "text-emerald-600" : n < 0 ? "text-destructive" : "text-muted-foreground";

type Preset = "today" | "week" | "month" | "custom";

function rangeFor(preset: Preset, customFrom: string, customTo: string): { from: string; to: string } {
  const today = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  if (preset === "today") return { from: iso(today), to: iso(today) };
  if (preset === "week") {
    const d = new Date(today); d.setDate(d.getDate() - 6);
    return { from: iso(d), to: iso(today) };
  }
  if (preset === "month") {
    const d = new Date(today.getFullYear(), today.getMonth(), 1);
    return { from: iso(d), to: iso(today) };
  }
  return { from: customFrom || iso(today), to: customTo || iso(today) };
}

function RefineryDashboardPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [refId, setRefId] = useState<string | undefined>(search.r);
  const [goldPrice, setGoldPrice] = useState<number>(12000); // DA / g pure
  const [preset, setPreset] = useState<Preset>("month");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [data, setData] = useState<RefineryDashboardOverview | null>(null);
  const [loading, setLoading] = useState(false);
  const [cashInHand, setCashInHand] = useState<number>(0);
  const [bankBalance, setBankBalance] = useState<number>(0);

  // Auth + admin guard
  useEffect(() => {
    (async () => {
      const { data: s } = await supabase.auth.getSession();
      if (!s.session) { navigate({ to: "/desk/login", replace: true }); return; }
      try {
        const a = await getMyRefineryAssignment();
        if (!a.isAdmin) { setIsAdmin(false); return; }
        setIsAdmin(true);
        const refs = await listRefineries();
        setRefineries(refs);
        if (!refId && refs[0]) setRefId(refs[0].id);
      } catch (e) {
        setIsAdmin(false);
        toast.error(e instanceof Error ? e.message : "Failed to load");
      }
    })();
    // load saved cash/bank
    const c = Number(localStorage.getItem("ather:refinery:cashInHand") || 0);
    const b = Number(localStorage.getItem("ather:refinery:bankBalance") || 0);
    if (!Number.isNaN(c)) setCashInHand(c);
    if (!Number.isNaN(b)) setBankBalance(b);
    const gp = Number(localStorage.getItem("ather:refinery:goldPrice") || 0);
    if (gp > 0) setGoldPrice(gp);
  }, [navigate, refId]);

  useEffect(() => {
    localStorage.setItem("ather:refinery:cashInHand", String(cashInHand));
    localStorage.setItem("ather:refinery:bankBalance", String(bankBalance));
    localStorage.setItem("ather:refinery:goldPrice", String(goldPrice));
  }, [cashInHand, bankBalance, goldPrice]);

  const range = useMemo(() => rangeFor(preset, customFrom, customTo), [preset, customFrom, customTo]);

  const refresh = async () => {
    if (!refId) return;
    setLoading(true);
    try {
      const d = await getRefineryDashboardOverview({ data: { refineryId: refId, from: range.from, to: range.to } });
      setData(d);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load dashboard");
    } finally { setLoading(false); }
  };

  useEffect(() => { void refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [refId, range.from, range.to]);

  if (isAdmin === null) return <div className="p-10 text-center text-muted-foreground">Loading…</div>;
  if (isAdmin === false) return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <Card className="p-8 max-w-md text-center space-y-3">
        <ShieldCheck className="w-10 h-10 mx-auto text-destructive" />
        <h1 className="text-xl font-semibold">Administrators only</h1>
        <p className="text-sm text-muted-foreground">You do not have permission to view this page.</p>
        <Button onClick={() => navigate({ to: "/desk/refineries" })}>Back to Refineries</Button>
      </Card>
    </div>
  );

  const goldValue = data ? data.stock.pure_gold_stock * goldPrice : 0;
  const availableGold = data ? data.stock.pure_gold_stock - data.totals.clientGoldLiability : 0;
  const netCashPosition = (data?.stock.da_stock ?? 0) + cashInHand + bankBalance
    + (data?.totals.clientDaReceivable ?? 0) - (data?.totals.clientDaLiability ?? 0);
  const refiningFeesAll = data?.totals.refiningFeesEarned ?? 0;
  // No premium/discount/other tables exist for refineries — display as 0
  const premiumIncome = 0;
  const discountExpense = 0;
  const otherIncome = 0;
  const otherExpenses = 0;
  const netProfit = refiningFeesAll + premiumIncome - discountExpense + otherIncome - otherExpenses;
  const netCapital = goldValue + (data?.stock.da_stock ?? 0) + cashInHand + bankBalance
    - (data?.totals.clientGoldLiability ?? 0) * goldPrice - (data?.totals.clientDaLiability ?? 0);
  const goldDifference = availableGold; // physical - liability
  const cashDifference = (data?.stock.da_stock ?? 0) + cashInHand + bankBalance - (data?.totals.clientDaLiability ?? 0);

  // ---- exports ----
  const exportPdf = () => {
    if (!data) return;
    const doc = new jsPDF({ unit: "pt", format: "a4" });
    let y = 40;
    doc.setFontSize(16); doc.text("REFINERY DASHBOARD", 40, y); y += 18;
    doc.setFontSize(10); doc.text(`${data.refinery.name} — ${range.from} → ${range.to}`, 40, y); y += 20;
    const line = (k: string, v: string) => { doc.text(k, 40, y); doc.text(v, 380, y, { align: "right" }); y += 14; };
    doc.setFontSize(11); doc.text("Summary", 40, y); y += 14; doc.setFontSize(10);
    line("Pure Gold Stock", fmtG(data.stock.pure_gold_stock));
    line("Total Gold Value", fmtDA(goldValue));
    line("Client Gold Balances (net)", fmtG(data.totals.totalClientGoldBalance));
    line("Client DA Balances (net)", fmtDA(data.totals.totalClientDaBalance));
    line("Refining Fees Earned (all-time)", fmtDA(refiningFeesAll));
    line("Net Refinery Capital", fmtDA(netCapital));
    line("Net Profit (all-time)", fmtDA(netProfit));
    y += 8;
    doc.setFontSize(11); doc.text("Available Gold", 40, y); y += 14; doc.setFontSize(10);
    line("Physical Gold Stock", fmtG(data.stock.pure_gold_stock));
    line("Client Gold Liability", fmtG(data.totals.clientGoldLiability));
    line("Available Gold", fmtG(availableGold));
    y += 8;
    doc.setFontSize(11); doc.text("Client Balances", 40, y); y += 14; doc.setFontSize(9);
    doc.text("Code", 40, y); doc.text("Name", 100, y); doc.text("Gold", 320, y, { align: "right" }); doc.text("DA", 420, y, { align: "right" }); doc.text("Last Tx", 520, y, { align: "right" }); y += 12;
    for (const c of data.clients) {
      if (y > 780) { doc.addPage(); y = 40; }
      doc.text(c.code, 40, y);
      doc.text(c.name.slice(0, 40), 100, y);
      doc.text(fmtG(c.purity_balance), 320, y, { align: "right" });
      doc.text(fmtDA(c.da_balance), 420, y, { align: "right" });
      doc.text(c.last_tx_date ?? "—", 520, y, { align: "right" });
      y += 12;
    }
    doc.save(`refinery-dashboard-${data.refinery.name}-${range.from}-${range.to}.pdf`);
  };

  const exportExcel = () => {
    if (!data) return;
    const rows: string[] = [];
    rows.push(`Refinery Dashboard,${data.refinery.name}`);
    rows.push(`Range,${range.from},${range.to}`);
    rows.push("");
    rows.push("Metric,Value");
    rows.push(`Pure Gold Stock (g),${data.stock.pure_gold_stock}`);
    rows.push(`Total Gold Value (DA),${goldValue}`);
    rows.push(`DA Stock,${data.stock.da_stock}`);
    rows.push(`Client Gold Balance (net g),${data.totals.totalClientGoldBalance}`);
    rows.push(`Client DA Balance (net DA),${data.totals.totalClientDaBalance}`);
    rows.push(`Refining Fees Earned (DA),${refiningFeesAll}`);
    rows.push(`Net Refinery Capital (DA),${netCapital}`);
    rows.push(`Net Profit (DA),${netProfit}`);
    rows.push(`Available Gold (g),${availableGold}`);
    rows.push("");
    rows.push("Code,Name,Gold Balance (g),DA Balance,Last Tx");
    for (const c of data.clients) {
      rows.push([c.code, `"${c.name.replace(/"/g, '""')}"`, c.purity_balance, c.da_balance, c.last_tx_date ?? ""].join(","));
    }
    const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `refinery-dashboard-${data.refinery.name}-${range.from}-${range.to}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const shareReport = async () => {
    if (!data) return;
    const text = [
      `*REFINERY DASHBOARD* — ${data.refinery.name}`,
      `Period: ${range.from} → ${range.to}`,
      ``,
      `Pure Gold Stock: ${fmtG(data.stock.pure_gold_stock)}`,
      `Available Gold: ${fmtG(availableGold)}`,
      `DA Stock: ${fmtDA(data.stock.da_stock)}`,
      `Client Gold (net): ${fmtG(data.totals.totalClientGoldBalance)}`,
      `Client DA (net): ${fmtDA(data.totals.totalClientDaBalance)}`,
      `Refining Fees (all-time): ${fmtDA(refiningFeesAll)}`,
      `Net Capital: ${fmtDA(netCapital)}`,
    ].join("\n");
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank");
  };

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Header */}
      <header className="bg-background border-b sticky top-0 z-30">
        <div className="max-w-[1400px] mx-auto px-4 py-3 flex items-center gap-4 flex-wrap">
          <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/desk/refineries" })}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <h1 className="text-lg font-semibold">REFINERY DASHBOARD</h1>
          <Badge variant="secondary" className="gap-1"><ShieldCheck className="w-3 h-3" /> Admin</Badge>
          <div className="flex-1" />
          <Select value={refId} onValueChange={setRefId}>
            <SelectTrigger className="w-[200px]"><SelectValue placeholder="Refinery" /></SelectTrigger>
            <SelectContent>
              {refineries.map((r) => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={preset} onValueChange={(v) => setPreset(v as Preset)}>
            <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="today">Today</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              <SelectItem value="month">This Month</SelectItem>
              <SelectItem value="custom">Custom</SelectItem>
            </SelectContent>
          </Select>
          {preset === "custom" && (
            <>
              <Input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-[150px]" />
              <Input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-[150px]" />
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={loading}>
            <RefreshCcw className={`w-4 h-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-4 space-y-6">
        {/* Quick Actions */}
        <Card className="p-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground mr-2">Quick Actions</span>
            <Link to="/desk/refineries" search={{ r: refId, tab: "transactions", action: "new" }}>
              <Button size="sm" variant="default"><Plus className="w-4 h-4 mr-1" /> Create Receipt</Button>
            </Link>
            <Link to="/desk/refineries" search={{ r: refId, tab: "transactions", action: "new" }}>
              <Button size="sm" variant="secondary"><Plus className="w-4 h-4 mr-1" /> Create Settlement</Button>
            </Link>
            <Button size="sm" variant="outline" disabled title="Coming soon"><Plus className="w-4 h-4 mr-1" /> Add Premium</Button>
            <Button size="sm" variant="outline" disabled title="Coming soon"><Plus className="w-4 h-4 mr-1" /> Add Discount</Button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={exportPdf}><FileText className="w-4 h-4 mr-1" /> Export PDF</Button>
            <Button size="sm" variant="outline" onClick={exportExcel}><Download className="w-4 h-4 mr-1" /> Export Excel</Button>
            <Button size="sm" variant="outline" onClick={() => void shareReport()}><Share2 className="w-4 h-4 mr-1" /> Share Report</Button>
          </div>
        </Card>

        {/* Pricing & Cash inputs */}
        <Card className="p-3">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <Label className="text-xs">Gold Price (DA / g pure)</Label>
              <Input type="number" value={goldPrice} onChange={(e) => setGoldPrice(Number(e.target.value))} className="w-[160px]" />
            </div>
            <div>
              <Label className="text-xs">Cash In Hand (DA)</Label>
              <Input type="number" value={cashInHand} onChange={(e) => setCashInHand(Number(e.target.value))} className="w-[160px]" />
            </div>
            <div>
              <Label className="text-xs">Bank Balance (DA)</Label>
              <Input type="number" value={bankBalance} onChange={(e) => setBankBalance(Number(e.target.value))} className="w-[160px]" />
            </div>
            <p className="text-xs text-muted-foreground">Cash/bank/price are stored locally for calculations.</p>
          </div>
        </Card>

        {!data ? (
          <Card className="p-10 text-center text-muted-foreground">Loading dashboard…</Card>
        ) : (
          <>
            {/* TOP SUMMARY CARDS */}
            <section>
              <h2 className="text-sm uppercase tracking-wider text-muted-foreground mb-2">Summary</h2>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                <Kpi icon={<Coins className="w-4 h-4" />} label="Pure Gold Stock" value={fmtG(data.stock.pure_gold_stock)} accent="amber" />
                <Kpi icon={<Coins className="w-4 h-4" />} label="Silver Stock" value={fmtG(data.stock.silver_stock)} />
                <Kpi icon={<Banknote className="w-4 h-4" />} label="Total Gold Value" value={fmtDA(goldValue)} accent="amber" />
                <Kpi icon={<Scale className="w-4 h-4" />} label="Client Gold (net)" value={fmtG(data.totals.totalClientGoldBalance)} valueClass={balCls(data.totals.totalClientGoldBalance)} />
                <Kpi icon={<Wallet className="w-4 h-4" />} label="Client DA (net)" value={fmtDA(data.totals.totalClientDaBalance)} valueClass={balCls(data.totals.totalClientDaBalance)} />
                <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Refining Fees Earned" value={fmtDA(refiningFeesAll)} accent="green" />
                <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Premium Income" value={fmtDA(premiumIncome)} subtle />
                <Kpi icon={<TrendingDown className="w-4 h-4" />} label="Discount Expense" value={fmtDA(discountExpense)} subtle />
                <Kpi icon={<ShieldCheck className="w-4 h-4" />} label="Net Refinery Capital" value={fmtDA(netCapital)} valueClass={balCls(netCapital)} />
                <Kpi icon={<TrendingUp className="w-4 h-4" />} label="Net Profit" value={fmtDA(netProfit)} valueClass={balCls(netProfit)} />
                <Kpi icon={<AlertTriangle className="w-4 h-4" />} label="Available Gold" value={fmtG(availableGold)} valueClass={balCls(availableGold)} accent={availableGold < 0 ? "red" : "green"} />
              </div>
            </section>

            {/* AVAILABLE GOLD HERO */}
            <section>
              <Card className={`p-6 border-2 ${availableGold < 0 ? "border-destructive bg-destructive/5" : "border-emerald-500/40 bg-emerald-500/5"}`}>
                <div className="flex items-center justify-between flex-wrap gap-4">
                  <div>
                    <p className="text-xs uppercase tracking-wider text-muted-foreground">Available Gold Position</p>
                    <p className={`text-4xl md:text-5xl font-bold ${availableGold < 0 ? "text-destructive" : "text-emerald-600"}`}>{fmtG(availableGold)}</p>
                    <p className="text-xs text-muted-foreground mt-1">Physical Stock − Client Liability</p>
                  </div>
                  <div className="grid grid-cols-2 gap-6 text-right">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Physical Gold Stock</p>
                      <p className="text-xl font-semibold">{fmtG(data.stock.pure_gold_stock)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground">Client Gold Liability</p>
                      <p className="text-xl font-semibold">{fmtG(data.totals.clientGoldLiability)}</p>
                    </div>
                  </div>
                </div>
              </Card>
            </section>

            {/* GOLD STOCK + CASH POSITION + EXPOSURE */}
            <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Coins className="w-4 h-4" /> Metal Stock</h3>
                <table className="w-full text-sm">
                  <thead><tr className="text-left text-muted-foreground"><th className="py-1">Metal</th><th className="text-right">Stock</th></tr></thead>
                  <tbody>
                    <tr className="border-t"><td className="py-2">Pure Gold</td><td className="text-right font-medium">{fmtG(data.stock.pure_gold_stock)}</td></tr>
                    <tr className="border-t"><td className="py-2">Silver</td><td className="text-right font-medium">{fmtG(data.stock.silver_stock)}</td></tr>
                  </tbody>
                </table>
                <div className="grid grid-cols-2 gap-2 mt-3 text-sm">
                  <Mini label="Total Gold Bars" value={String(data.stock.total_bars)} />
                  <Mini label="Avg Purity" value={fmtPct(data.stock.average_purity)} />
                  <Mini label="Est. Gold Value" value={fmtDA(goldValue)} full />
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><Wallet className="w-4 h-4" /> Cash Position</h3>
                <Row label="Cash In Hand" value={fmtDA(cashInHand)} />
                <Row label="Bank Balance" value={fmtDA(bankBalance)} />
                <Row label="DA Stock (refinery)" value={fmtDA(data.stock.da_stock)} />
                <Row label="Client Receivables" value={fmtDA(data.totals.clientDaReceivable)} cls="text-emerald-600" />
                <Row label="Client Payables" value={fmtDA(data.totals.clientDaLiability)} cls="text-destructive" />
                <div className="border-t mt-2 pt-2">
                  <Row label="Net Cash Position" value={fmtDA(netCashPosition)} cls={balCls(netCashPosition)} bold />
                </div>
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><AlertTriangle className="w-4 h-4" /> Refinery Exposure</h3>
                <Row label="Total Client Gold Liability" value={fmtG(data.totals.clientGoldLiability)} cls="text-destructive" />
                <Row label="Total Client DA Liability" value={fmtDA(data.totals.clientDaLiability)} cls="text-destructive" />
                <Row label="Actual Gold Stock Held" value={fmtG(data.stock.pure_gold_stock)} />
                <Row label="Available Gold" value={fmtG(availableGold)} cls={balCls(availableGold)} bold />
                <Row label="Gold Difference" value={fmtG(goldDifference)} cls={balCls(goldDifference)} />
                <Row label="Cash Difference" value={fmtDA(cashDifference)} cls={balCls(cashDifference)} />
              </Card>
            </section>

            {/* TRANSACTION SUMMARY + PROFITABILITY */}
            <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><ArrowDownToLine className="w-4 h-4" /> Transaction Summary ({range.from} → {range.to})</h3>
                <Row label="Gold Received" value={fmtG(data.rangeTotals.goldReceived)} cls="text-emerald-600" />
                <Row label="Gold Delivered" value={fmtG(data.rangeTotals.goldDelivered)} cls="text-destructive" />
                <Row label="DA Received" value={fmtDA(data.rangeTotals.daReceived)} cls="text-emerald-600" />
                <Row label="DA Delivered" value={fmtDA(data.rangeTotals.daDelivered)} cls="text-destructive" />
                <Row label="Settlements" value={`${data.rangeTotals.settlementsCount} (Gold ${fmtG(data.rangeTotals.settlementsGoldVolume)} • ${fmtDA(data.rangeTotals.settlementsDaVolume)})`} />
                <Row label="Refining Fees (period)" value={fmtDA(data.totals.refiningFeesEarnedInRange)} cls="text-emerald-600" />
                <Row label="Premium Transactions" value="—" />
                <Row label="Discount Transactions" value="—" />
                <Row label="Manual Credits" value="—" />
                <Row label="Manual Debits" value="—" />
              </Card>

              <Card className="p-4">
                <h3 className="font-semibold mb-3 flex items-center gap-2"><TrendingUp className="w-4 h-4" /> Refinery Profitability (all-time)</h3>
                <Row label="Refining Fees Income" value={fmtDA(refiningFeesAll)} cls="text-emerald-600" />
                <Row label="Premium Income" value={fmtDA(premiumIncome)} />
                <Row label="Discount Costs" value={fmtDA(discountExpense)} cls="text-destructive" />
                <Row label="Other Income" value={fmtDA(otherIncome)} />
                <Row label="Other Expenses" value={fmtDA(otherExpenses)} cls="text-destructive" />
                <div className="border-t mt-2 pt-2">
                  <Row label="Net Profit" value={fmtDA(netProfit)} cls={balCls(netProfit)} bold />
                </div>
              </Card>
            </section>

            {/* CLIENT BALANCES */}
            <section>
              <Card className="p-4">
                <h3 className="font-semibold mb-3">Client Balances</h3>
                <div className="overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50">
                      <tr className="text-left">
                        <th className="px-2 py-2">Code</th>
                        <th className="px-2 py-2">Client Name</th>
                        <th className="px-2 py-2 text-right">Pure Gold</th>
                        <th className="px-2 py-2 text-right">DA Balance</th>
                        <th className="px-2 py-2 text-right">Last Transaction</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.clients.map((c) => (
                        <tr key={c.id} className="border-t hover:bg-muted/30">
                          <td className="px-2 py-2 font-mono text-xs">{c.code}</td>
                          <td className="px-2 py-2">{c.name}</td>
                          <td className={`px-2 py-2 text-right tabular-nums ${balCls(c.purity_balance)}`}>{fmtG(c.purity_balance)}</td>
                          <td className={`px-2 py-2 text-right tabular-nums ${balCls(c.da_balance)}`}>{fmtDA(c.da_balance)}</td>
                          <td className="px-2 py-2 text-right text-muted-foreground">{c.last_tx_date ?? "—"}</td>
                        </tr>
                      ))}
                      {data.clients.length === 0 && (
                        <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">No clients yet</td></tr>
                      )}
                    </tbody>
                    <tfoot className="bg-muted/30 font-semibold">
                      <tr className="border-t-2">
                        <td className="px-2 py-2" colSpan={2}>Grand Totals</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${balCls(data.totals.totalClientGoldBalance)}`}>{fmtG(data.totals.totalClientGoldBalance)}</td>
                        <td className={`px-2 py-2 text-right tabular-nums ${balCls(data.totals.totalClientDaBalance)}`}>{fmtDA(data.totals.totalClientDaBalance)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </Card>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

// ---- tiny presentational components ----
function Kpi({
  icon, label, value, valueClass, accent, subtle,
}: { icon: React.ReactNode; label: string; value: string; valueClass?: string; accent?: "amber" | "green" | "red"; subtle?: boolean }) {
  const ring =
    accent === "amber" ? "ring-1 ring-amber-500/20 bg-amber-500/5" :
    accent === "green" ? "ring-1 ring-emerald-500/20 bg-emerald-500/5" :
    accent === "red" ? "ring-1 ring-destructive/30 bg-destructive/5" : "";
  return (
    <Card className={`p-3 ${ring} ${subtle ? "opacity-70" : ""}`}>
      <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
      <p className={`text-lg md:text-xl font-semibold mt-1 tabular-nums ${valueClass ?? ""}`}>{value}</p>
    </Card>
  );
}
function Row({ label, value, cls, bold }: { label: string; value: string; cls?: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1.5 text-sm ${bold ? "font-semibold" : ""}`}>
      <span className="text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${cls ?? ""}`}>{value}</span>
    </div>
  );
}
function Mini({ label, value, full }: { label: string; value: string; full?: boolean }) {
  return (
    <div className={`rounded-md border p-2 ${full ? "col-span-2" : ""}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-semibold tabular-nums">{value}</p>
    </div>
  );
}
