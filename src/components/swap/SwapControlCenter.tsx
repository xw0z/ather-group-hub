import { useEffect, useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock,
  DollarSign,
  MessageSquare,
  RefreshCw,
  TrendingUp,
  Users,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSwapControlCenterStats } from "@/lib/swap-clients.functions";

type Stats = Awaited<ReturnType<typeof getSwapControlCenterStats>>;

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

function StatCard(props: {
  label: string;
  value: string;
  hint?: string;
  tone?: "default" | "good" | "warn" | "bad" | "info";
  icon?: React.ReactNode;
}) {
  const toneClass =
    props.tone === "good"
      ? "border-green-500/30 bg-green-500/5"
      : props.tone === "warn"
        ? "border-orange-500/30 bg-orange-500/5"
        : props.tone === "bad"
          ? "border-red-500/30 bg-red-500/5"
          : props.tone === "info"
            ? "border-blue-500/30 bg-blue-500/5"
            : "border-border/60 bg-card";
  return (
    <div className={`rounded-lg border p-3 ${toneClass}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {props.icon}
        {props.label}
      </div>
      <div className="mt-1 text-base font-semibold tabular-nums">{props.value}</div>
      {props.hint ? (
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">
          {props.hint}
        </div>
      ) : null}
    </div>
  );
}

function StatusBadge(props: {
  label: string;
  tone: "good" | "warn" | "bad" | "muted";
}) {
  const cls =
    props.tone === "good"
      ? "bg-green-500/15 text-green-700"
      : props.tone === "warn"
        ? "bg-orange-500/15 text-orange-700"
        : props.tone === "bad"
          ? "bg-red-500/15 text-red-700"
          : "bg-muted text-muted-foreground";
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {props.label}
    </span>
  );
}

export function SwapControlCenter() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const s = await getSwapControlCenterStats();
      setStats(s);
    } catch {
      /* non-fatal — surface generic message via stats=null */
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  if (loading && !stats) {
    return (
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm text-muted-foreground">Loading control center…</p>
      </section>
    );
  }
  if (!stats) {
    return (
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <p className="text-sm text-muted-foreground">Control center unavailable.</p>
      </section>
    );
  }

  const a = stats.automation;
  const automationTone: "good" | "warn" | "bad" | "muted" = a.healthy
    ? "good"
    : a.lastRunAt
      ? "bad"
      : "muted";
  const twilioTone = stats.twilio.configured ? "good" : "warn";
  const missingTone =
    stats.missingDays.length === 0
      ? "good"
      : stats.missingDays.length <= 2
        ? "warn"
        : "bad";

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            Swap Control Center
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Operational overview · {stats.today} UTC
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusBadge
            label={`Automation: ${a.healthy ? "Healthy" : a.lastRunAt ? "Failed" : "No runs"}`}
            tone={automationTone}
          />
          <StatusBadge
            label={`Twilio: ${stats.twilio.configured ? "Ready" : "Not configured"}`}
            tone={twilioTone}
          />
          <Button
            size="sm"
            variant="ghost"
            onClick={load}
            disabled={loading}
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      {/* Money + activity */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
          label="Today's total fees"
          value={`$${fmt(stats.todayTotal)}`}
          hint={stats.biggestTodayClient ? `Top: ${stats.biggestTodayClient.code} ($${fmt(stats.biggestTodayFee)})` : undefined}
          tone="info"
          icon={<DollarSign className="h-3 w-3" />}
        />
        <StatCard
          label="Month-to-date"
          value={`$${fmt(stats.mtdTotal)}`}
          hint={`Since ${stats.monthStart}`}
          tone="info"
          icon={<TrendingUp className="h-3 w-3" />}
        />
        <StatCard
          label="Charged today"
          value={`${stats.chargedTodayCount} / ${stats.totalClients}`}
          hint={`Long ${stats.longCount} · Short ${stats.shortCount}`}
          tone={stats.chargedTodayCount > 0 ? "good" : "muted"}
          icon={<CheckCircle2 className="h-3 w-3" />}
        />
        <StatCard
          label="Skipped / missing today"
          value={`${stats.skippedTodayCount + stats.missingTodayCount}`}
          hint={
            stats.missingTodayCount > 0
              ? `${stats.missingTodayCount} have no snapshot`
              : "All clients accounted for"
          }
          tone={stats.missingTodayCount > 0 ? "warn" : "muted"}
          icon={<Users className="h-3 w-3" />}
        />
      </div>

      {/* Automation + Twilio + backfill */}
      <div className="mt-3 grid grid-cols-2 lg:grid-cols-4 gap-2">
        <StatCard
          label="Last automatic run"
          value={a.lastRunAt ? new Date(a.lastRunAt).toUTCString().slice(5, 22) : "—"}
          hint={a.lastRunStatus ? `Status: ${a.lastRunStatus}` : undefined}
          tone={automationTone === "muted" ? "default" : automationTone}
          icon={<Clock className="h-3 w-3" />}
        />
        <StatCard
          label="Next scheduled run"
          value={new Date(a.nextRunAt).toUTCString().slice(5, 22)}
          hint="Daily 22:00 UTC"
          icon={<Clock className="h-3 w-3" />}
        />
        <StatCard
          label="Backfilled (MTD)"
          value={`${stats.backfilledMtdCount}`}
          hint={stats.backfilledMtdCount > 0 ? "Includes late-written snapshots" : "No backfills this month"}
          tone={stats.backfilledMtdCount > 0 ? "info" : "muted"}
          icon={<RefreshCw className="h-3 w-3" />}
        />
        <StatCard
          label="Twilio / WhatsApp"
          value={stats.twilio.configured ? "Configured" : "Missing keys"}
          hint={stats.twilio.configured ? "Daily message ready" : "TWILIO_API_KEY / FROM"}
          tone={twilioTone}
          icon={<MessageSquare className="h-3 w-3" />}
        />
      </div>

      {/* Missing days warning */}
      <div
        className={`mt-3 rounded-md border p-3 text-[12px] ${
          missingTone === "good"
            ? "border-green-500/30 bg-green-500/5 text-green-700"
            : missingTone === "warn"
              ? "border-orange-500/30 bg-orange-500/5 text-orange-700"
              : "border-red-500/30 bg-red-500/5 text-red-700"
        }`}
      >
        <div className="flex items-center gap-2 font-semibold">
          {missingTone === "good" ? (
            <CheckCircle2 className="h-4 w-4" />
          ) : (
            <AlertTriangle className="h-4 w-4" />
          )}
          Missing snapshot days (last 14 days)
        </div>
        <div className="mt-1">
          {stats.missingDays.length === 0 ? (
            <span>No missing weekdays — automation has covered every expected day.</span>
          ) : (
            <>
              <span>{stats.missingDays.length} day(s) with no snapshot:</span>{" "}
              <span className="font-mono">{stats.missingDays.join(", ")}</span>
              <span className="block mt-0.5 text-[11px] opacity-80">
                Use “Run snapshots now (manual)” to recover, or wait for the backfill workflow (Phase 3).
              </span>
            </>
          )}
        </div>
      </div>

      {/* Failed automation banner */}
      {!a.healthy && a.lastRunAt ? (
        <div className="mt-3 rounded-md border border-red-500/30 bg-red-500/5 p-3 text-[12px] text-red-700 flex items-start gap-2">
          <XCircle className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <div className="font-semibold">Last automatic run failed</div>
            <div className="opacity-80 mt-0.5">
              Check the audit log (module: system, action: daily_fees_cron) and use the manual recovery button below.
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
