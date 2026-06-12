import { useEffect, useState } from "react";
import { Lock, LockOpen, Loader2, ShieldAlert, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  listSwapFeeLocks,
  lockSwapFeeDate,
  unlockSwapFeeDate,
} from "@/lib/swap-clients.functions";

type LockRow = Awaited<ReturnType<typeof listSwapFeeLocks>>[number];

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return `${d.toLocaleDateString()} ${d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}

export function FeeLockPanel() {
  const [open, setOpen] = useState(false);
  const [locks, setLocks] = useState<LockRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [feeDate, setFeeDate] = useState(todayIso());
  const [reason, setReason] = useState("");

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const r = await listSwapFeeLocks();
      setLocks(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load locks");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (open && locks.length === 0) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function lock() {
    if (!reason.trim() || reason.trim().length < 3) {
      setError("Reason is required (min 3 chars).");
      return;
    }
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await lockSwapFeeDate({ data: { fee_date: feeDate, reason: reason.trim() } });
      setSuccess(`Locked ${feeDate}`);
      setReason("");
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Lock failed");
    } finally {
      setBusy(false);
    }
  }

  async function unlock(date: string) {
    const r = window.prompt(`Unlock ${date}? Enter audit reason (min 3 chars):`);
    if (!r || r.trim().length < 3) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await unlockSwapFeeDate({ data: { fee_date: date, reason: r.trim() } });
      setSuccess(`Unlocked ${date}`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unlock failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Lock className="h-4 w-4 text-rose-600" />
          <h2 className="text-sm font-semibold">Fee Lock System</h2>
        </div>
        <Button size="sm" variant={open ? "outline" : "default"} onClick={() => setOpen((o) => !o)}>
          {open ? "Hide" : "Open"}
        </Button>
      </div>
      {!open ? (
        <p className="text-xs text-muted-foreground mt-2">
          Lock a fee date to block cron, recompute, and backfill writes. Admin-only with audit log.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {error ? (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive flex items-start gap-2">
              <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          ) : null}
          {success ? (
            <div className="rounded-md border border-green-500/40 bg-green-500/10 p-2 text-xs text-green-700 flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{success}</span>
            </div>
          ) : null}

          <div className="flex flex-wrap items-end gap-2 rounded-md border border-border/60 p-2">
            <div>
              <Label className="text-xs">Fee date to lock</Label>
              <Input
                type="date"
                value={feeDate}
                onChange={(e) => setFeeDate(e.target.value)}
                className="h-8 w-[140px]"
              />
            </div>
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">Reason (audit log)</Label>
              <Input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="e.g. month-end close — figures verified"
                className="h-8"
              />
            </div>
            <Button size="sm" onClick={lock} disabled={busy || !reason.trim()}>
              {busy ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Lock className="h-4 w-4 mr-1" />
              )}
              Lock date
            </Button>
          </div>

          <div className="rounded-md border border-border/60">
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/40 bg-muted/30">
              <span className="text-xs font-semibold">Locked dates</span>
              <span className="text-[10px] text-muted-foreground">
                {loading ? "Loading…" : `${locks.length} active`}
              </span>
            </div>
            {locks.length === 0 && !loading ? (
              <div className="p-3 text-xs text-muted-foreground">No locked dates.</div>
            ) : (
              <div className="max-h-72 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 sticky top-0">
                    <tr>
                      <th className="p-2 text-left">Fee date</th>
                      <th className="p-2 text-left">Locked by</th>
                      <th className="p-2 text-left">When</th>
                      <th className="p-2 text-left">Reason</th>
                      <th className="p-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {locks.map((l) => (
                      <tr key={l.fee_date} className="border-t border-border/40">
                        <td className="p-2 font-mono">{l.fee_date}</td>
                        <td className="p-2">{l.locked_by_email ?? "—"}</td>
                        <td className="p-2">{fmtDate(l.locked_at)}</td>
                        <td className="p-2 max-w-[280px] truncate" title={l.reason ?? ""}>
                          {l.reason}
                        </td>
                        <td className="p-2 text-right">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => unlock(l.fee_date)}
                            disabled={busy}
                          >
                            <LockOpen className="h-3.5 w-3.5 mr-1" />
                            Unlock
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
