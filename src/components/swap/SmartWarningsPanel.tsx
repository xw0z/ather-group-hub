import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Info,
  RefreshCw,
  ShieldAlert,
  Filter,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  getSwapSmartWarnings,
  type SwapWarning,
  type SwapWarningSeverity,
} from "@/lib/swap-clients.functions";

const SEVERITY_META: Record<
  SwapWarningSeverity,
  { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }
> = {
  critical: {
    label: "Critical",
    cls: "border-red-500/40 bg-red-500/5 text-red-700",
    icon: ShieldAlert,
  },
  warning: {
    label: "Warning",
    cls: "border-orange-500/40 bg-orange-500/5 text-orange-700",
    icon: AlertTriangle,
  },
  info: {
    label: "Info",
    cls: "border-blue-500/40 bg-blue-500/5 text-blue-700",
    icon: Info,
  },
};

export function SmartWarningsPanel() {
  const [warnings, setWarnings] = useState<SwapWarning[]>([]);
  const [generatedAt, setGeneratedAt] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | SwapWarningSeverity>("all");

  async function load() {
    setLoading(true);
    try {
      const r = await getSwapSmartWarnings();
      setWarnings(r.warnings);
      setGeneratedAt(r.generatedAt);
    } catch {
      setWarnings([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    const id = setInterval(load, 5 * 60_000);
    return () => clearInterval(id);
  }, []);

  const counts = useMemo(() => {
    const c = { critical: 0, warning: 0, info: 0 };
    for (const w of warnings) c[w.severity] += 1;
    return c;
  }, [warnings]);

  const filtered = filter === "all" ? warnings : warnings.filter((w) => w.severity === filter);

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between mb-3">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            Smart Warnings
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Live anomaly detection ·{" "}
            {generatedAt ? new Date(generatedAt).toLocaleTimeString() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-500/15 text-red-700">
            {counts.critical} crit
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-700">
            {counts.warning} warn
          </span>
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 text-blue-700">
            {counts.info} info
          </span>
          <Button size="sm" variant="ghost" onClick={load} disabled={loading} aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </header>

      <div className="flex items-center gap-1 mb-3 text-[11px]">
        <Filter className="h-3 w-3 text-muted-foreground" />
        {(["all", "critical", "warning", "info"] as const).map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => setFilter(k)}
            className={`px-2 py-0.5 rounded-full border transition ${
              filter === k
                ? "border-primary bg-primary/10 text-primary"
                : "border-border/60 text-muted-foreground hover:text-foreground"
            }`}
          >
            {k === "all" ? `All (${warnings.length})` : k}
          </button>
        ))}
      </div>

      {loading && warnings.length === 0 ? (
        <p className="text-sm text-muted-foreground">Scanning…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-green-500/30 bg-green-500/5 text-green-700 p-3 text-[12px] flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4" />
          {warnings.length === 0
            ? "All systems nominal — no anomalies detected."
            : "No items match this filter."}
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((w) => {
            const meta = SEVERITY_META[w.severity];
            const Icon = meta.icon;
            return (
              <li key={w.id} className={`rounded-md border p-3 ${meta.cls}`}>
                <div className="flex items-start gap-2">
                  <Icon className="h-4 w-4 mt-0.5 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-[13px]">{w.title}</span>
                      <span className="text-[10px] uppercase tracking-wide opacity-70">
                        {w.category}
                      </span>
                    </div>
                    <div className="text-[12px] opacity-90 mt-0.5">{w.detail}</div>
                    {w.suggestedAction ? (
                      <div className="text-[11px] opacity-75 mt-1 italic">
                        → {w.suggestedAction}
                      </div>
                    ) : null}
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
