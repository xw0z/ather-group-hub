import { useEffect, useMemo, useState } from "react";
import html2canvas from "html2canvas-pro";
import jsPDF from "jspdf";
import {
  FileText,
  ShieldCheck,
  DollarSign,
  Layers,
  BarChart3,
  History,
  Download,
  Share2,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  computeMargin,
  getLiveXauPrice,
  listSwapClients,
} from "@/lib/swap-clients.functions";
import {
  getPortfolioReport,
  getSwapFeeReport,
  listReportHistory,
  logReportGeneration,
} from "@/lib/swap-reports.functions";
import { cached, invalidate, CK } from "@/lib/swap-cache";

// ---------------- shared helpers ----------------

const TROY_OZ_PER_KG = 32.1507466;

type Client = Awaited<ReturnType<typeof listSwapClients>>[number];

// HTML-escape any user-controlled string before embedding into report templates.
function esc(s: string | null | undefined): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function money(n: number, d = 2): string {
  return `${n < 0 ? "-" : ""}$${fmt(Math.abs(n), d)}`;
}
function stamp(d = new Date()): string {
  const date = d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = d.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  return `${date} ${time}`;
}
function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}
function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}
function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getUTCDay();
  const diff = (day + 6) % 7; // Monday start
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
}
function startOfMonthISO(): string {
  return todayISO().slice(0, 7) + "-01";
}

// Build a hidden stage element, render to canvas, return blob.
async function renderStageToBlob(html: string, width = 600): Promise<Blob> {
  const stage = document.createElement("div");
  stage.style.position = "fixed";
  stage.style.left = "-10000px";
  stage.style.top = "0";
  stage.style.width = `${width}px`;
  stage.style.padding = "32px";
  stage.style.background = "#1a1a1a";
  stage.style.color = "#f4f1ec";
  stage.style.fontFamily =
    'Epilogue, Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  stage.style.zIndex = "-1";
  stage.innerHTML = html;
  document.body.appendChild(stage);
  try {
    const canvas = await html2canvas(stage, {
      backgroundColor: "#1a1a1a",
      scale: Math.max(3, Math.min(5, (window.devicePixelRatio || 1) * 3)),
      useCORS: true,
      logging: false,
    });
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("Render failed"))),
        "image/png",
      ),
    );
  } finally {
    stage.remove();
  }
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}

async function deliverPng(
  blob: Blob,
  filename: string,
  channel: "download" | "whatsapp",
) {
  const file = new File([blob], filename, { type: "image/png" });
  const nav = navigator as Navigator & {
    canShare?: (d: ShareData) => boolean;
    share?: (d: ShareData) => Promise<void>;
  };
  if (channel === "whatsapp" && nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: filename, text: filename });
      return;
    } catch {
      /* fall through to download */
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function pngBlobToPdfAndDownload(blob: Blob, filename: string) {
  const dataUrl = await blobToDataUrl(blob);
  const img = new Image();
  img.src = dataUrl;
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Image load failed"));
  });
  const pdf = new jsPDF({ unit: "pt", format: "a4", orientation: "portrait" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const margin = 32;
  const maxW = pageW - margin * 2;
  const maxH = pageH - margin * 2;
  const ratio = img.width / img.height;
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  const x = (pageW - w) / 2;
  const y = (pageH - h) / 2;
  pdf.setFillColor(26, 26, 26);
  pdf.rect(0, 0, pageW, pageH, "F");
  pdf.addImage(dataUrl, "PNG", x, y, w, h, undefined, "FAST");
  pdf.save(filename);
}

// ---------------- templates ----------------

function row(label: string, value: string, valueColor?: string): string {
  return `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #2a2a2a">
      <span style="font-size:13px;color:#9a9a9a;letter-spacing:0.02em">${label}</span>
      <span style="font-size:15px;color:${valueColor ?? "#f4f1ec"};font-weight:600;font-variant-numeric:tabular-nums">${value}</span>
    </div>
  `;
}

function brandHeader(subtitle: string): string {
  return `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
      <div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,#e85d3a,#c64a2d);display:flex;align-items:center;justify-content:center;font-weight:800;color:#1a1a1a;font-size:18px;font-family:Urbanist,sans-serif">A</div>
      <div>
        <div style="font-family:Urbanist,sans-serif;font-weight:800;letter-spacing:-0.02em;font-size:18px;line-height:1">ATHER GROUP</div>
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px">${subtitle}</div>
      </div>
    </div>
  `;
}

function brandFooter(): string {
  return `
    <div style="margin-top:22px;padding-top:14px;border-top:1px solid #2a2a2a;text-align:center">
      <div style="font-size:10px;color:#7a7a7a;font-style:italic">Generated using live XAUUSD market price at report time.</div>
      <div style="margin-top:10px;font-family:Urbanist,sans-serif;font-weight:800;letter-spacing:0.04em;font-size:12px;color:#d9d4cc">ATHER GROUP</div>
      <div style="font-size:10px;color:#7a7a7a;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">Confidential Client Report</div>
    </div>
  `;
}

function marginSectionHtml(c: Client, xau: number): string {
  const usd = Number(c.usd_balance);
  const goldKg = Number(c.gold_kg ?? 0);
  const goldGrams = goldKg * 1000;
  const goldValue = goldKg * TROY_OZ_PER_KG * xau;
  const equity = usd + goldValue;
  const reqPct = Number(c.margin_requirement_pct ?? 20);
  const requiredMargin = (goldValue * reqPct) / 100;
  const marginLevelPct = requiredMargin > 0 ? (equity / requiredMargin) * 100 : 0;
  const diff = equity - requiredMargin;

  let tier: "safe" | "warning" | "needed" | "critical";
  if (requiredMargin <= 0) tier = equity < 0 ? "critical" : "safe";
  else if (equity < 0) tier = "critical";
  else if (marginLevelPct >= 120) tier = "safe";
  else if (marginLevelPct >= 100) tier = "warning";
  else tier = "needed";

  const statusLabel =
    tier === "safe"
      ? "✓ Safe"
      : tier === "warning"
        ? "⚠ Warning"
        : tier === "critical"
          ? "✕ Critical Margin"
          : "⚠ Margin Needed";
  const statusColor =
    tier === "safe" ? "#22c55e" : tier === "warning" ? "#f59e0b" : "#ef4444";
  const action =
    tier === "safe"
      ? { label: "Extra Available", value: money(Math.max(0, diff)), color: "#22c55e" }
      : { label: "Amount To Add", value: money(Math.abs(diff)), color: "#ef4444" };

  const positionLabel = c.position_type === "short" ? "Short / Sell" : "Long / Buy";

  return `
    <div style="margin-top:20px;padding:4px 16px;background:#222;border:1px solid #2f2f2f;border-radius:10px">
      ${row("Position", positionLabel)}
      ${row("Live XAUUSD", `${money(xau)} / oz`)}
      ${row("USD Balance", money(usd), usd < 0 ? "#ef4444" : undefined)}
      ${row("Gold Balance", `${fmt(goldGrams, 0)} g`)}
      ${row("Gold Value", money(goldValue))}
      ${row("Equity (USD + Gold)", money(equity), equity < 0 ? "#ef4444" : undefined)}
      ${row("Margin Requirement", `${fmt(reqPct)}%`)}
      ${row("Required Margin", money(requiredMargin))}
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0">
        <span style="font-size:13px;color:#9a9a9a;letter-spacing:0.02em">Margin Level</span>
        <span style="font-size:20px;color:${statusColor};font-weight:700;font-variant-numeric:tabular-nums">${fmt(marginLevelPct)}%</span>
      </div>
    </div>
    <div style="margin-top:16px;padding:14px 16px;background:${statusColor}1f;border:1px solid ${statusColor}55;border-radius:10px;text-align:center">
      <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.12em;text-transform:uppercase">Status</div>
      <div style="font-size:20px;font-weight:800;color:${statusColor};margin-top:4px;letter-spacing:0.01em">${statusLabel}</div>
    </div>
    <div style="margin-top:14px;padding:18px 16px;background:#222;border:1px solid #2f2f2f;border-radius:10px;text-align:center">
      <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.12em;text-transform:uppercase">${action.label}</div>
      <div style="font-size:30px;font-weight:800;color:${action.color};margin-top:6px;font-variant-numeric:tabular-nums;letter-spacing:-0.01em">${action.value}</div>
    </div>
  `;
}

function clientHeaderHtml(c: Client): string {
  return `
    <div style="margin-top:22px;display:flex;justify-content:space-between;gap:16px">
      <div>
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.08em;text-transform:uppercase">Client</div>
        <div style="font-size:22px;font-weight:700;margin-top:2px;letter-spacing:-0.01em">${esc(c.code)}</div>
        ${c.notes ? `<div style="font-size:12px;color:#9a9a9a;margin-top:2px">${esc(c.notes)}</div>` : ""}
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.08em;text-transform:uppercase">Snapshot</div>
        <div style="font-size:13px;color:#d9d4cc;margin-top:4px">${stamp()}</div>
      </div>
    </div>
  `;
}

function buildMarginHtml(c: Client, xau: number): string {
  return `${brandHeader("Margin Report")}${clientHeaderHtml(c)}${marginSectionHtml(c, xau)}${brandFooter()}`;
}

type SwapReport = Awaited<ReturnType<typeof getSwapFeeReport>>;

function swapSectionHtml(report: SwapReport): string {
  const t = report.totals;
  const c = report.client;
  const isShort = c.position_type === "short";
  const rateLabel = isShort
    ? `${fmt(c.short_annual_rate)}% p.a. (benefit)`
    : `${fmt(c.annual_rate)}% p.a. (fee)`;

  const head = `
    <div style="margin-top:20px;padding:4px 16px;background:#222;border:1px solid #2f2f2f;border-radius:10px">
      ${row("Position", isShort ? "Short / Sell" : "Long / Buy")}
      ${row("Swap Rate", rateLabel)}
      ${row("Date Range", `${report.range.from} → ${report.range.to}`)}
      ${row("Opening Balance", money(t.openingBalance))}
      ${row("Closing Balance", money(t.closingBalance))}
      ${row("Total Fees Charged", money(t.totalFeesCharged), "#ef4444")}
      ${row("Total Credits", money(t.totalCredits), "#22c55e")}
      ${row("Wednesday 3× Total", money(t.wednesdayTotal))}
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0">
        <span style="font-size:13px;color:#9a9a9a;letter-spacing:0.02em">Net Swap Result</span>
        <span style="font-size:20px;color:${t.netSwapResult >= 0 ? "#22c55e" : "#ef4444"};font-weight:700;font-variant-numeric:tabular-nums">${money(t.netSwapResult)}</span>
      </div>
    </div>
  `;

  const rowsHtml =
    report.rows.length === 0
      ? `<div style="margin-top:14px;padding:18px;text-align:center;color:#9a9a9a;font-size:13px;background:#222;border:1px solid #2f2f2f;border-radius:10px">No swap fees in this period.</div>`
      : `
    <div style="margin-top:14px;background:#222;border:1px solid #2f2f2f;border-radius:10px;overflow:hidden">
      <div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr 0.6fr;padding:10px 14px;background:#2a2a2a;font-size:11px;color:#9a9a9a;letter-spacing:0.08em;text-transform:uppercase">
        <span>Date</span><span style="text-align:right">XAUUSD</span><span style="text-align:right">Amount</span><span style="text-align:center">3×</span>
      </div>
      ${report.rows
        .map(
          (r) => `
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr 1fr 0.6fr;padding:8px 14px;border-top:1px solid #2a2a2a;font-size:13px">
          <span>${r.fee_date}</span>
          <span style="text-align:right;color:#d9d4cc">${r.xauusd_price ? money(r.xauusd_price) : "—"}</span>
          <span style="text-align:right;color:${r.position_type === "short" ? "#22c55e" : "#ef4444"};font-weight:600;font-variant-numeric:tabular-nums">${r.position_type === "short" ? "+" : "-"}${money(r.daily_fee)}</span>
          <span style="text-align:center;color:${r.is_wednesday ? "#f59e0b" : "#5a5a5a"}">${r.is_wednesday ? "✓" : "·"}</span>
        </div>`,
        )
        .join("")}
    </div>
  `;

  return `${head}${rowsHtml}`;
}

function buildSwapHtml(report: SwapReport): string {
  const c = {
    code: report.client.code,
    notes: report.client.notes,
  } as unknown as Client;
  return `${brandHeader("Swap Fee Report")}${clientHeaderHtml(c)}${swapSectionHtml(report)}${brandFooter()}`;
}

function buildCombinedHtml(c: Client, xau: number, swap: SwapReport): string {
  return `
    ${brandHeader("Client Statement")}
    ${clientHeaderHtml(c)}
    <div style="margin-top:18px;font-size:11px;color:#9a9a9a;letter-spacing:0.14em;text-transform:uppercase">— Margin Section —</div>
    ${marginSectionHtml(c, xau)}
    <div style="margin-top:22px;font-size:11px;color:#9a9a9a;letter-spacing:0.14em;text-transform:uppercase">— Swap Section —</div>
    ${swapSectionHtml(swap)}
    ${brandFooter()}
  `;
}

type Portfolio = Awaited<ReturnType<typeof getPortfolioReport>>;

function buildPortfolioHtml(p: Portfolio): string {
  const t = p.totals;
  return `
    ${brandHeader("Portfolio Report")}
    <div style="margin-top:22px;display:flex;justify-content:space-between;gap:16px">
      <div>
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.08em;text-transform:uppercase">Clients</div>
        <div style="font-size:22px;font-weight:700;margin-top:2px">${p.clientCount}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.08em;text-transform:uppercase">Snapshot</div>
        <div style="font-size:13px;color:#d9d4cc;margin-top:4px">${stamp(new Date(p.asOf))}</div>
      </div>
    </div>
    <div style="margin-top:20px;padding:4px 16px;background:#222;border:1px solid #2f2f2f;border-radius:10px">
      ${row("Total Gold Holdings", `${fmt(t.totalGoldKg * 1000, 0)} g`)}
      ${row("Total Gold Value", money(t.totalGoldValue))}
      ${row("Total USD Balance", money(t.totalUsd))}
      ${row("Total Equity", money(t.totalEquity), t.totalEquity < 0 ? "#ef4444" : undefined)}
      ${row("Total Required Margin", money(t.totalRequired))}
      ${row("Total Margin Shortage", money(t.totalShortage), t.totalShortage > 0 ? "#ef4444" : "#22c55e")}
    </div>
    <div style="margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px">
      <div style="padding:14px;background:#0f2419;border:1px solid #1f4a32;border-radius:10px;text-align:center">
        <div style="font-size:11px;color:#22c55e;letter-spacing:0.12em;text-transform:uppercase">Safe</div>
        <div style="font-size:28px;font-weight:800;color:#22c55e;margin-top:4px">${t.safeCount}</div>
      </div>
      <div style="padding:14px;background:#2a1f08;border:1px solid #5a3f12;border-radius:10px;text-align:center">
        <div style="font-size:11px;color:#f59e0b;letter-spacing:0.12em;text-transform:uppercase">Warning</div>
        <div style="font-size:28px;font-weight:800;color:#f59e0b;margin-top:4px">${t.warningCount}</div>
      </div>
      <div style="padding:14px;background:#2a1212;border:1px solid #5a2424;border-radius:10px;text-align:center">
        <div style="font-size:11px;color:#ef4444;letter-spacing:0.12em;text-transform:uppercase">Margin Needed</div>
        <div style="font-size:28px;font-weight:800;color:#ef4444;margin-top:4px">${t.neededCount}</div>
      </div>
      <div style="padding:14px;background:#1a0808;border:1px solid #4a1818;border-radius:10px;text-align:center">
        <div style="font-size:11px;color:#dc2626;letter-spacing:0.12em;text-transform:uppercase">Critical</div>
        <div style="font-size:28px;font-weight:800;color:#dc2626;margin-top:4px">${t.criticalCount}</div>
      </div>
    </div>
    <div style="margin-top:20px;padding:4px 16px;background:#222;border:1px solid #2f2f2f;border-radius:10px">
      ${row("Swap Fees Today (charged)", money(p.swapToday.charged), "#ef4444")}
      ${row("Swap Credits Today", money(p.swapToday.credited), "#22c55e")}
      ${row("Net Swap Today", money(p.swapToday.net))}
      ${row("Swap Fees MTD (charged)", money(p.swapMonthToDate.charged), "#ef4444")}
      ${row("Swap Credits MTD", money(p.swapMonthToDate.credited), "#22c55e")}
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0">
        <span style="font-size:13px;color:#9a9a9a;letter-spacing:0.02em">Net Swap Month-to-Date</span>
        <span style="font-size:18px;font-weight:700;font-variant-numeric:tabular-nums">${money(p.swapMonthToDate.net)}</span>
      </div>
    </div>
    ${brandFooter()}
  `;
}

// ---------------- main component ----------------

type SubTab = "margin" | "swap" | "combined" | "portfolio" | "history";

const SUBS: { key: SubTab; label: string; icon: typeof FileText }[] = [
  { key: "margin", label: "Margin", icon: ShieldCheck },
  { key: "swap", label: "Swap Fees", icon: DollarSign },
  { key: "combined", label: "Combined", icon: Layers },
  { key: "portfolio", label: "Portfolio", icon: BarChart3 },
  { key: "history", label: "History", icon: History },
];

export function ReportsCenter() {
  const [sub, setSub] = useState<SubTab>("margin");
  const [clients, setClients] = useState<Client[]>([]);
  const [loadingClients, setLoadingClients] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const list = await cached(CK.clients, () => listSwapClients(), 60_000);
        setClients(list as Client[]);
      } finally {
        setLoadingClients(false);
      }
    })();
  }, []);

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Reports center</h2>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Generate client and management reports. All renders use the live XAUUSD price at
          generation time.
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {SUBS.map((s) => {
            const Icon = s.icon;
            const active = sub === s.key;
            return (
              <button
                key={s.key}
                onClick={() => setSub(s.key)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted/40 text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {s.label}
              </button>
            );
          })}
        </div>
      </div>

      {sub === "margin" && (
        <MarginReportPanel clients={clients} loading={loadingClients} />
      )}
      {sub === "swap" && (
        <SwapReportPanel clients={clients} loading={loadingClients} />
      )}
      {sub === "combined" && (
        <CombinedReportPanel clients={clients} loading={loadingClients} />
      )}
      {sub === "portfolio" && <PortfolioReportPanel />}
      {sub === "history" && <HistoryPanel />}
    </div>
  );
}

// ---------------- panels ----------------

function ClientPicker({
  clients,
  loading,
  value,
  onChange,
}: {
  clients: Client[];
  loading: boolean;
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">Client</Label>
      <select
        disabled={loading || clients.length === 0}
        className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">— Select a client —</option>
        {clients.map((c) => (
          <option key={c.id} value={c.id}>
            {c.code}
            {c.notes ? ` (${c.notes})` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function ActionRow({
  busy,
  busyKind,
  onPNG,
  onPDF,
  onShare,
  disabled,
}: {
  busy: boolean;
  busyKind: "png" | "pdf" | "wa" | null;
  onPNG: () => void;
  onPDF: () => void;
  onShare?: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button onClick={onPNG} disabled={busy || disabled} size="sm">
        {busy && busyKind === "png" ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <Download className="h-4 w-4 mr-1" />
        )}
        PNG
      </Button>
      <Button onClick={onPDF} disabled={busy || disabled} size="sm" variant="outline">
        {busy && busyKind === "pdf" ? (
          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
        ) : (
          <FileText className="h-4 w-4 mr-1" />
        )}
        PDF
      </Button>
      {onShare && (
        <Button onClick={onShare} disabled={busy || disabled} size="sm" variant="outline">
          {busy && busyKind === "wa" ? (
            <Loader2 className="h-4 w-4 mr-1 animate-spin" />
          ) : (
            <Share2 className="h-4 w-4 mr-1" />
          )}
          WhatsApp
        </Button>
      )}
    </div>
  );
}

function MarginReportPanel({
  clients,
  loading,
}: {
  clients: Client[];
  loading: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<"png" | "pdf" | "wa" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(format: "PNG" | "PDF", channel: "download" | "whatsapp") {
    const c = clients.find((x) => x.id === clientId);
    if (!c) {
      setError("Pick a client first.");
      return;
    }
    setError(null);
    setBusy(true);
    setBusyKind(format === "PDF" ? "pdf" : channel === "whatsapp" ? "wa" : "png");
    try {
      const live = await getLiveXauPrice();
      const xau =
        live && live.price > 0 ? live.price : Number(c.xauusd_price ?? 0);
      if (!xau) throw new Error("No XAU price available.");
      const blob = await renderStageToBlob(buildMarginHtml(c, xau));
      const base = `margin-${c.code}-${todayISO()}`;
      if (format === "PDF") {
        await pngBlobToPdfAndDownload(blob, `${base}.pdf`);
      } else {
        await deliverPng(blob, `${base}.png`, channel);
      }
      await logReportGeneration({
        data: {
          report_type: "margin",
          client_id: c.id,
          client_code: c.code,
          format,
          channel,
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
      setBusyKind(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Client margin report</h3>
      <ClientPicker
        clients={clients}
        loading={loading}
        value={clientId}
        onChange={setClientId}
      />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ActionRow
        busy={busy}
        busyKind={busyKind}
        disabled={!clientId}
        onPNG={() => generate("PNG", "download")}
        onPDF={() => generate("PDF", "download")}
        onShare={() => generate("PNG", "whatsapp")}
      />
      <p className="text-[11px] text-muted-foreground">
        Renders the same margin card used elsewhere, with live XAUUSD at generation time.
      </p>
    </section>
  );
}

function DateRangeControls({
  from,
  to,
  setFrom,
  setTo,
}: {
  from: string;
  to: string;
  setFrom: (s: string) => void;
  setTo: (s: string) => void;
}) {
  const presets: { label: string; apply: () => void }[] = [
    {
      label: "Today",
      apply: () => {
        const d = todayISO();
        setFrom(d);
        setTo(d);
      },
    },
    {
      label: "This week",
      apply: () => {
        setFrom(startOfWeekISO());
        setTo(todayISO());
      },
    },
    {
      label: "This month",
      apply: () => {
        setFrom(startOfMonthISO());
        setTo(todayISO());
      },
    },
    {
      label: "Last 30 days",
      apply: () => {
        setFrom(isoDaysAgo(29));
        setTo(todayISO());
      },
    },
  ];
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {presets.map((p) => (
          <button
            key={p.label}
            type="button"
            onClick={p.apply}
            className="px-2.5 py-1 rounded-md bg-muted/50 hover:bg-muted text-xs"
          >
            {p.label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">From</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">To</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
      </div>
    </div>
  );
}

function SwapReportPanel({
  clients,
  loading,
}: {
  clients: Client[];
  loading: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<"png" | "pdf" | "wa" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(format: "PNG" | "PDF", channel: "download" | "whatsapp") {
    const c = clients.find((x) => x.id === clientId);
    if (!c) {
      setError("Pick a client first.");
      return;
    }
    if (from > to) {
      setError("'From' must be on or before 'To'.");
      return;
    }
    setError(null);
    setBusy(true);
    setBusyKind(format === "PDF" ? "pdf" : channel === "whatsapp" ? "wa" : "png");
    try {
      const report = await getSwapFeeReport({ data: { clientId: c.id, from, to } });
      const blob = await renderStageToBlob(buildSwapHtml(report), 640);
      const base = `swap-${c.code}-${from}_to_${to}`;
      if (format === "PDF") {
        await pngBlobToPdfAndDownload(blob, `${base}.pdf`);
      } else {
        await deliverPng(blob, `${base}.png`, channel);
      }
      await logReportGeneration({
        data: {
          report_type: "swap_fee",
          client_id: c.id,
          client_code: c.code,
          format,
          channel,
          details: { from, to },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
      setBusyKind(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Client swap fee report</h3>
      <ClientPicker
        clients={clients}
        loading={loading}
        value={clientId}
        onChange={setClientId}
      />
      <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ActionRow
        busy={busy}
        busyKind={busyKind}
        disabled={!clientId}
        onPNG={() => generate("PNG", "download")}
        onPDF={() => generate("PDF", "download")}
        onShare={() => generate("PNG", "whatsapp")}
      />
      <p className="text-[11px] text-muted-foreground">
        Includes opening / closing balance, per-day fees, Wednesday 3× totals, credits and
        net result.
      </p>
    </section>
  );
}

function CombinedReportPanel({
  clients,
  loading,
}: {
  clients: Client[];
  loading: boolean;
}) {
  const [clientId, setClientId] = useState("");
  const [from, setFrom] = useState(startOfMonthISO());
  const [to, setTo] = useState(todayISO());
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<"png" | "pdf" | "wa" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(format: "PNG" | "PDF") {
    const c = clients.find((x) => x.id === clientId);
    if (!c) {
      setError("Pick a client first.");
      return;
    }
    setError(null);
    setBusy(true);
    setBusyKind(format === "PDF" ? "pdf" : "png");
    try {
      const live = await getLiveXauPrice();
      const xau = live && live.price > 0 ? live.price : Number(c.xauusd_price ?? 0);
      if (!xau) throw new Error("No XAU price available.");
      const swap = await getSwapFeeReport({ data: { clientId: c.id, from, to } });
      const blob = await renderStageToBlob(buildCombinedHtml(c, xau, swap), 680);
      const base = `statement-${c.code}-${todayISO()}`;
      if (format === "PDF") {
        await pngBlobToPdfAndDownload(blob, `${base}.pdf`);
      } else {
        await deliverPng(blob, `${base}.png`, "download");
      }
      await logReportGeneration({
        data: {
          report_type: "combined",
          client_id: c.id,
          client_code: c.code,
          format,
          channel: "download",
          details: { from, to },
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
      setBusyKind(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <h3 className="text-sm font-semibold">Combined client statement</h3>
      <ClientPicker
        clients={clients}
        loading={loading}
        value={clientId}
        onChange={setClientId}
      />
      <DateRangeControls from={from} to={to} setFrom={setFrom} setTo={setTo} />
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <ActionRow
        busy={busy}
        busyKind={busyKind}
        disabled={!clientId}
        onPNG={() => generate("PNG")}
        onPDF={() => generate("PDF")}
      />
      <p className="text-[11px] text-muted-foreground">
        Official client statement: margin snapshot + swap fee detail in one document.
      </p>
    </section>
  );
}

function PortfolioReportPanel() {
  const [report, setReport] = useState<Portfolio | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [busyKind, setBusyKind] = useState<"png" | "pdf" | "wa" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    try {
      setReport(await getPortfolioReport());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function generate(format: "PNG" | "PDF") {
    if (!report) return;
    setBusy(true);
    setBusyKind(format === "PDF" ? "pdf" : "png");
    try {
      const blob = await renderStageToBlob(buildPortfolioHtml(report), 680);
      const base = `portfolio-${todayISO()}`;
      if (format === "PDF") {
        await pngBlobToPdfAndDownload(blob, `${base}.pdf`);
      } else {
        await deliverPng(blob, `${base}.png`, "download");
      }
      await logReportGeneration({
        data: {
          report_type: "portfolio",
          format,
          channel: "download",
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setBusy(false);
      setBusyKind(null);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Portfolio report</h3>
        <Button size="sm" variant="ghost" onClick={load} disabled={loading}>
          Refresh
        </Button>
      </div>
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      {loading || !report ? (
        <p className="text-sm text-muted-foreground">Loading portfolio…</p>
      ) : (
        <>
          <PortfolioSummary report={report} />
          <ActionRow
            busy={busy}
            busyKind={busyKind}
            onPNG={() => generate("PNG")}
            onPDF={() => generate("PDF")}
          />
        </>
      )}
    </section>
  );
}

function PortfolioSummary({ report }: { report: Portfolio }) {
  const t = report.totals;
  const cells: { label: string; value: string; tone?: "danger" | "ok" | "warn" }[] = [
    { label: "Clients", value: String(report.clientCount) },
    { label: "Total gold", value: `${fmt(t.totalGoldKg * 1000, 0)} g` },
    { label: "Gold value", value: money(t.totalGoldValue) },
    {
      label: "Equity",
      value: money(t.totalEquity),
      tone: t.totalEquity < 0 ? "danger" : undefined,
    },
    { label: "Required margin", value: money(t.totalRequired) },
    {
      label: "Margin shortage",
      value: money(t.totalShortage),
      tone: t.totalShortage > 0 ? "danger" : "ok",
    },
    { label: "Safe", value: String(t.safeCount), tone: "ok" },
    { label: "Warning", value: String(t.warningCount), tone: "warn" },
    { label: "Margin needed", value: String(t.neededCount), tone: "danger" },
    { label: "Critical", value: String(t.criticalCount), tone: "danger" },
    {
      label: "Net swap today",
      value: money(report.swapToday.net),
      tone: report.swapToday.net >= 0 ? "ok" : "danger",
    },
    {
      label: "Net swap MTD",
      value: money(report.swapMonthToDate.net),
      tone: report.swapMonthToDate.net >= 0 ? "ok" : "danger",
    },
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-sm">
      {cells.map((c) => (
        <div
          key={c.label}
          className={`rounded-md px-3 py-2 ${
            c.tone === "danger"
              ? "bg-red-500/10 text-red-600"
              : c.tone === "warn"
                ? "bg-amber-500/10 text-amber-600"
                : c.tone === "ok"
                  ? "bg-green-500/10 text-green-600"
                  : "bg-muted/40"
          }`}
        >
          <div className="text-[11px] opacity-80">{c.label}</div>
          <div className="font-semibold">{c.value}</div>
        </div>
      ))}
    </div>
  );
}

type HistoryRow = Awaited<ReturnType<typeof listReportHistory>>[number];

function HistoryPanel() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | HistoryRow["report_type"]>("all");

  async function load(force = false) {
    setLoading(true);
    setError(null);
    try {
      if (force) invalidate(CK.reports);
      setRows(await cached(CK.reports, () => listReportHistory(), 30_000));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const filtered = useMemo(
    () => (filter === "all" ? rows : rows.filter((r) => r.report_type === filter)),
    [rows, filter],
  );

  const filters: { key: typeof filter; label: string }[] = [
    { key: "all", label: "All" },
    { key: "margin", label: "Margin" },
    { key: "swap_fee", label: "Swap" },
    { key: "combined", label: "Statement" },
    { key: "portfolio", label: "Portfolio" },
  ];

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Report history</h3>
        <Button size="sm" variant="ghost" onClick={() => load(true)} disabled={loading}>

          Refresh
        </Button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-2.5 py-1 rounded-md text-xs ${
              filter === f.key
                ? "bg-primary text-primary-foreground"
                : "bg-muted/40 text-muted-foreground"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reports yet.</p>
      ) : (
        <ul className="space-y-1.5">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border/60 p-2.5 bg-background flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">
                  {labelForType(r.report_type)}
                  {r.client_code ? ` · ${r.client_code}` : ""}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {new Date(r.created_at).toLocaleString()} · {r.generated_by_username}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted">
                  {r.format}
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-muted capitalize">
                  {r.channel}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function labelForType(t: HistoryRow["report_type"]): string {
  switch (t) {
    case "margin":
      return "Margin report";
    case "swap_fee":
      return "Swap fee report";
    case "combined":
      return "Combined statement";
    case "portfolio":
      return "Portfolio report";
    default:
      return t;
  }
}
