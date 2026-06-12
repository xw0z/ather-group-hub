import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, History, Loader2, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  applySwapBackfill,
  previewSwapBackfill,
} from "@/lib/swap-clients.functions";

type Preview = Awaited<ReturnType<typeof previewSwapBackfill>>;

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${fmt(Math.abs(n))}`;
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function BackfillPanel() {
  const [open, setOpen] = useState(false);
  const [startDate, setStartDate] = useState(isoDaysAgo(14));
  const [endDate, setEndDate] = useState(todayIso());
  const [preview, setPreview] = useState<Preview | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [result, setResult] = useState<
    Awaited<ReturnType<typeof applySwapBackfill>> | null
  >(null);

  async function runPreview() {
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const p = await previewSwapBackfill({
        data: { start_date: startDate, end_date: endDate },
      });
      setPreview(p);
      // Auto-select all by default
      setSelected(new Set(p.items.map((i) => `${i.client_id}|${i.fee_date}`)));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Preview failed");
      setPreview(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && !preview) runPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const grouped = useMemo(() => {
    if (!preview) return [] as { client_code: string; rows: Preview["items"] }[];
    const m = new Map<string, Preview["items"]>();
    for (const it of preview.items) {
      if (!m.has(it.client_code)) m.set(it.client_code, []);
      m.get(it.client_code)!.push(it);
    }
    return [...m.entries()]
      .map(([client_code, rows]) => ({ client_code, rows }))
      .sort((a, b) => a.client_code.localeCompare(b.client_code));
  }, [preview]);

  const selectedTotal = useMemo(() => {
    if (!preview) return 0;
    return preview.items
      .filter((i) => selected.has(`${i.client_id}|${i.fee_date}`))
      .reduce((s, i) => s + i.expected_fee, 0);
  }, [preview, selected]);

  function toggleAll() {
    if (!preview) return;
    if (selected.size === preview.items.length) setSelected(new Set());
    else
      setSelected(
        new Set(preview.items.map((i) => `${i.client_id}|${i.fee_date}`)),
      );
  }

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function apply() {
    if (!preview) return;
    if (!reason.trim()) {
      setError("Reason is required for backfill audit.");
      return;
    }
    const items = preview.items
      .filter((i) => selected.has(`${i.client_id}|${i.fee_date}`))
      .map((i) => ({ client_id: i.client_id, fee_date: i.fee_date }));
    if (items.length === 0) {
      setError("Select at least one row.");
      return;
    }
    setApplying(true);
    setError(null);
    try {
      const r = await applySwapBackfill({
        data: { items, reason: reason.trim() },
      });
      setResult(r);
      setSelected(new Set());
      // Re-run preview to reflect newly-inserted rows
      await runPreview();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backfill failed");
    } finally {
      setApplying(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <History className="h-4 w-4 text-amber-600" />
          <h2 className="text-sm font-semibold">Backfill missing fees</h2>
        </div>
        <Button
          size="sm"
          variant={open ? "outline" : "default"}
          onClick={() => setOpen((o) => !o)}
        >
          {open ? "Hide" : "Open"}
        </Button>
      </div>
      {!open ? (
        <p className="text-xs text-muted-foreground mt-2">
          Admin tool to preview and approve missing daily fee snapshots in a date range.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <Label className="text-xs">Start</Label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="h-8 w-[140px]"
              />
            </div>
            <div>
              <Label className="text-xs">End</Label>
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="h-8 w-[140px]"
              />
            </div>
            <Button size="sm" variant="outline" onClick={runPreview} disabled={loading}>
              {loading ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Play className="h-4 w-4 mr-1" />
              )}
              Preview
            </Button>
          </div>

          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}

          {result ? (
            <div className="rounded-md border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-700 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <div>
                Inserted <strong>{result.inserted}</strong> fee(s) totalling{" "}
                <strong>{money(result.total_amount)}</strong>. Skipped:{" "}
                {result.skipped_existing} existing, {result.skipped_weekend} weekend.
              </div>
            </div>
          ) : null}

          {preview ? (
            <>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                <Stat label="Clients scanned" value={String(preview.summary.clients_scanned)} />
                <Stat label="Days in range" value={String(preview.summary.days_in_range)} />
                <Stat label="Missing snapshots" value={String(preview.summary.missing_count)} />
                <Stat label="Weekend skipped" value={String(preview.summary.weekend_skipped)} />
                <Stat
                  label="Total expected"
                  value={money(preview.summary.total_expected)}
                  highlight
                />
              </div>

              {preview.items.length === 0 ? (
                <div className="rounded-md border border-green-500/40 bg-green-500/10 p-3 text-xs text-green-700 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  No missing snapshots in this range. All fees are up to date.
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between text-xs">
                    <Button size="sm" variant="ghost" onClick={toggleAll}>
                      {selected.size === preview.items.length ? "Deselect all" : "Select all"}
                    </Button>
                    <span className="text-muted-foreground">
                      Selected: <strong>{selected.size}</strong> / {preview.items.length} ·{" "}
                      <strong>{money(selectedTotal)}</strong>
                    </span>
                  </div>

                  <div className="max-h-80 overflow-y-auto rounded-md border border-border/60">
                    <table className="w-full text-xs">
                      <thead className="bg-muted/40 sticky top-0">
                        <tr>
                          <th className="p-2 text-left w-6"></th>
                          <th className="p-2 text-left">Client</th>
                          <th className="p-2 text-left">Date</th>
                          <th className="p-2 text-center">Mult</th>
                          <th className="p-2 text-right">Eff Bal</th>
                          <th className="p-2 text-right">Rate</th>
                          <th className="p-2 text-right">Expected</th>
                        </tr>
                      </thead>
                      <tbody>
                        {grouped.map((g) =>
                          g.rows.map((r) => {
                            const key = `${r.client_id}|${r.fee_date}`;
                            return (
                              <tr key={key} className="border-t border-border/40">
                                <td className="p-2">
                                  <input
                                    type="checkbox"
                                    checked={selected.has(key)}
                                    onChange={() => toggle(key)}
                                  />
                                </td>
                                <td className="p-2 font-medium">{r.client_code}</td>
                                <td className="p-2 font-mono">{r.fee_date}</td>
                                <td className="p-2 text-center">{r.day_multiplier}×</td>
                                <td className="p-2 text-right tabular-nums">
                                  ${fmt(Math.abs(r.effective_balance))}
                                </td>
                                <td className="p-2 text-right tabular-nums">
                                  {fmt(r.annual_rate)}%
                                </td>
                                <td
                                  className={`p-2 text-right font-semibold tabular-nums ${
                                    r.position_type === "short"
                                      ? "text-green-600"
                                      : "text-red-600"
                                  }`}
                                >
                                  {r.position_type === "short" ? "+" : "-"}$
                                  {fmt(r.expected_fee)}
                                </td>
                              </tr>
                            );
                          }),
                        )}
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-2 pt-2 border-t border-border/40">
                    <div>
                      <Label className="text-xs">Reason (audit log)</Label>
                      <Input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="e.g. cron skipped 2026-06-08 due to outage"
                        className="h-8"
                      />
                    </div>
                    <div className="flex justify-end">
                      <Button
                        size="sm"
                        onClick={apply}
                        disabled={applying || selected.size === 0 || !reason.trim()}
                      >
                        {applying ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                        )}
                        Approve &amp; backfill {selected.size} row(s)
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

function Stat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-md border border-border/60 p-2 bg-background ${
        highlight ? "border-amber-500/50 bg-amber-500/10" : ""
      }`}
    >
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-bold tabular-nums">{value}</div>
    </div>
  );
}
