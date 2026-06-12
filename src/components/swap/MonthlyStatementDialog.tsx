import { useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import { Download, FileText, Image as ImageIcon, Loader2, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getSwapClientMonthlyStatement } from "@/lib/swap-clients.functions";
import { generateMonthlyStatementPdf } from "@/lib/swap-pdf.functions";

type Statement = Awaited<ReturnType<typeof getSwapClientMonthlyStatement>>;

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function money(n: number, d = 2): string {
  return `${n < 0 ? "-" : ""}$${fmt(Math.abs(n), d)}`;
}
function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
function currentMonth(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
function monthLabel(m: string): string {
  const [y, mo] = m.split("-").map(Number);
  const d = new Date(Date.UTC(y, mo - 1, 1));
  return d.toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

function buildStatementHtml(s: Statement): string {
  const isShort = s.client.position_type === "short";
  const rate = isShort ? s.client.short_annual_rate : s.client.annual_rate;
  const totalLabel = isShort ? "Total Monthly Benefits" : "Total Monthly Fees";
  const totalColor = isShort ? "#16a34a" : "#dc2626";
  const totalSign = isShort ? "+" : "-";
  const t = s.totals;

  const rowsHtml = s.rows.length
    ? s.rows
        .map((r) => {
          const status = r.is_weekend
            ? '<span style="background:#3a3a3a;color:#bbb;padding:2px 6px;border-radius:4px;font-size:10px">Weekend</span>'
            : r.is_backfilled
              ? '<span style="background:#1e3a8a;color:#bfdbfe;padding:2px 6px;border-radius:4px;font-size:10px">Backfilled</span>'
              : r.is_charged
                ? '<span style="background:#14532d;color:#bbf7d0;padding:2px 6px;border-radius:4px;font-size:10px">Charged</span>'
                : '<span style="background:#7c2d12;color:#fed7aa;padding:2px 6px;border-radius:4px;font-size:10px">Skipped</span>';
          const feeColor =
            r.daily_fee === 0
              ? "#9a9a9a"
              : isShort
                ? "#16a34a"
                : "#dc2626";
          const sign = r.daily_fee === 0 ? "" : isShort ? "+" : "-";
          return `
            <tr style="border-bottom:1px solid #2a2a2a">
              <td style="padding:8px 6px;font-size:12px;color:#f4f1ec;font-variant-numeric:tabular-nums">${r.fee_date}</td>
              <td style="padding:8px 6px;text-align:right;font-size:12px;color:#cfcfcf;font-variant-numeric:tabular-nums">${money(r.usd_balance)}</td>
              <td style="padding:8px 6px;text-align:right;font-size:12px;color:#cfcfcf;font-variant-numeric:tabular-nums">$${fmt(Math.abs(r.effective_balance))}</td>
              <td style="padding:8px 6px;text-align:right;font-size:12px;color:#cfcfcf;font-variant-numeric:tabular-nums">${fmt(r.annual_rate)}%</td>
              <td style="padding:8px 6px;text-align:center;font-size:12px;color:#cfcfcf">${r.day_multiplier}×</td>
              <td style="padding:8px 6px;text-align:right;font-size:12px;font-weight:600;color:${feeColor};font-variant-numeric:tabular-nums">${sign}$${fmt(Math.abs(r.daily_fee))}</td>
              <td style="padding:8px 6px;text-align:center">${status}</td>
            </tr>`;
        })
        .join("")
    : `<tr><td colspan="7" style="padding:24px;text-align:center;color:#9a9a9a;font-size:13px">No snapshots in this period</td></tr>`;

  return `
  <div style="font-family:Epilogue,Inter,system-ui,-apple-system,sans-serif;background:#1a1a1a;color:#f4f1ec;padding:32px;width:780px;box-sizing:border-box">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #c9a86a;padding-bottom:16px;margin-bottom:20px">
      <div>
        <div style="font-size:11px;letter-spacing:0.3em;color:#c9a86a;text-transform:uppercase">ATHER Desk</div>
        <div style="font-size:22px;font-weight:700;margin-top:4px">Monthly Swap Statement</div>
        <div style="font-size:13px;color:#9a9a9a;margin-top:2px">${esc(monthLabel(s.month))}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.15em">Client</div>
        <div style="font-size:18px;font-weight:700;margin-top:2px">${esc(s.client.code)}</div>
        <div style="font-size:11px;color:#9a9a9a">${s.client.position_type === "short" ? "Short / Sell" : "Long / Buy"} · ${fmt(rate)}% p.a.</div>
        ${s.client.notes ? `<div style="font-size:11px;color:#9a9a9a">${esc(s.client.notes)}</div>` : ""}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px">
      <div style="background:#222;padding:12px;border-radius:8px;border:1px solid #2a2a2a">
        <div style="font-size:10px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.1em">Opening Balance</div>
        <div style="font-size:16px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums">${money(s.opening_balance)}</div>
      </div>
      <div style="background:#222;padding:12px;border-radius:8px;border:1px solid #2a2a2a">
        <div style="font-size:10px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.1em">Closing Balance</div>
        <div style="font-size:16px;font-weight:700;margin-top:4px;font-variant-numeric:tabular-nums">${money(s.closing_balance)}</div>
      </div>
      <div style="background:#222;padding:12px;border-radius:8px;border:1px solid #2a2a2a">
        <div style="font-size:10px;color:#9a9a9a;text-transform:uppercase;letter-spacing:0.1em">Days Charged</div>
        <div style="font-size:16px;font-weight:700;margin-top:4px">${t.charged_days}</div>
      </div>
      <div style="background:${totalColor === "#dc2626" ? "#3b1414" : "#0f2c1a"};padding:12px;border-radius:8px;border:1px solid ${totalColor}">
        <div style="font-size:10px;color:#cfcfcf;text-transform:uppercase;letter-spacing:0.1em">${esc(totalLabel)}</div>
        <div style="font-size:18px;font-weight:800;margin-top:4px;color:${totalColor};font-variant-numeric:tabular-nums">${totalSign}$${fmt(Math.abs(t.total_fee))}</div>
      </div>
    </div>

    <div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">
      <span style="background:#222;border:1px solid #2a2a2a;padding:6px 10px;border-radius:6px;font-size:11px;color:#cfcfcf">Weekend days: <strong style="color:#f4f1ec">${t.weekend_days}</strong></span>
      <span style="background:#222;border:1px solid #2a2a2a;padding:6px 10px;border-radius:6px;font-size:11px;color:#cfcfcf">Skipped: <strong style="color:#f4f1ec">${t.skipped_days}</strong></span>
      <span style="background:#222;border:1px solid #2a2a2a;padding:6px 10px;border-radius:6px;font-size:11px;color:#cfcfcf">Backfilled: <strong style="color:#bfdbfe">${t.backfilled_days}</strong></span>
      <span style="background:#222;border:1px solid #2a2a2a;padding:6px 10px;border-radius:6px;font-size:11px;color:#cfcfcf">Manual adjustments: <strong style="color:#f4f1ec">${t.manual_days}</strong></span>
    </div>

    <table style="width:100%;border-collapse:collapse;background:#1f1f1f;border:1px solid #2a2a2a;border-radius:8px;overflow:hidden">
      <thead>
        <tr style="background:#262626">
          <th style="padding:10px 6px;text-align:left;font-size:11px;color:#9a9a9a;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Date</th>
          <th style="padding:10px 6px;text-align:right;font-size:11px;color:#9a9a9a;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">USD Bal</th>
          <th style="padding:10px 6px;text-align:right;font-size:11px;color:#9a9a9a;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Eff Bal</th>
          <th style="padding:10px 6px;text-align:right;font-size:11px;color:#9a9a9a;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Rate</th>
          <th style="padding:10px 6px;text-align:center;font-size:11px;color:#9a9a9a;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Mult</th>
          <th style="padding:10px 6px;text-align:right;font-size:11px;color:#9a9a9a;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Fee</th>
          <th style="padding:10px 6px;text-align:center;font-size:11px;color:#9a9a9a;font-weight:600;text-transform:uppercase;letter-spacing:0.08em">Status</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
    </table>

    <div style="margin-top:18px;padding-top:12px;border-top:1px solid #2a2a2a;display:flex;justify-content:space-between;font-size:10px;color:#7a7a7a">
      <div>Formula: |Effective Balance| × Annual Rate ÷ 365 × Day Multiplier</div>
      <div>Generated ${esc(new Date().toUTCString())}</div>
    </div>
  </div>`;
}

async function renderHtmlToCanvas(html: string): Promise<HTMLCanvasElement> {
  const stage = document.createElement("div");
  stage.style.position = "fixed";
  stage.style.left = "-10000px";
  stage.style.top = "0";
  stage.style.background = "#1a1a1a";
  stage.innerHTML = html;
  document.body.appendChild(stage);
  try {
    return await html2canvas(stage.firstElementChild as HTMLElement, {
      backgroundColor: "#1a1a1a",
      scale: Math.max(2, Math.min(4, (window.devicePixelRatio || 1) * 2)),
      useCORS: true,
      logging: false,
    });
  } finally {
    stage.remove();
  }
}

async function exportPng(s: Statement) {
  const canvas = await renderHtmlToCanvas(buildStatementHtml(s));
  const blob: Blob = await new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG failed"))), "image/png"),
  );
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `swap-statement-${s.client.code}-${s.month}.png`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function exportPdf(s: Statement) {
  const canvas = await renderHtmlToCanvas(buildStatementHtml(s));
  const dataUrl = canvas.toDataURL("image/png");
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 24;
  const maxW = pageW - margin * 2;
  const ratio = canvas.width / canvas.height;
  let w = maxW;
  let h = w / ratio;
  const maxH = pageH - margin * 2;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  const x = (pageW - w) / 2;
  pdf.setFillColor(26, 26, 26);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.addImage(dataUrl, "PNG", x, margin, w, h, undefined, "FAST");
  pdf.save(`swap-statement-${s.client.code}-${s.month}.pdf`);
}

export function MonthlyStatementDialog({
  clientId,
  open,
  onClose,
}: {
  clientId: string;
  open: boolean;
  onClose: () => void;
}) {
  const [month, setMonth] = useState(currentMonth());
  const [data, setData] = useState<Statement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"pdf" | "png" | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getSwapClientMonthlyStatement({ data: { id: clientId, month } })
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, month, open]);

  const months = useMemo(() => {
    const out: string[] = [];
    const d = new Date();
    d.setUTCDate(1);
    for (let i = 0; i < 12; i++) {
      out.push(
        `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`,
      );
      d.setUTCMonth(d.getUTCMonth() - 1);
    }
    return out;
  }, []);

  if (!open) return null;

  const isShort = data?.client.position_type === "short";
  const totalColor = isShort
    ? "text-green-600"
    : data && data.totals.total_fee !== 0
      ? "text-red-600"
      : "text-muted-foreground";
  const totalSign = isShort ? "+" : "-";

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 flex items-start justify-center overflow-y-auto p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl bg-card rounded-xl border border-border my-8 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-border/60">
          <div>
            <h2 className="text-base font-semibold">Monthly Swap Statement</h2>
            <p className="text-xs text-muted-foreground">
              {data ? `${data.client.code} · ${monthLabel(month)}` : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-xs"
            >
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </select>
            <Button size="sm" variant="ghost" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-muted-foreground">
              <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Loading statement…
            </div>
          ) : error ? (
            <p className="text-sm text-destructive py-8 text-center">{error}</p>
          ) : data ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div className="rounded-md border border-border/60 p-3 bg-background">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    Opening Balance
                  </div>
                  <div className="text-base font-bold tabular-nums">
                    {money(data.opening_balance)}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 p-3 bg-background">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    Closing Balance
                  </div>
                  <div className="text-base font-bold tabular-nums">
                    {money(data.closing_balance)}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 p-3 bg-background">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    Days Charged
                  </div>
                  <div className="text-base font-bold">
                    {data.totals.charged_days}
                  </div>
                </div>
                <div className="rounded-md border border-border/60 p-3 bg-background">
                  <div className="text-[10px] uppercase text-muted-foreground tracking-wide">
                    {isShort ? "Total Benefits" : "Total Fees"}
                  </div>
                  <div className={`text-base font-extrabold tabular-nums ${totalColor}`}>
                    {data.totals.total_fee === 0
                      ? "$0.00"
                      : `${totalSign}$${fmt(Math.abs(data.totals.total_fee))}`}
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 text-[11px]">
                <span className="px-2 py-1 rounded bg-muted/40 border border-border/40">
                  Weekend: <strong>{data.totals.weekend_days}</strong>
                </span>
                <span className="px-2 py-1 rounded bg-muted/40 border border-border/40">
                  Skipped: <strong>{data.totals.skipped_days}</strong>
                </span>
                <span className="px-2 py-1 rounded bg-blue-500/10 border border-blue-500/30 text-blue-700">
                  Backfilled: <strong>{data.totals.backfilled_days}</strong>
                </span>
                <span className="px-2 py-1 rounded bg-muted/40 border border-border/40">
                  Manual: <strong>{data.totals.manual_days}</strong>
                </span>
              </div>

              <div className="overflow-x-auto rounded-md border border-border/60">
                <table className="w-full text-xs">
                  <thead className="bg-muted/40">
                    <tr>
                      <th className="text-left p-2 font-semibold">Date</th>
                      <th className="text-right p-2 font-semibold">USD Bal</th>
                      <th className="text-right p-2 font-semibold">Eff Bal</th>
                      <th className="text-right p-2 font-semibold">Rate</th>
                      <th className="text-center p-2 font-semibold">Mult</th>
                      <th className="text-right p-2 font-semibold">Fee</th>
                      <th className="text-center p-2 font-semibold">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 ? (
                      <tr>
                        <td
                          colSpan={7}
                          className="p-4 text-center text-muted-foreground"
                        >
                          No snapshots for this month
                        </td>
                      </tr>
                    ) : (
                      data.rows.map((r) => {
                        const sign = r.daily_fee === 0 ? "" : isShort ? "+" : "-";
                        const feeCls =
                          r.daily_fee === 0
                            ? "text-muted-foreground"
                            : isShort
                              ? "text-green-600"
                              : "text-red-600";
                        const badge = r.is_weekend
                          ? "bg-muted text-muted-foreground"
                          : r.is_backfilled
                            ? "bg-blue-500/15 text-blue-700"
                            : r.is_charged
                              ? "bg-green-500/15 text-green-700"
                              : "bg-orange-500/15 text-orange-700";
                        const label = r.is_weekend
                          ? "Weekend"
                          : r.is_backfilled
                            ? "Backfilled"
                            : r.is_charged
                              ? "Charged"
                              : "Skipped";
                        return (
                          <tr key={r.id} className="border-t border-border/40">
                            <td className="p-2 font-mono">{r.fee_date}</td>
                            <td className="p-2 text-right tabular-nums">
                              {money(r.usd_balance)}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              ${fmt(Math.abs(r.effective_balance))}
                            </td>
                            <td className="p-2 text-right tabular-nums">
                              {fmt(r.annual_rate)}%
                            </td>
                            <td className="p-2 text-center">{r.day_multiplier}×</td>
                            <td className={`p-2 text-right font-semibold tabular-nums ${feeCls}`}>
                              {sign}${fmt(Math.abs(r.daily_fee))}
                            </td>
                            <td className="p-2 text-center">
                              <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${badge}`}>
                                {label}
                              </span>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>

              <div className="flex flex-wrap gap-2 justify-end pt-2 border-t border-border/40">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (!data) return;
                    setBusy("png");
                    try {
                      await exportPng(data);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Export failed");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === "png" ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <ImageIcon className="h-4 w-4 mr-1" />
                  )}
                  PNG
                </Button>
                <Button
                  size="sm"
                  disabled={busy !== null}
                  onClick={async () => {
                    if (!data) return;
                    setBusy("pdf");
                    try {
                      await exportPdf(data);
                    } catch (e) {
                      alert(e instanceof Error ? e.message : "Export failed");
                    } finally {
                      setBusy(null);
                    }
                  }}
                >
                  {busy === "pdf" ? (
                    <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                  ) : (
                    <FileText className="h-4 w-4 mr-1" />
                  )}
                  PDF
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function MonthlyStatementButton({ clientId }: { clientId: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
        <Download className="h-4 w-4 mr-1" /> Monthly Statement
      </Button>
      <MonthlyStatementDialog
        clientId={clientId}
        open={open}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
