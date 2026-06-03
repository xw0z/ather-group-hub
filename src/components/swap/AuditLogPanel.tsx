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

/* ------------------------------ Types ------------------------------ */

type Tone = "green" | "orange" | "red" | "blue" | "neutral";
type Category = "clients" | "balances" | "margin" | "swap" | "users" | "reports";

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
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: Tone;
  categories: Category[];
  clientCode?: string;
  clientName?: string;
  summary?: string;
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
  position_type: "Position",
  xauusd_price: "Gold Price",
  code: "Client Code",
  notes: "Client Name",
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
      return fmtMoney(Number(v));
    case "xauusd_price":
      return `${fmtMoney(Number(v))} / oz`;
    case "annual_rate":
    case "short_annual_rate":
    case "margin_requirement_pct":
      return `${fmtNum(Number(v))}%`;
    case "position_type":
      return String(v).charAt(0).toUpperCase() + String(v).slice(1);
    default:
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
  categories: Category[];
};

const EVENT_CONFIG: Record<string, EventConfig> = {
  client_created: { title: "Client Created", icon: UserPlus, tone: "green", categories: ["clients"] },
  client_updated: { title: "Client Updated", icon: Pencil, tone: "orange", categories: ["clients"] },
  client_deleted: { title: "Client Deleted", icon: Trash2, tone: "red", categories: ["clients"] },
  user_login: { title: "User Login", icon: LogIn, tone: "green", categories: ["users"] },
  user_logout: { title: "User Logout", icon: LogOut, tone: "neutral", categories: ["users"] },
  user_created: { title: "User Created", icon: UserPlus, tone: "green", categories: ["users"] },
  user_deleted: { title: "User Deleted", icon: Trash2, tone: "red", categories: ["users"] },
  report_generated: { title: "Report Generated", icon: FileText, tone: "green", categories: ["reports"] },
  report_shared: { title: "Report Shared", icon: Share2, tone: "blue", categories: ["reports"] },
  settings_updated: { title: "Settings Updated", icon: SettingsIcon, tone: "orange", categories: ["clients"] },
  fees_computed_manual: { title: "Swap Fees Computed", icon: Calculator, tone: "blue", categories: ["swap"] },
  xau_price_set: { title: "Gold Price Updated", icon: TrendingUp, tone: "blue", categories: ["margin"] },
};

function fallbackConfig(action: string): EventConfig {
  return {
    title: action
      .replace(/_/g, " ")
      .replace(/\b\w/g, (c) => c.toUpperCase()),
    icon: ScrollText,
    tone: "neutral",
    categories: ["clients"],
  };
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

/* ============================ Component ============================ */

const FILTERS: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "clients", label: "Clients" },
  { key: "balances", label: "Balances" },
  { key: "margin", label: "Margin" },
  { key: "swap", label: "Swap" },
  { key: "users", label: "Users" },
  { key: "reports", label: "Reports" },
];

export function AuditLogPanel() {
  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [filter, setFilter] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState<AuditEntry | null>(null);

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

      // Margin history → rich before/after entries
      const marginKeys = new Set<string>();
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
        const cats = new Set<Category>(["clients"]);

        const aUsd = Number(r.old_usd_balance ?? 0);
        const bUsd = Number(r.new_usd_balance ?? 0);
        if (aUsd !== bUsd) {
          ch.push({ label: "USD Balance", oldText: fmtMoney(aUsd), newText: fmtMoney(bUsd) });
          cats.add("balances");
        }
        const aKg = Number(r.old_gold_kg ?? 0);
        const bKg = Number(r.new_gold_kg ?? 0);
        if (aKg !== bKg) {
          ch.push({
            label: "Gold Balance",
            oldText: `${fmtNum(aKg * 1000, 0)} g`,
            newText: `${fmtNum(bKg * 1000, 0)} g`,
          });
          cats.add("balances");
        }
        const aPct = Number(r.old_margin_pct ?? 0);
        const bPct = Number(r.new_margin_pct ?? 0);
        if (aPct !== bPct) {
          ch.push({
            label: "Margin Requirement",
            oldText: `${fmtNum(aPct)}%`,
            newText: `${fmtNum(bPct)}%`,
          });
          cats.add("margin");
        }
        const aXau = Number(r.old_xauusd_price ?? 0);
        const bXau = Number(r.new_xauusd_price ?? 0);
        if (aXau !== bXau && (aXau > 0 || bXau > 0)) {
          ch.push({
            label: "Gold Price",
            oldText: aXau > 0 ? `${fmtMoney(aXau)} / oz` : "—",
            newText: bXau > 0 ? `${fmtMoney(bXau)} / oz` : "—",
          });
          cats.add("margin");
        }
        const aReq = Number(r.old_required_margin ?? 0);
        const bReq = Number(r.new_required_margin ?? 0);
        if (aReq !== bReq && (aReq > 0 || bReq > 0)) {
          ch.push({
            label: "Required Margin",
            oldText: fmtMoney(aReq),
            newText: fmtMoney(bReq),
          });
          cats.add("margin");
        }
        const statusChanged = r.old_status !== r.new_status;
        const critical =
          statusChanged && (r.new_status === "needed" || r.new_status === "critical");
        if (statusChanged) {
          ch.push({
            label: "Margin Status",
            oldText: statusLabel(r.old_status),
            newText: statusLabel(r.new_status),
            highlight: critical,
          });
          cats.add("margin");
        }

        if (ch.length === 0) continue;

        const c = byId.get(r.client_id);
        const title = statusChanged
          ? "Margin Status Changed"
          : ch.length === 1
            ? `${ch[0].label} Changed`
            : "Client Updated";
        const tone: Tone = critical ? "red" : statusChanged ? "orange" : "orange";

        // Track this client_id + timestamp bucket for dedupe vs activity log
        marginKeys.add(`${r.client_id}:${r.created_at.slice(0, 19)}`);

        out.push({
          id: `m:${r.id}`,
          when: r.created_at,
          who: r.username || "system",
          title,
          icon: statusChanged ? ShieldAlert : Pencil,
          tone,
          categories: Array.from(cats),
          clientCode: c?.code,
          clientName: c?.name,
          changes: ch,
        });
      }

      // Activity log → friendly cards, dedupe client_updated already captured in margin
      for (const r of act as Array<{
        id: string;
        action: string;
        username: string;
        created_at: string;
        entity_type: string | null;
        entity_id: string | null;
        details: unknown;
      }>) {
        const cfg = EVENT_CONFIG[r.action] ?? fallbackConfig(r.action);
        const det = (r.details ?? {}) as Record<string, unknown>;

        // Skip duplicate "client_updated" rows already represented by margin diff
        if (r.action === "client_updated" && r.entity_id) {
          const k = `${r.entity_id}:${r.created_at.slice(0, 19)}`;
          if (marginKeys.has(k)) continue;
        }

        const c = r.entity_id ? byId.get(r.entity_id) : undefined;
        const code = (det.code as string | undefined) ?? c?.code;
        const name = c?.name;

        const changes: Change[] = [];
        const extra: { label: string; value: string }[] = [];

        if (r.action === "client_created" || r.action === "client_updated") {
          for (const [k, v] of Object.entries(det)) {
            if (k === "code") continue;
            const label = FIELD_LABELS[k];
            if (!label) continue;
            extra.push({ label, value: fmtField(k, v) });
          }
        } else if (r.action === "settings_updated") {
          for (const [k, v] of Object.entries(det)) {
            const label =
              FIELD_LABELS[k] ??
              k.replace(/_/g, " ").replace(/\b\w/g, (s) => s.toUpperCase());
            extra.push({ label, value: typeof v === "object" ? JSON.stringify(v) : String(v) });
          }
        } else if (r.action === "fees_computed_manual") {
          const date = det.date as string | undefined;
          const count = det.count as number | undefined;
          const total = det.total as number | undefined;
          if (date) extra.push({ label: "Date", value: date });
          if (typeof count === "number") extra.push({ label: "Clients", value: String(count) });
          if (typeof total === "number")
            extra.push({ label: "Total Fees", value: fmtMoney(total) });
        } else if (r.action === "report_generated" || r.action === "report_shared") {
          const t = det.type as string | undefined;
          const fmtType = det.format as string | undefined;
          if (t) extra.push({ label: "Report Type", value: t.replace(/_/g, " ") });
          if (fmtType) extra.push({ label: "Format", value: fmtType.toUpperCase() });
        }

        out.push({
          id: `a:${r.id}`,
          when: r.created_at,
          who: r.username || "system",
          title: cfg.title,
          icon: cfg.icon,
          tone: cfg.tone,
          categories: cfg.categories,
          clientCode: code,
          clientName: name,
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((e) => {
      if (filter !== "all" && !e.categories.includes(filter)) return false;
      if (q) {
        const hay = `${e.clientCode ?? ""} ${e.clientName ?? ""} ${e.who}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [entries, filter, search]);

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ScrollText className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Audit Log</h2>
        </div>
        <Button size="sm" variant="outline" onClick={() => load(true)}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="space-y-2 mb-4">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client code, name, or user…"
          className="h-9"
        />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                filter === f.key
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
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {entries.length === 0 ? "No activity yet." : "No entries match your filters."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map((e) => (
            <EntryCard key={e.id} entry={e} onView={() => setOpen(e)} />
          ))}
        </ul>
      )}

      {open && <DetailsModal entry={open} onClose={() => setOpen(null)} />}
    </section>
  );
}

/* ---------------------------- Entry card --------------------------- */

function EntryCard({ entry, onView }: { entry: AuditEntry; onView: () => void }) {
  const Icon = entry.icon;
  const visible = entry.changes.slice(0, 3);
  const more = entry.changes.length - visible.length;
  const hasDetails = entry.changes.length > 0 || (entry.extra && entry.extra.length > 0);

  return (
    <li
      className={`rounded-lg border border-border/60 border-l-4 ${TONE_RING[entry.tone]} bg-background p-3`}
    >
      <div className="flex items-start gap-3">
        <div className={`h-8 w-8 rounded-md flex items-center justify-center shrink-0 ${TONE_BG[entry.tone]}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 flex-wrap">
            <div className="min-w-0">
              <div className="text-sm font-semibold leading-tight">{entry.title}</div>
              {(entry.clientCode || entry.clientName) && (
                <div className="text-[12px] text-foreground/80 mt-0.5 truncate">
                  {entry.clientCode}
                  {entry.clientName ? ` · ${entry.clientName}` : ""}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                By <span className="text-foreground/80">{entry.who}</span> ·{" "}
                {new Date(entry.when).toLocaleString(undefined, {
                  month: "short",
                  day: "2-digit",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
            </div>
          </div>

          {visible.length > 0 && (
            <ul className="mt-2.5 space-y-1.5">
              {visible.map((c, i) => (
                <li key={i} className="rounded-md bg-muted/40 px-2.5 py-1.5">
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {c.label}
                  </div>
                  <div className="text-sm mt-0.5 flex items-center gap-2 flex-wrap">
                    <span className="text-muted-foreground tabular-nums">{c.oldText}</span>
                    <span className="text-muted-foreground">→</span>
                    <span
                      className={`font-semibold tabular-nums ${c.highlight ? "text-red-600" : ""}`}
                    >
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
                  <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {x.label}
                  </div>
                  <div className="text-sm font-medium truncate">{x.value}</div>
                </li>
              ))}
            </ul>
          )}

          {hasDetails && (
            <div className="mt-2">
              <button
                type="button"
                onClick={onView}
                className="text-[12px] text-primary hover:underline"
              >
                View details →
              </button>
            </div>
          )}
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
        className="w-full sm:max-w-lg rounded-t-2xl sm:rounded-xl border border-border/60 bg-card shadow-xl max-h-[85vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-border/60">
          <div className="flex items-start gap-3">
            <div className={`h-9 w-9 rounded-md flex items-center justify-center ${TONE_BG[entry.tone]}`}>
              <Icon className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">{entry.title}</div>
              {(entry.clientCode || entry.clientName) && (
                <div className="text-[12px] text-foreground/80 mt-0.5">
                  {entry.clientCode}
                  {entry.clientName ? ` · ${entry.clientName}` : ""}
                </div>
              )}
              <div className="text-[11px] text-muted-foreground mt-0.5">
                By <span className="text-foreground/80">{entry.who}</span> ·{" "}
                {new Date(entry.when).toLocaleString()}
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

        <div className="p-4 space-y-3">
          {entry.changes.length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-muted-foreground mb-2">
                Changes
              </div>
              <ul className="space-y-2">
                {entry.changes.map((c, i) => (
                  <li key={i} className="rounded-md bg-muted/40 px-3 py-2">
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {c.label}
                    </div>
                    <div className="text-sm mt-1 flex items-center gap-2 flex-wrap">
                      <span className="text-muted-foreground tabular-nums">{c.oldText}</span>
                      <span className="text-muted-foreground">→</span>
                      <span
                        className={`font-semibold tabular-nums ${c.highlight ? "text-red-600" : ""}`}
                      >
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
                    <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                      {x.label}
                    </div>
                    <div className="text-sm font-medium break-words">{x.value}</div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {entry.changes.length === 0 && (!entry.extra || entry.extra.length === 0) && (
            <p className="text-sm text-muted-foreground">No additional details for this event.</p>
          )}
        </div>
      </div>
    </div>
  );
}
