import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  Plus, Pencil, Archive, Trash2, Search, RotateCcw, FileText, Share2,
  ShieldCheck, ArrowRight, Users, Coins, ArrowDownToLine, ArrowUpFromLine,
  ListChecks, AlertTriangle, MoreHorizontal, BarChart3,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  listRefineries, getRefineryCardStats, getRefineryPerformance,
  createRefinery, updateRefinery, archiveRefinery, restoreRefinery, deleteRefinery,
  type Refinery, type RefineryCardStats, type RefineryPerformance,
} from "@/lib/refineries.functions";
import { REFINERY_ICON_KEYS, REFINERY_COLOR_PRESETS, RefineryIcon } from "./RefineryIcon";

const fmtG = (n: number) =>
  `${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
const daysSince = (iso: string | null) => {
  if (!iso) return Infinity;
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
};
const fmtAgo = (iso: string | null) => {
  if (!iso) return "No activity";
  const d = daysSince(iso);
  if (d === 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 30) return `${d}d ago`;
  if (d < 365) return `${Math.floor(d / 30)}mo ago`;
  return `${Math.floor(d / 365)}y ago`;
};

type SortKey = "code" | "activity" | "gold" | "name";

export function RefineryManagementGrid({
  isAdmin,
  onPick,
}: {
  isAdmin: boolean;
  onPick: (id: string) => void;
}) {
  const [refineries, setRefineries] = useState<Refinery[]>([]);
  const [stats, setStats] = useState<Record<string, RefineryCardStats>>({});
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"active" | "inactive" | "archived" | "all">("active");
  const [sortKey, setSortKey] = useState<SortKey>("code");
  const [editing, setEditing] = useState<Refinery | null | "new">(null);
  const [pendingArchive, setPendingArchive] = useState<Refinery | null>(null);
  const [pendingDelete, setPendingDelete] = useState<Refinery | null>(null);
  const [perfFor, setPerfFor] = useState<Refinery | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const refs = await listRefineries();
      setRefineries(refs);
      if (refs.length) {
        const s = await getRefineryCardStats({ data: { ids: refs.map((r) => r.id) } });
        const map: Record<string, RefineryCardStats> = {};
        for (const row of s) map[row.id] = row;
        setStats(map);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load refineries");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void reload(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const arr = refineries.filter((r) => {
      if (statusFilter !== "all" && r.status !== statusFilter) return false;
      if (!q) return true;
      return (
        r.code.toLowerCase().includes(q) ||
        r.name.toLowerCase().includes(q) ||
        (r.description ?? "").toLowerCase().includes(q)
      );
    });
    arr.sort((a, b) => {
      if (sortKey === "code") return a.code.localeCompare(b.code, undefined, { numeric: true });
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "gold") {
        return (stats[b.id]?.pureGoldStock ?? 0) - (stats[a.id]?.pureGoldStock ?? 0);
      }
      // activity
      const da = stats[a.id]?.lastActivityAt;
      const db = stats[b.id]?.lastActivityAt;
      return (db ? new Date(db).getTime() : 0) - (da ? new Date(da).getTime() : 0);
    });
    return arr;
  }, [refineries, stats, search, statusFilter, sortKey]);

  return (
    <div className="space-y-3">
      {/* Compact toolbar — single row on tablet+ */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search refineries…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
          <SelectTrigger className="w-[120px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="inactive">Inactive</SelectItem>
            {isAdmin && <SelectItem value="archived">Archived</SelectItem>}
            <SelectItem value="all">All</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[130px] h-9"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="code">Code</SelectItem>
            <SelectItem value="name">Name</SelectItem>
            <SelectItem value="activity">Activity</SelectItem>
            <SelectItem value="gold">Gold Balance</SelectItem>
          </SelectContent>
        </Select>
        {isAdmin && (
          <Button onClick={() => setEditing("new")} size="sm" className="h-9">
            <Plus className="h-4 w-4 mr-1" /> Add
          </Button>
        )}
      </div>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-10">Loading refineries…</p>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm text-muted-foreground">
          No refineries match the current filters.
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filtered.map((r) => (
            <RefineryCard
              key={r.id}
              refinery={r}
              stats={stats[r.id]}
              isAdmin={isAdmin}
              onOpen={() => onPick(r.id)}
              onEdit={() => setEditing(r)}
              onArchive={() => setPendingArchive(r)}
              onRestore={async () => {
                await restoreRefinery({ data: { id: r.id } });
                toast.success("Refinery restored");
                void reload();
              }}
              onDelete={() => setPendingDelete(r)}
              onStats={() => setPerfFor(r)}
            />
          ))}
        </div>
      )}

      {/* Form dialog */}
      {editing !== null && (
        <RefineryFormDialog
          initial={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); void reload(); }}
        />
      )}

      {/* Archive confirm */}
      <AlertDialog open={!!pendingArchive} onOpenChange={(o) => !o && setPendingArchive(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archive {pendingArchive?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Archived refineries are hidden from non-admin users. All data is kept and you can restore the refinery at any time.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!pendingArchive) return;
                try {
                  await archiveRefinery({ data: { id: pendingArchive.id } });
                  toast.success("Refinery archived");
                  setPendingArchive(null);
                  void reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Failed");
                }
              }}
            >Archive</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete confirm */}
      <AlertDialog open={!!pendingDelete} onOpenChange={(o) => !o && setPendingDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" /> Delete {pendingDelete?.name}?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the refinery. It only succeeds if the refinery has <strong>no clients,
              transactions, or stock movements</strong>. Otherwise archive it instead.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (!pendingDelete) return;
                try {
                  await deleteRefinery({ data: { id: pendingDelete.id } });
                  toast.success("Refinery deleted");
                  setPendingDelete(null);
                  void reload();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Delete failed");
                }
              }}
            >Delete permanently</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Performance dialog */}
      {perfFor && <RefineryPerformanceDialog refinery={perfFor} onClose={() => setPerfFor(null)} />}
    </div>
  );
}

function statusTone(
  r: Refinery,
  last: string | null,
  hasActivity: boolean,
): { dot: string; label: string } {
  if (r.status === "archived") return { dot: "bg-muted-foreground/60", label: "Archived" };
  if (r.status === "inactive") return { dot: "bg-destructive", label: "Inactive" };
  if (!hasActivity) return { dot: "bg-muted-foreground/50", label: "Idle" };
  const d = daysSince(last);
  if (d > 30) return { dot: "bg-destructive", label: "Requires Attention" };
  if (d > 7) return { dot: "bg-muted-foreground/60", label: "Quiet" };
  return { dot: "bg-emerald-500", label: "Active" };
}

function RefineryCard({
  refinery, stats, isAdmin, onOpen, onEdit, onArchive, onRestore, onDelete, onStats,
}: {
  refinery: Refinery;
  stats: RefineryCardStats | undefined;
  isAdmin: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onArchive: () => void;
  onRestore: () => void;
  onDelete: () => void;
  onStats: () => void;
}) {
  const archived = refinery.status === "archived";
  const hasActivity = !!stats && (stats.transactionCount > 0 || stats.totalClients > 0 || stats.pureGoldStock !== 0);
  const tone = statusTone(refinery, stats?.lastActivityAt ?? null, hasActivity);
  const equity = stats ? stats.pureGoldStock + stats.goldOwedByClients - stats.goldOwedToClients : 0;

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = `${window.location.origin}/desk/refineries/${refinery.id}`;
    const text = `${refinery.name} (${refinery.code})\n${url}`;
    try {
      if (navigator.share) await navigator.share({ title: refinery.name, text, url });
      else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copied");
      }
    } catch { /* user cancelled */ }
  };

  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={`group rounded-lg border border-border/60 bg-card hover:border-border hover:bg-card/80 transition cursor-pointer ${archived ? "opacity-60" : ""}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <div className="min-w-0 flex items-center gap-2.5">
          <h3 className="font-semibold text-base text-foreground truncate" title={refinery.name}>
            Refinery {refinery.code}
          </h3>
          <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} />
            {tone.label}
          </span>
        </div>
        <div className="flex items-center gap-0.5 -mr-2 opacity-70 group-hover:opacity-100 transition">
          {isAdmin && (
            <Button variant="ghost" size="sm" onClick={stop(onEdit)} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground">
              Edit
            </Button>
          )}
          <Button variant="ghost" size="sm" onClick={handleShare} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground">
            Share
          </Button>
          <Button variant="ghost" size="sm" onClick={stop(onStats)} className="h-7 px-2 text-[11px] text-muted-foreground hover:text-foreground">
            Reports
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" onClick={(e) => e.stopPropagation()} className="h-7 w-7 text-muted-foreground">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44" onClick={(e) => e.stopPropagation()}>
              <DropdownMenuItem onClick={onStats}>
                <BarChart3 className="h-4 w-4 mr-2" /> Statistics
              </DropdownMenuItem>
              {isAdmin && (
                <>
                  <DropdownMenuSeparator />
                  {archived ? (
                    <DropdownMenuItem onClick={onRestore}>
                      <RotateCcw className="h-4 w-4 mr-2" /> Restore
                    </DropdownMenuItem>
                  ) : (
                    <DropdownMenuItem onClick={onArchive}>
                      <Archive className="h-4 w-4 mr-2" /> Archive
                    </DropdownMenuItem>
                  )}
                  <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                    <Trash2 className="h-4 w-4 mr-2" /> Delete…
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="h-px bg-border/50" />

      {hasActivity && stats ? (
        <div className="px-4 py-3 space-y-3">
          {/* Equity headline */}
          <div className="flex items-baseline justify-between">
            <span className="text-[11px] uppercase tracking-wider text-muted-foreground">Refinery Equity</span>
            <span className={`text-2xl font-semibold tabular-nums ${equity > 0 ? "text-emerald-400" : equity < 0 ? "text-destructive" : "text-foreground"}`}>
              {fmtG(equity)}
            </span>
          </div>

          {/* Stat rows — Bloomberg-style key/value list */}
          <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-[13px]">
            <Row label="Pure Gold" value={fmtG(stats.pureGoldStock)} />
            <Row label="Silver" value={fmtG(stats.silverStock)} />
            <Row label="Clients" value={String(stats.totalClients)} />
            <Row label="Transactions" value={String(stats.transactionCount)} />
            <Row label="Owed To" value={fmtG(stats.goldOwedToClients)} tone={stats.goldOwedToClients > 0 ? "negative" : undefined} />
            <Row label="Owed By" value={fmtG(stats.goldOwedByClients)} tone={stats.goldOwedByClients > 0 ? "positive" : undefined} />
            <Row label="Last Activity" value={fmtAgo(stats.lastActivityAt)} span={2} />
          </dl>
        </div>
      ) : (
        <div className="px-4 py-5">
          <p className="text-sm text-foreground">No activity yet</p>
          <p className="text-xs text-muted-foreground mt-0.5">
            Create first client or transaction.
          </p>
        </div>
      )}
    </div>
  );
}

function Row({
  label, value, tone, span,
}: {
  label: string;
  value: string;
  tone?: "positive" | "negative";
  span?: 1 | 2;
}) {
  const color =
    tone === "positive" ? "text-emerald-400"
    : tone === "negative" ? "text-destructive"
    : "text-foreground";
  return (
    <div className={`flex items-baseline justify-between gap-2 min-w-0 ${span === 2 ? "col-span-2" : ""}`}>
      <dt className="text-[11px] uppercase tracking-wider text-muted-foreground truncate">{label}</dt>
      <dd className={`tabular-nums font-medium ${color} truncate`}>{value}</dd>
      <p className={`text-sm font-semibold tabular-nums truncate ${color}`}>{value}</p>
    </div>
  );
}

function RefineryFormDialog({
  initial, onClose, onSaved,
}: {
  initial: Refinery | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [code, setCode] = useState(initial?.code ?? "");
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [status, setStatus] = useState<"active" | "inactive">(
    initial?.status === "inactive" ? "inactive" : "active",
  );
  const [iconName, setIconName] = useState(initial?.icon_name ?? "factory");
  const [iconColor, setIconColor] = useState(initial?.icon_color ?? "#f59e0b");
  const [badgeColor, setBadgeColor] = useState(initial?.badge_color ?? "#fef3c7");
  const [feePrice, setFeePrice] = useState<number>(initial?.default_fee_price ?? 0);
  const [reportFooter, setReportFooter] = useState(initial?.report_footer ?? "");
  const [receiptFooter, setReceiptFooter] = useState(initial?.receipt_footer ?? "");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!code.trim() || !name.trim()) {
      toast.error("Code and Name are required");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        code: code.trim(),
        name: name.trim(),
        description,
        status,
        icon_name: iconName,
        icon_color: iconColor,
        badge_color: badgeColor,
        default_fee_price: Number(feePrice) || 0,
        report_footer: reportFooter,
        receipt_footer: receiptFooter,
      };
      if (initial) await updateRefinery({ data: { id: initial.id, ...payload } });
      else await createRefinery({ data: payload });
      toast.success(initial ? "Refinery updated" : "Refinery created");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefineryIcon name={iconName} iconColor={iconColor} badgeColor={badgeColor} size={18} />
            {initial ? "Edit Refinery" : "Add Refinery"}
          </DialogTitle>
          <DialogDescription>
            Administrators can manage refinery identity, default fees, and report/receipt footers.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <Label>Code</Label>
            <Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="3601" />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as "active" | "inactive")}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="sm:col-span-2">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Refinery 3601" />
          </div>
          <div className="sm:col-span-2">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} />
          </div>

          <div className="sm:col-span-2">
            <Label className="mb-1 block">Icon</Label>
            <div className="flex flex-wrap gap-2">
              {REFINERY_ICON_KEYS.map((k) => {
                const active = k === iconName;
                return (
                  <button
                    key={k} type="button" onClick={() => setIconName(k)}
                    className={`p-1 rounded-md border ${active ? "ring-2 ring-primary" : ""}`}
                    title={k}
                  >
                    <RefineryIcon name={k} iconColor={iconColor} badgeColor={badgeColor} size={16} />
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sm:col-span-2">
            <Label className="mb-1 block">Color preset</Label>
            <div className="flex flex-wrap gap-2">
              {REFINERY_COLOR_PRESETS.map((c) => (
                <button
                  key={c.name} type="button"
                  className={`px-2 py-1 rounded-md border text-xs flex items-center gap-2 ${iconColor === c.icon ? "ring-2 ring-primary" : ""}`}
                  onClick={() => { setIconColor(c.icon); setBadgeColor(c.badge); }}
                >
                  <span className="h-3 w-3 rounded-sm border" style={{ background: c.badge, borderColor: c.icon }} />
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <Label>Default Refining Fee (DA / g)</Label>
            <Input type="number" min={0} value={feePrice} onChange={(e) => setFeePrice(Number(e.target.value))} />
          </div>
          <div />

          <div className="sm:col-span-2">
            <Label>Report Footer</Label>
            <Textarea value={reportFooter} onChange={(e) => setReportFooter(e.target.value)} rows={2} placeholder="Shown at the bottom of PDF reports." />
          </div>
          <div className="sm:col-span-2">
            <Label>Receipt Footer</Label>
            <Textarea value={receiptFooter} onChange={(e) => setReceiptFooter(e.target.value)} rows={2} placeholder="Shown at the bottom of printed receipts." />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : initial ? "Save changes" : "Create refinery"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RefineryPerformanceDialog({ refinery, onClose }: { refinery: Refinery; onClose: () => void }) {
  const [data, setData] = useState<RefineryPerformance | null>(null);
  const [loading, setLoading] = useState(true);
  const [months, setMonths] = useState(6);

  useEffect(() => {
    let live = true;
    setLoading(true);
    getRefineryPerformance({ data: { refineryId: refinery.id, months } })
      .then((d) => { if (live) setData(d); })
      .catch((e) => toast.error(e instanceof Error ? e.message : "Failed to load"))
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, [refinery.id, months]);

  const shareSummary = () => {
    if (!data) return;
    const text = [
      `*${refinery.name}* — last ${months} months`,
      `Gold received: ${fmtG(data.totalGoldReceived)}`,
      `Gold delivered: ${fmtG(data.totalGoldDelivered)}`,
      `Refining fees: ${data.totalRefiningFees.toLocaleString()} DA`,
      `Avg purity: ${data.averagePurity.toFixed(2)}`,
      `Loss: ${fmtG(data.totalLoss)}`,
    ].join("\n");
    window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank");
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefineryIcon name={refinery.icon_name} iconColor={refinery.icon_color} badgeColor={refinery.badge_color} size={18} />
            {refinery.name} — Statistics
          </DialogTitle>
          <DialogDescription>Performance over the selected period.</DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 mb-3">
          <Label className="text-xs">Period</Label>
          <Select value={String(months)} onValueChange={(v) => setMonths(Number(v))}>
            <SelectTrigger className="w-[140px] h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">Last month</SelectItem>
              <SelectItem value="3">Last 3 months</SelectItem>
              <SelectItem value="6">Last 6 months</SelectItem>
              <SelectItem value="12">Last 12 months</SelectItem>
              <SelectItem value="24">Last 24 months</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex-1" />
          <Button size="sm" variant="outline" onClick={shareSummary}>
            <Share2 className="h-4 w-4 mr-1" /> Share
          </Button>
        </div>

        {loading || !data ? (
          <p className="text-center text-sm text-muted-foreground py-10">Loading…</p>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <Kpi label="Gold Received" value={fmtG(data.totalGoldReceived)} />
              <Kpi label="Gold Delivered" value={fmtG(data.totalGoldDelivered)} />
              <Kpi label="Refining Fees" value={`${data.totalRefiningFees.toLocaleString()} DA`} />
              <Kpi label="Total Loss" value={fmtG(data.totalLoss)} />
              <Kpi label="Average Purity" value={data.averagePurity.toFixed(2)} />
              <Kpi label="Months tracked" value={String(data.monthly.length)} />
            </div>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Monthly activity</h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr><th className="text-left px-2 py-1">Month</th><th className="text-right px-2 py-1">Received</th><th className="text-right px-2 py-1">Delivered</th><th className="text-right px-2 py-1">Fees (DA)</th></tr>
                  </thead>
                  <tbody>
                    {data.monthly.length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-muted-foreground py-3">No activity</td></tr>
                    ) : data.monthly.map((m) => (
                      <tr key={m.month} className="border-t">
                        <td className="px-2 py-1">{m.month}</td>
                        <td className="px-2 py-1 text-right">{fmtG(m.received)}</td>
                        <td className="px-2 py-1 text-right">{fmtG(m.delivered)}</td>
                        <td className="px-2 py-1 text-right">{m.fees.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section>
              <h4 className="text-xs uppercase tracking-wider text-muted-foreground mb-2">Client ranking (by volume)</h4>
              <div className="border rounded-md overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr><th className="text-left px-2 py-1">#</th><th className="text-left px-2 py-1">Client</th><th className="text-right px-2 py-1">Gold volume</th><th className="text-right px-2 py-1">Fees (DA)</th></tr>
                  </thead>
                  <tbody>
                    {data.topClients.length === 0 ? (
                      <tr><td colSpan={4} className="text-center text-muted-foreground py-3">No client activity</td></tr>
                    ) : data.topClients.map((c, i) => (
                      <tr key={c.id} className="border-t">
                        <td className="px-2 py-1 text-muted-foreground">{i + 1}</td>
                        <td className="px-2 py-1">{c.code ? `${c.code} · ` : ""}{c.name}</td>
                        <td className="px-2 py-1 text-right">{fmtG(c.volume)}</td>
                        <td className="px-2 py-1 text-right">{c.fees.toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border bg-muted/20 p-2">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className="font-semibold text-sm">{value}</p>
    </div>
  );
}
