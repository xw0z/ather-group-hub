import { useEffect, useMemo, useState } from "react";
import {
  ScrollText,
  RefreshCw,
  UserPlus,
  Pencil,
  Trash2,
  LogIn,
  LogOut,
  FileText,
  Share2,
  Settings as SettingsIcon,
  DollarSign,
  TrendingUp,
  ShieldAlert,
  Calculator,
  Shield,
  Building2,
  KeyRound,
  Download,
  FileSpreadsheet,
  FileDown,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  listSwapActivityLog,
  listSwapClients,
  listSwapMarginHistory,
} from "@/lib/swap-clients.functions";
import { cached, invalidate, CK } from "@/lib/swap-cache";
import { useLang } from "@/lib/purity-i18n";
import { fmtTimestamp } from "@/lib/utils";

/* ------------------------------ Types ------------------------------ */

type Tone = "green" | "orange" | "red" | "blue" | "neutral";
type Module =
  | "all"
  | "auth"
  | "users"
  | "clients"
  | "financial"
  | "margin"
  | "swap"
  | "premium"
  | "reports"
  | "security"
  | "system";

type Change = {
  label: string;
  oldText: string;
  newText: string;
  highlight?: boolean;
};

type AuditEntry = {
  id: string;
  when: string; // ISO
  who: string;
  module: Module;
  action: string;
  title: string;
  status: "success" | "failure" | "denied";
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  clientCode?: string;
  clientName?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  details?: Record<string, unknown> | null;
  changes: Change[];
  extra?: { label: string; value: string }[];
};

/* --------------------------- Friendly maps -------------------------- */

const FIELD_LABELS: Record<string, string> = {
  gold_kg: "Gold Balance",
  usd_balance: "USD Balance",
  annual_rate: "Long Swap Rate",
  short_annual_rate: "Short Swap Rate",
  margin_requirement_pct: "Margin Requirement",
  additional_exposure_pct: "Additional Exposure",
  position_type: "Position",
  xauusd_price: "Gold Price",
  code: "Client Code",
  notes: "Client Name",
  username: "Username",
  email: "Email",
  is_admin: "Admin",
  is_manager: "Manager",
  name: "Name",
  grams: "Grams",
  per_oz: "Per Oz",
  amount_usd: "Amount (USD)",
  kind: "Kind",
};

function fmtNum(n: number, d = 2) {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function fmtMoney(n: number) {
  const v = Number(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${fmtNum(Math.abs(v))}`;
}
function fmtField(key: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "—";
  switch (key) {
    case "gold_kg":
      return `${fmtNum(Number(v) * 1000, 0)} g`;
    case "usd_balance":
    case "amount_usd":
      return fmtMoney(Number(v));
    case "xauusd_price":
    case "per_oz":
      return `${fmtMoney(Number(v))} / oz`;
    case "annual_rate":
    case "short_annual_rate":
    case "margin_requirement_pct":
    case "additional_exposure_pct":
      return `${fmtNum(Number(v))}%`;
    case "position_type":
      return String(v).charAt(0).toUpperCase() + String(v).slice(1);
    case "is_admin":
    case "is_manager":
      return v ? "Yes" : "No";
    default:
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
  }
}

function statusLabel(s: string | null): string {
  if (!s) return "—";
  if (s === "enough" || s === "safe") return "Safe";
  if (s === "warning") return "Warning";
  if (s === "critical") return "Critical";
  return "Margin Needed";
}

/* ------------------------ Event type config ------------------------ */

type EventConfig = {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
};

const EVENT_CONFIG: Record<string, EventConfig> = {
  client_created: { title: "Client Created", icon: UserPlus, tone: "green" },
  client_updated: { title: "Client Updated", icon: Pencil, tone: "orange" },
  client_deleted: { title: "Client Deleted", icon: Trash2, tone: "red" },
  user_login: { title: "User Login", icon: LogIn, tone: "green" },
  user_logout: { title: "User Logout", icon: LogOut, tone: "neutral" },
  user_created: { title: "User Created", icon: UserPlus, tone: "green" },
  user_updated: { title: "User Updated", icon: Pencil, tone: "orange" },
  user_deleted: { title: "User Deleted", icon: Trash2, tone: "red" },
  login_succeeded: { title: "Sign-in Succeeded", icon: LogIn, tone: "green" },
  login_failed: { title: "Sign-in Failed", icon: ShieldAlert, tone: "red" },
  password_changed: { title: "Password Changed", icon: KeyRound, tone: "blue" },
  password_reset: { title: "Password Reset", icon: KeyRound, tone: "orange" },
  bootstrap_admin: { title: "First Admin Created", icon: ShieldAlert, tone: "blue" },
  unauthorized_access: { title: "Unauthorized Access", icon: Shield, tone: "red" },
  profile_updated: { title: "Profile Updated", icon: Pencil, tone: "orange" },
  report_download: { title: "Report Downloaded", icon: Download, tone: "blue" },
  report_whatsapp: { title: "Report Sent via WhatsApp", icon: Share2, tone: "blue" },
  report_copy: { title: "Report Copied", icon: FileText, tone: "blue" },
  report_generated: { title: "Report Generated", icon: FileText, tone: "green" },
  report_shared: { title: "Report Shared", icon: Share2, tone: "blue" },
  report_viewed: { title: "Report Viewed", icon: FileText, tone: "neutral" },
  settings_updated: { title: "Settings Updated", icon: SettingsIcon, tone: "orange" },
  settings_applied_to_existing_clients: {
    title: "Settings Applied To Clients",
    icon: SettingsIcon,
    tone: "blue",
  },
  fees_computed_manual: { title: "Swap Fees Computed", icon: Calculator, tone: "blue" },
  xau_price_override: { title: "Gold Price Override", icon: TrendingUp, tone: "blue" },
  premium_company_created: { title: "Company Created", icon: Building2, tone: "green" },
  premium_company_updated: { title: "Company Updated", icon: Building2, tone: "orange" },
  premium_company_deleted: { title: "Company Deleted", icon: Trash2, tone: "red" },
  premium_tx_created: { title: "Premium Transaction Added", icon: DollarSign, tone: "green" },
  premium_tx_deleted: { title: "Premium Transaction Deleted", icon: Trash2, tone: "red" },
};

function fallbackConfig(action: string): EventConfig {
  return {
    title: action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: ScrollText,
    tone: "neutral",
  };
}

function deriveModule(action: string): Module {
  if (action.startsWith("login_") || action === "user_logout" || action.startsWith("password_") || action === "bootstrap_admin")
    return "auth";
  if (action === "unauthorized_access") return "security";
  if (action.startsWith("user_")) return "users";
  if (action.startsWith("premium_")) return "premium";
  if (action.startsWith("report_")) return "reports";
  if (action.startsWith("settings_")) return "system";
  if (action === "fees_computed_manual") return "swap";
  if (action === "xau_price_override") return "margin";
  if (action.startsWith("client_")) return "clients";
  return "system";
}

/* ------------------------------ Styles ----------------------------- */

const TONE_RING: Record<Tone, string> = {
  green: "border-l-green-500",
  orange: "border-l-orange-500",
  red: "border-l-red-500",
  blue: "border-l-blue-500",
  neutral: "border-l-muted-foreground/40",
};
const TONE_BG: Record<Tone, string> = {
  green: "bg-green-500/10 text-green-600",
  orange: "bg-orange-500/10 text-orange-600",
  red: "bg-red-500/10 text-red-600",
  blue: "bg-blue-500/10 text-blue-600",
  neutral: "bg-muted text-foreground",
};

const MODULE_FILTERS: { key: Module; label: string }[] = [
  { key: "all", label: "All" },
  { key: "auth", label: "Authentication" },
  { key: "users", label: "Users" },
  { key: "clients", label: "Clients" },
  { key: "financial", label: "Financial" },
  { key: "margin", label: "Margin" },
  { key: "swap", label: "Swap" },
  { key: "premium", label: "Premium" },
  { key: "reports", label: "Reports" },
  { key: "security", label: "Security" },
  { key: "system", label: "System" },
];

/* ============================ Component ============================ */

export function AuditLogPanel() {
  const { t: tt } = useLang();
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [moduleFilter, setModuleFilter] = useState<Module>("all");
  const [search, setSearch] = useState("");
  const [userFilter, setUserFilter] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [open, setOpen] = useState<AuditEntry | null>(null);
  const [exporting, setExporting] = useState(false);

  async function load(force = false) {
    setLoading(true);
    try {
      if (force) invalidate(CK.activity, CK.margin, CK.clients);
      const [act, margin, clients] = await Promise.all([
        cached(CK.activity, () => listSwapActivityLog(), 30_000),
        cached(CK.margin, () => listSwapMarginHistory({ data: {} }), 30_000),
        cached(CK.clients, () => listSwapClients(), 60_000),
      ]);
      const byId = new Map<string, { code: string; name?: string }>();
      for (const c of clients as Array<{ id: string; code: string; notes?: string | null }>) {
        byId.set(c.id, { code: c.code, name: c.notes ?? undefined });
      }
      const out: AuditEntry[] = [];
      const marginKeys = new Set<string>();

      // Margin history -> rich before/after entries
      for (const r of margin as Array<{
        id: string;
        client_id: string;
        username: string;
        created_at: string;
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
      }>) {
        const ch: Change[] = [];

        const aUsd = Number(r.old_usd_balance ?? 0);
        const bUsd = Number(r.new_usd_balance ?? 0);
        if (aUsd !== bUsd) {
          ch.push({ label: "USD Balance", oldText: fmtMoney(aUsd), newText: fmtMoney(bUsd) });
        }
        const aKg = Number(r.old_gold_kg ?? 0);
        const bKg = Number(r.new_gold_kg ?? 0);
        if (aKg !== bKg) {
          ch.push({
            label: "Gold Balance",
            oldText: `${fmtNum(aKg * 1000, 0)} g`,
            newText: `${fmtNum(bKg * 1000, 0)} g`,
          });
        }
        const aPct = Number(r.old_margin_pct ?? 0);
        const bPct = Number(r.new_margin_pct ?? 0);
        if (aPct !== bPct) {
          ch.push({ label: "Margin Req", oldText: `${fmtNum(aPct)}%`, newText: `${fmtNum(bPct)}%` });
        }
        const aXau = Number(r.old_xauusd_price ?? 0);
        const bXau = Number(r.new_xauusd_price ?? 0);
        if (aXau !== bXau && (aXau > 0 || bXau > 0)) {
          ch.push({
            label: "Gold Price",
            oldText: aXau > 0 ? `${fmtMoney(aXau)} / oz` : "—",
            newText: bXau > 0 ? `${fmtMoney(bXau)} / oz` : "—",
          });
        }
        const statusChanged = r.old_status !== r.new_status;
        const critical = statusChanged && (r.new_status === "needed" || r.new_status === "critical");
        if (statusChanged) {
          ch.push({
            label: "Margin Status",
            oldText: statusLabel(r.old_status),
            newText: statusLabel(r.new_status),
            highlight: critical,
          });
        }

        if (ch.length === 0) continue;

        const c = byId.get(r.client_id);
        const title = statusChanged ? "Margin Status Changed" : ch.length === 1 ? ch[0].label : "Client Updated";
        const tone: Tone = critical ? "red" : "orange";
        const isFinancial = ch.some((x) => x.label === "USD Balance" || x.label === "Gold Balance");
        const mod: Module = critical
          ? "margin"
          : isFinancial
            ? "financial"
            : statusChanged
              ? "margin"
              : "clients";
        marginKeys.add(`${r.client_id}:${r.created_at.slice(0, 19)}`);

        out.push({
          id: `m:${r.id}`,
          when: r.created_at,
          who: r.username || "system",
          module: mod,
          action: "margin_change",
          title,
          status: "success",
          icon: statusChanged ? ShieldAlert : Pencil,
          tone,
          clientCode: c?.code,
          clientName: c?.name,
          oldValues: {
            usd_balance: r.old_usd_balance,
            gold_kg: r.old_gold_kg,
            xauusd_price: r.old_xauusd_price,
            margin_requirement_pct: r.old_margin_pct,
            status: r.old_status,
          },
          newValues: {
            usd_balance: r.new_usd_balance,
            gold_kg: r.new_gold_kg,
            xauusd_price: r.new_xauusd_price,
            margin_requirement_pct: r.new_margin_pct,
            status: r.new_status,
          },
          changes: ch,
        });
      }

      // Activity log rows
      for (const r of act as Array<{
        id: string;
        action: string;
        username: string;
        created_at: string;
        entity_type: string | null;
        entity_id: string | null;
        module: Module | null;
        status: "success" | "failure" | "denied" | null;
        ip_address: string | null;
        user_agent: string | null;
        old_values: unknown;
        new_values: unknown;
        details: unknown;
      }>) {
        const cfg = EVENT_CONFIG[r.action] ?? fallbackConfig(r.action);
        const det = (r.details ?? {}) as Record<string, unknown>;
        const oldV = (r.old_values ?? null) as Record<string, unknown> | null;
        const newV = (r.new_values ?? null) as Record<string, unknown> | null;

        // Dedupe client_updated rows already represented by margin diffs
        if (r.action === "client_updated" && r.entity_id) {
          const k = `${r.entity_id}:${r.created_at.slice(0, 19)}`;
          if (marginKeys.has(k)) continue;
        }

        const c = r.entity_id ? byId.get(r.entity_id) : undefined;
        const code = (det.code as string | undefined) ?? c?.code;
        const name = c?.name;

        const changes: Change[] = [];
        const extra: { label: string; value: string }[] = [];

        // Build before/after changes from old/new values
        if (oldV && newV) {
          const keys = new Set([...Object.keys(oldV), ...Object.keys(newV)]);
          for (const k of keys) {
            if (k === "code") continue;
            const a = oldV[k];
            const b = newV[k];
            if (JSON.stringify(a) === JSON.stringify(b)) continue;
            changes.push({
              label: FIELD_LABELS[k] ?? k.replace(/_/g, " "),
              oldText: fmtField(k, a),
              newText: fmtField(k, b),
            });
          }
        } else if (newV) {
          for (const [k, v] of Object.entries(newV)) {
            if (k === "code") continue;
            extra.push({ label: FIELD_LABELS[k] ?? k.replace(/_/g, " "), value: fmtField(k, v) });
          }
        }

        // Extras for specific actions
        if (r.action === "fees_computed_manual") {
          const date = det.date as string | undefined;
          const count = det.count as number | undefined;
          const total = det.total as number | undefined;
          if (date) extra.push({ label: "Date", value: date });
          if (typeof count === "number") extra.push({ label: "Clients", value: String(count) });
          if (typeof total === "number") extra.push({ label: "Total Fees", value: fmtMoney(total) });
        } else if (r.action.startsWith("report_")) {
          const rt = det.report_type as string | undefined;
          const fmtType = det.format as string | undefined;
          const ch = det.channel as string | undefined;
          if (rt) extra.push({ label: "Report", value: rt.replace(/_/g, " ") });
          if (fmtType) extra.push({ label: "Format", value: fmtType.toUpperCase() });
          if (ch) extra.push({ label: "Channel", value: ch });
        } else if (r.action === "login_failed") {
          const reason = det.reason as string | undefined;
          if (reason) extra.push({ label: "Reason", value: reason.replace(/_/g, " ") });
        }

        out.push({
          id: `a:${r.id}`,
          when: r.created_at,
          who: r.username || "system",
          module: (r.module as Module) ?? deriveModule(r.action),
          action: r.action,
          title: cfg.title,
          status: r.status ?? "success",
          icon: cfg.icon,
          tone: r.status === "failure" ? "red" : r.status === "denied" ? "red" : cfg.tone,
          clientCode: code,
          clientName: name,
          ipAddress: r.ip_address,
          userAgent: r.user_agent,
          oldValues: oldV,
          newValues: newV,
          details: det,
          changes,
          extra: extra.length > 0 ? extra : undefined,
        });
      }

      out.sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());
      setEntries(out);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const usernames = useMemo(() => {
    const s = new Set<string>();
    for (const e of entries) if (e.who) s.add(e.who);
    return Array.from(s).sort();
  }, [entries]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const u = userFilter.trim().toLowerCase();
    const fromMs = from ? new Date(`${from}T00:00:00`).getTime() : null;
    const toMs = to ? new Date(`${to}T23:59:59.999`).getTime() : null;
    return entries.filter((e) => {
      if (moduleFilter !== "all" && e.module !== moduleFilter) return false;
      if (u && e.who.toLowerCase() !== u) return false;
      if (fromMs !== null && new Date(e.when).getTime() < fromMs) return false;
      if (toMs !== null && new Date(e.when).getTime() > toMs) return false;
      if (q) {
        const hay = `${e.clientCode ?? ""} ${e.clientName ?? ""} ${e.who} ${e.action} ${e.title}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, moduleFilter, search, userFilter, from, to]);

  /* ---------------------------- Exports --------------------------- */

  function toExportRows(rows: AuditEntry[]) {
    return rows.map((e) => ({
      Timestamp: new Date(e.when).toISOString(),
      Module: e.module,
      Action: e.action,
      Title: e.title,
      Status: e.status,
      User: e.who,
      Client: [e.clientCode, e.clientName].filter(Boolean).join(" · "),
      "IP Address": e.ipAddress ?? "",
      Device: (e.userAgent ?? "").slice(0, 200),
      "Old Values": e.oldValues ? JSON.stringify(e.oldValues) : "",
      "New Values": e.newValues ? JSON.stringify(e.newValues) : "",
      Changes:
        e.changes.map((c) => `${c.label}: ${c.oldText} → ${c.newText}`).join(" | "),
    }));
  }

  async function exportCsv() {
    const rows = toExportRows(filtered);
    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const lines = [headers.join(",")];
    for (const r of rows) lines.push(headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","));
    downloadBlob(
      new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" }),
      `audit-log-${new Date().toISOString().slice(0, 10)}.csv`,
    );
  }

  async function exportXlsx() {
    setExporting(true);
    try {
      const XLSX = await import("xlsx");
      const rows = toExportRows(filtered);
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Audit Log");
      XLSX.writeFile(wb, `audit-log-${new Date().toISOString().slice(0, 10)}.xlsx`);
    } finally {
      setExporting(false);
    }
  }

  async function exportPdf() {
    setExporting(true);
    try {
      const { jsPDF } = await import("jspdf");
      const { default: autoTable } = await import("jspdf-autotable");
      const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
      doc.setFontSize(14);
      doc.text("Audit Log", 40, 32);
      doc.setFontSize(9);
      doc.text(`Generated ${new Date().toLocaleString()} · ${filtered.length} events`, 40, 48);

      const head = [["When", "Module", "Action", "Status", "User", "Client", "IP", "Summary"]];
      const body = filtered.map((e) => [
        new Date(e.when).toLocaleString(),
        e.module,
        e.title,
        e.status,
        e.who,
        [e.clientCode, e.clientName].filter(Boolean).join(" · "),
        e.ipAddress ?? "",
        e.changes.length
          ? e.changes.map((c) => `${c.label}: ${c.oldText} → ${c.newText}`).join("\n")
          : e.extra?.map((x) => `${x.label}: ${x.value}`).join("\n") ?? "",
      ]);
      autoTable(doc, {
        head,
        body,
        startY: 60,
        styles: { fontSize: 7, cellPadding: 3, overflow: "linebreak" },
        headStyles: { fillColor: [30, 41, 59] },
        columnStyles: {
          0: { cellWidth: 90 },
          1: { cellWidth: 55 },
          2: { cellWidth: 90 },
          3: { cellWidth: 45 },
          4: { cellWidth: 70 },
          5: { cellWidth: 90 },
          6: { cellWidth: 70 },
          7: { cellWidth: "auto" },
        },
      });
      doc.save(`audit-log-${new Date().toISOString().slice(0, 10)}.pdf`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">{tt("audit.title")}</h2>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button size="sm" variant="outline" onClick={() => load(true)}>
            <RefreshCw className="h-4 w-4 mr-1" /> {tt("common.refresh")}
          </Button>
          <Button size="sm" variant="outline" disabled={filtered.length === 0 || exporting} onClick={exportCsv}>
            <FileDown className="h-4 w-4 mr-1" /> CSV
          </Button>
          <Button size="sm" variant="outline" disabled={filtered.length === 0 || exporting} onClick={exportXlsx}>
            <FileSpreadsheet className="h-4 w-4 mr-1" /> Excel
          </Button>
          <Button size="sm" variant="outline" disabled={filtered.length === 0 || exporting} onClick={exportPdf}>
            <FileText className="h-4 w-4 mr-1" /> PDF
          </Button>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client, user, action…"
          className="h-9"
        />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="min-w-0">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">From</label>
            <Input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="min-w-0">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">To</label>
            <Input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="h-9"
            />
          </div>
          <div className="min-w-0">
            <label className="text-[11px] uppercase tracking-wide text-muted-foreground">User</label>
            <select
              value={userFilter}
              onChange={(e) => setUserFilter(e.target.value)}
              className="h-9 w-full rounded-md border border-border/60 bg-background px-2 text-sm"
            >
              <option value="">All users</option>
              {usernames.map((u) => (
                <option key={u} value={u}>
                  {u}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {MODULE_FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setModuleFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                moduleFilter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">{tt("common.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {entries.length === 0 ? tt("audit.noActivity") : tt("audit.noMatch")}
        </p>
      ) : (
        <>
          <p className="text-[11px] text-muted-foreground mb-2">
            {filtered.length} event{filtered.length === 1 ? "" : "s"}
          </p>
          <ul className="space-y-2">
            {filtered.map((e) => (
              <EntryCard key={e.id} entry={e} onView={() => setOpen(e)} />
            ))}
          </ul>
        </>
      )}

      {open && <DetailsModal entry={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/* ---------------------------- Entry card --------------------------- */

function EntryCard({ entry, onView }: { entry: AuditEntry; onView: () => void }) {
  const Icon = entry.icon;
  const visible = entry.changes.slice(0, 3);
  const more = entry.changes.length - visible.length;

  return (
    <li className={`rounded-lg border border-border/60 border-l-4 ${TONE_RING[entry.tone]} bg-background p-3`}>
      <div className="flex items-start gap-3">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${TONE_BG[entry.tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight flex items-center gap-2 flex-wrap">
                {entry.title}
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {entry.module}
                </span>
                {entry.status !== "success" && (
                  <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-red-500/15 text-red-600">
                    {entry.status}
                  </span>
                )}
              </div>
              {(entry.clientCode || entry.clientName) && (
                <div className="text-[12px] text-foreground/80 mt-0.5 truncate">
                  {entry.clientCode}
                  {entry.clientName ? ` · ${entry.clientName}` : ""}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                By <span className="text-foreground/80">{entry.who}</span> ·{" "}
                <span className="tabular-nums">{fmtTimestamp(entry.when)}</span>
                {entry.ipAddress ? ` · ${entry.ipAddress}` : ""}
              </div>
            </div>
          </div>

          {visible.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {visible.map((c, i) => (
                <li key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                  <div className="text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground tabular-nums">{c.oldText}</span>
                    <span className="text-muted-foreground">→</span>
                    <span className={`font-semibold tabular-nums ${c.highlight ? "text-red-600" : ""}`}>
                      {c.newText}
                    </span>
                  </div>
                </li>
              ))}
              {more > 0 && (
                <li className="text-[11px] text-muted-foreground pl-1">
                  +{more} more change{more === 1 ? "" : "s"}
                </li>
              )}
            </ul>
          )}

          {entry.changes.length === 0 && entry.extra && entry.extra.length > 0 && (
            <ul className="mt-2.5 grid grid-cols-2 gap-1.5">
              {entry.extra.slice(0, 4).map((x, i) => (
                <li key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.label}</div>
                  <div className="text-sm font-medium truncate">{x.value}</div>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-2">
            <button type="button" onClick={onView} className="text-[12px] text-primary hover:underline">
              View details →
            </button>
          </div>
        </div>
      </div>
    </li>
  );
}

/* --------------------------- Details modal ------------------------- */

function DetailsModal({ entry, onClose }: { entry: AuditEntry; onClose: () => void }) {
  const Icon = entry.icon;
  return (
    <div
      className="fixed inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl rounded-t-2xl sm:rounded-xl border border-border/60 bg-card shadow-xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border/60 sticky top-0 bg-card z-10">
          <div className="flex items-start gap-3">
            <div className={`h-9 w-9 rounded-md flex items-center justify-center ${TONE_BG[entry.tone]}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold flex items-center gap-2 flex-wrap">
                {entry.title}
                <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                  {entry.module}
                </span>
                <span
                  className={`text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded ${
                    entry.status === "success"
                      ? "bg-green-500/15 text-green-700"
                      : "bg-red-500/15 text-red-600"
                  }`}
                >
                  {entry.status}
                </span>
              </div>
              {(entry.clientCode || entry.clientName) && (
                <div className="text-[12px] text-foreground/80 mt-0.5">
                  {entry.clientCode}
                  {entry.clientName ? ` · ${entry.clientName}` : ""}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                By <span className="text-foreground/80">{entry.who}</span> ·{" "}
                <span className="tabular-nums">{fmtTimestamp(entry.when)}</span>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-2 text-[12px]">
            <Field label="Action" value={entry.action} />
            <Field label="Module" value={entry.module} />
            <Field label="IP Address" value={entry.ipAddress || "—"} />
            <Field label="Device" value={entry.userAgent ? shortUA(entry.userAgent) : "—"} />
          </div>

          {entry.changes.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">Changes</div>
              <ul className="space-y-2">
                {entry.changes.map((c, i) => (
                  <li key={i} className="rounded-md bg-muted/40 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{c.label}</div>
                    <div className="text-sm mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground tabular-nums">{c.oldText}</span>
                      <span className="text-muted-foreground">→</span>
                      <span className={`font-semibold tabular-nums ${c.highlight ? "text-red-600" : ""}`}>
                        {c.newText}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.extra && entry.extra.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                {entry.changes.length > 0 ? "Additional Info" : "Details"}
              </div>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {entry.extra.map((x, i) => (
                  <li key={i} className="rounded-md bg-muted/40 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{x.label}</div>
                    <div className="text-sm font-medium break-words">{x.value}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {(entry.oldValues || entry.newValues) && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {entry.oldValues && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    Previous Values
                  </div>
                  <pre className="text-[11px] bg-muted/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.oldValues, null, 2)}
                  </pre>
                </div>
              )}
              {entry.newValues && (
                <div>
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">
                    New Values
                  </div>
                  <pre className="text-[11px] bg-muted/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">
                    {JSON.stringify(entry.newValues, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}

          {entry.details && Object.keys(entry.details).length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-1">Raw Details</div>
              <pre className="text-[11px] bg-muted/40 rounded-md p-2 overflow-x-auto whitespace-pre-wrap break-all">
                {JSON.stringify(entry.details, null, 2)}
              </pre>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-muted/40 px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-[12px] font-medium break-words">{value}</div>
    </div>
  );
}

function shortUA(ua: string): string {
  if (!ua) return "";
  // Try to extract browser + OS in a friendly way; fall back to truncation.
  const browsers = [
    { re: /Edg\/([\d.]+)/, name: "Edge" },
    { re: /Chrome\/([\d.]+)/, name: "Chrome" },
    { re: /Firefox\/([\d.]+)/, name: "Firefox" },
    { re: /Safari\/([\d.]+)/, name: "Safari" },
  ];
  const oses = [
    { re: /Windows NT [\d.]+/, name: "Windows" },
    { re: /Mac OS X [\d._]+/, name: "macOS" },
    { re: /Android [\d.]+/, name: "Android" },
    { re: /iPhone OS [\d_]+|iPad; CPU OS [\d_]+/, name: "iOS" },
    { re: /Linux/, name: "Linux" },
  ];
  let b = "Unknown";
  for (const x of browsers) if (x.re.test(ua)) { b = x.name; break; }
  let o = "Unknown";
  for (const x of oses) if (x.re.test(ua)) { o = x.name; break; }
  return `${b} on ${o}`;
}
