import { useEffect, useMemo, useState } from "react";
import {
  ScrollText,
  RefreshCw,
  Calculator,
  Lock,
  Unlock,
  History,
  Clock,
  CheckCircle2,
  XCircle,
  Filter,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { listSwapFeeAuditEvents } from "@/lib/swap-clients.functions";
import { fmtTimestamp } from "@/lib/utils";

type Row = {
  id: string;
  username: string | null;
  action: string;
  module: string | null;
  status: "success" | "failure" | "denied" | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
};

type Filter = "all" | "cron" | "manual" | "backfill" | "lock";

const ACTION_META: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; tone: string; group: Filter }
> = {
  daily_fees_cron: { label: "Automatic run", icon: Clock, tone: "bg-blue-500/10 text-blue-600", group: "cron" },
  fees_computed_manual: { label: "Manual compute", icon: Calculator, tone: "bg-purple-500/10 text-purple-600", group: "manual" },
  fees_backfilled: { label: "Backfill applied", icon: History, tone: "bg-amber-500/10 text-amber-600", group: "backfill" },
  fee_date_locked: { label: "Fee date locked", icon: Lock, tone: "bg-rose-500/10 text-rose-600", group: "lock" },
  fee_date_unlocked: { label: "Fee date unlocked", icon: Unlock, tone: "bg-emerald-500/10 text-emerald-600", group: "lock" },
};

function money(n: number) {
  const v = Number(n);
  const sign = v < 0 ? "-" : "";
  return `${sign}$${Math.abs(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function describe(r: Row): { primary: string; meta: { label: string; value: string }[] } {
  const d = (r.details ?? {}) as Record<string, unknown>;
  const meta: { label: string; value: string }[] = [];
  let primary = ACTION_META[r.action]?.label ?? r.action;

  const pushIf = (label: string, key: string, fmt?: (v: unknown) => string) => {
    if (d[key] !== undefined && d[key] !== null && d[key] !== "") {
      meta.push({ label, value: fmt ? fmt(d[key]) : String(d[key]) });
    }
  };

  switch (r.action) {
    case "daily_fees_cron":
      pushIf("Started", "started_at", (v) => fmtTimestamp(String(v)));
      pushIf("Inserted", "inserted");
      pushIf("Skipped", "skipped");
      if (d.error) meta.push({ label: "Error", value: String(d.error) });
      break;
    case "fees_computed_manual":
      pushIf("Date", "date");
      pushIf("Clients", "count");
      if (typeof d.total === "number") meta.push({ label: "Total fees", value: money(d.total) });
      break;
    case "fees_backfilled":
      pushIf("Range", "start_date", (v) => `${v} → ${d.end_date ?? "—"}`);
      pushIf("Inserted", "inserted");
      pushIf("Skipped (existing)", "skipped_existing");
      pushIf("Skipped (locked)", "skipped_locked");
      pushIf("Reason", "reason");
      break;
    case "fee_date_locked":
    case "fee_date_unlocked":
      pushIf("Fee date", "fee_date");
      pushIf("Reason", "reason");
      break;
  }
  return { primary, meta };
}

const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "cron", label: "Cron" },
  { key: "manual", label: "Manual" },
  { key: "backfill", label: "Backfill" },
  { key: "lock", label: "Locks" },
];

export function FeeAuditPanel() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  async function load() {
    setLoading(true);
    try {
      const data = (await listSwapFeeAuditEvents()) as Row[];
      setRows(data);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    return rows.filter((r) => ACTION_META[r.action]?.group === filter);
  }, [rows, filter]);

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div>
          <CardTitle className="flex items-center gap-2 text-base">
            <ScrollText className="h-4 w-4" />
            Swap Fee Audit Trail
          </CardTitle>
          <p className="text-xs text-muted-foreground mt-1">
            Every automated run, manual compute, backfill and lock action — append-only and timestamped.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={loading}>
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Filter className="h-3.5 w-3.5 text-muted-foreground mr-1" />
          {FILTERS.map((f) => (
            <Button
              key={f.key}
              variant={filter === f.key ? "default" : "outline"}
              size="sm"
              className="h-7 px-2.5 text-xs"
              onClick={() => setFilter(f.key)}
            >
              {f.label}
            </Button>
          ))}
        </div>

        {loading && rows.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">Loading audit events…</div>
        ) : filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">No events for this filter.</div>
        ) : (
          <ol className="space-y-2">
            {filtered.map((r) => {
              const meta = ACTION_META[r.action] ?? {
                label: r.action,
                icon: ScrollText,
                tone: "bg-muted text-foreground",
                group: "all" as Filter,
              };
              const Icon = meta.icon;
              const { primary, meta: details } = describe(r);
              const isFail = r.status === "failure" || r.status === "denied";
              return (
                <li
                  key={r.id}
                  className={`rounded-md border bg-card p-3 border-l-4 ${
                    isFail ? "border-l-red-500" : "border-l-primary/40"
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className={`mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-md ${meta.tone}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-sm font-semibold">{primary}</span>
                          <Badge variant={isFail ? "destructive" : "secondary"} className="h-5 px-1.5 text-[10px]">
                            {isFail ? (
                              <>
                                <XCircle className="h-3 w-3 mr-1" />
                                {r.status}
                              </>
                            ) : (
                              <>
                                <CheckCircle2 className="h-3 w-3 mr-1" />
                                success
                              </>
                            )}
                          </Badge>
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {r.username ?? "system"} · {fmtTimestamp(r.created_at)}
                          {r.ip_address ? ` · ${r.ip_address}` : ""}
                        </div>
                        {details.length > 0 && (
                          <dl className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs">
                            {details.map((m, i) => (
                              <div key={i} className="min-w-0">
                                <dt className="text-muted-foreground">{m.label}</dt>
                                <dd className="font-medium truncate" title={m.value}>
                                  {m.value}
                                </dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
