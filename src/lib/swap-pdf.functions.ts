// Server-side PDF generation for Swap Fees module.
// Produces professional, letterhead-branded PDFs (Monthly Client Statement)
// with QR code (for fingerprint / verification) and page numbering.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSwapUser } from "@/lib/swap-clients.functions";
import { recordAudit } from "@/lib/swap-audit.server";

const monthRule = z.string().regex(/^\d{4}-\d{2}$/, "YYYY-MM");

// ATHER brand palette
const COLOR_BG = rgb(0.102, 0.102, 0.102); // #1a1a1a
const COLOR_GOLD = rgb(0.831, 0.686, 0.337); // #d4af56
const COLOR_TEXT = rgb(0.95, 0.94, 0.92);
const COLOR_MUTED = rgb(0.65, 0.63, 0.6);
const COLOR_LINE = rgb(0.25, 0.24, 0.23);
const COLOR_RED = rgb(0.85, 0.30, 0.30);
const COLOR_GREEN = rgb(0.42, 0.75, 0.42);

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 40;

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function money(n: number): string {
  return `${n < 0 ? "-" : ""}$${fmt(Math.abs(n), 2)}`;
}
function monthLabel(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

async function buildPdf(args: {
  client: { code: string; notes: string | null };
  month: string;
  opening: number;
  closing: number;
  totals: {
    total_fee: number;
    charged_days: number;
    skipped_days: number;
    weekend_days: number;
    backfilled_days: number;
  };
  rows: Array<{
    fee_date: string;
    usd_balance: number;
    effective_balance: number;
    annual_rate: number;
    day_multiplier: number;
    daily_fee: number;
    position_type: "long" | "short";
    is_backfilled: boolean;
    is_weekend: boolean;
    is_charged: boolean;
  }>;
  generatedBy: string;
  fingerprint: string;
  verifyUrl: string;
}): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`ATHER — Monthly Swap Statement — ${args.client.code} — ${args.month}`);
  pdf.setAuthor("ATHER Group");
  pdf.setProducer("ATHER Swap Back-Office");
  pdf.setCreator("ATHER Swap Back-Office");

  const fontReg = await pdf.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdf.embedFont(StandardFonts.HelveticaBold);

  const qrPngBytes = await QRCode.toBuffer(args.verifyUrl, {
    margin: 0,
    width: 220,
    color: { dark: "#1a1a1a", light: "#ffffff" },
  });
  const qrImg = await pdf.embedPng(qrPngBytes);

  const pages: import("pdf-lib").PDFPage[] = [];
  const addPage = () => {
    const p = pdf.addPage([PAGE_W, PAGE_H]);
    p.drawRectangle({ x: 0, y: 0, width: PAGE_W, height: PAGE_H, color: COLOR_BG });
    // Header band
    p.drawRectangle({ x: 0, y: PAGE_H - 70, width: PAGE_W, height: 6, color: COLOR_GOLD });
    p.drawText("ATHER", {
      x: MARGIN, y: PAGE_H - 50, size: 22, font: fontBold, color: COLOR_GOLD,
    });
    p.drawText("SWAP BACK-OFFICE  ·  MONTHLY CLIENT STATEMENT", {
      x: MARGIN + 90, y: PAGE_H - 44, size: 9, font: fontReg, color: COLOR_MUTED,
    });
    pages.push(p);
    return p;
  };

  let page = addPage();
  let y = PAGE_H - 100;

  // Title block
  page.drawText(`Statement — ${monthLabel(args.month)}`, {
    x: MARGIN, y, size: 16, font: fontBold, color: COLOR_TEXT,
  });
  y -= 18;
  page.drawText(`Client: ${args.client.code}${args.client.notes ? "  ·  " + args.client.notes : ""}`, {
    x: MARGIN, y, size: 10, font: fontReg, color: COLOR_MUTED,
  });
  y -= 24;

  // Summary cards
  const cards: Array<[string, string, import("pdf-lib").RGB]> = [
    ["Opening balance", money(args.opening), COLOR_TEXT],
    ["Closing balance", money(args.closing), COLOR_TEXT],
    ["Total fees", money(args.totals.total_fee),
      args.totals.total_fee < 0 ? COLOR_RED : args.totals.total_fee > 0 ? COLOR_GREEN : COLOR_TEXT],
    ["Charged days", String(args.totals.charged_days), COLOR_TEXT],
  ];
  const cardW = (PAGE_W - MARGIN * 2 - 12) / 4;
  cards.forEach(([lbl, val, col], i) => {
    const x = MARGIN + i * (cardW + 4);
    page.drawRectangle({
      x, y: y - 52, width: cardW, height: 52,
      color: rgb(0.14, 0.14, 0.14),
      borderColor: COLOR_LINE, borderWidth: 0.5,
    });
    page.drawText(lbl, { x: x + 8, y: y - 16, size: 8, font: fontReg, color: COLOR_MUTED });
    page.drawText(val, { x: x + 8, y: y - 38, size: 13, font: fontBold, color: col });
  });
  y -= 70;

  // Sub-totals strip
  page.drawText(
    `Skipped: ${args.totals.skipped_days}    Weekend: ${args.totals.weekend_days}    Backfilled: ${args.totals.backfilled_days}`,
    { x: MARGIN, y, size: 9, font: fontReg, color: COLOR_MUTED },
  );
  y -= 18;

  // Table header
  const cols = [
    { key: "date", label: "Date", w: 70, align: "left" as const },
    { key: "bal", label: "USD Balance", w: 90, align: "right" as const },
    { key: "eff", label: "Effective", w: 90, align: "right" as const },
    { key: "rate", label: "Rate", w: 50, align: "right" as const },
    { key: "mult", label: "Mult", w: 36, align: "right" as const },
    { key: "fee", label: "Fee", w: 90, align: "right" as const },
    { key: "tag", label: "Status", w: 70, align: "left" as const },
  ];
  const tableX = MARGIN;
  const tableW = cols.reduce((s, c) => s + c.w, 0);

  const drawHeader = (p: import("pdf-lib").PDFPage, yy: number) => {
    p.drawRectangle({ x: tableX, y: yy - 16, width: tableW, height: 18, color: rgb(0.18, 0.18, 0.18) });
    let cx = tableX + 6;
    for (const c of cols) {
      const tx = c.align === "right" ? cx + c.w - 12 - fontBold.widthOfTextAtSize(c.label, 8) : cx;
      p.drawText(c.label, { x: tx, y: yy - 11, size: 8, font: fontBold, color: COLOR_GOLD });
      cx += c.w;
    }
  };
  drawHeader(page, y);
  y -= 22;

  const drawRow = (p: import("pdf-lib").PDFPage, yy: number, r: typeof args.rows[number]) => {
    const tag = r.is_weekend ? "Weekend"
      : r.is_backfilled ? "Backfilled"
      : r.is_charged ? "Charged" : "Skipped";
    const feeCol = r.daily_fee < 0 ? COLOR_RED : r.daily_fee > 0 ? COLOR_GREEN : COLOR_MUTED;
    const vals: Array<{ text: string; col?: import("pdf-lib").RGB }> = [
      { text: r.fee_date },
      { text: money(r.usd_balance) },
      { text: money(r.effective_balance) },
      { text: `${fmt(r.annual_rate, 2)}%` },
      { text: `${r.day_multiplier}x` },
      { text: money(r.daily_fee), col: feeCol },
      { text: tag, col: r.is_weekend ? COLOR_MUTED : r.is_backfilled ? COLOR_GOLD : feeCol },
    ];
    let cx = tableX + 6;
    cols.forEach((c, i) => {
      const v = vals[i];
      const f = fontReg;
      const tx = c.align === "right"
        ? cx + c.w - 12 - f.widthOfTextAtSize(v.text, 8)
        : cx;
      p.drawText(v.text, { x: tx, y: yy, size: 8, font: f, color: v.col ?? COLOR_TEXT });
      cx += c.w;
    });
    p.drawLine({
      start: { x: tableX, y: yy - 4 }, end: { x: tableX + tableW, y: yy - 4 },
      thickness: 0.3, color: COLOR_LINE,
    });
  };

  for (const r of args.rows) {
    if (y < MARGIN + 60) {
      page = addPage();
      y = PAGE_H - 100;
      drawHeader(page, y);
      y -= 22;
    }
    drawRow(page, y, r);
    y -= 14;
  }

  // QR + verify block on first page (bottom-right)
  const qrSize = 70;
  const qrX = PAGE_W - MARGIN - qrSize;
  const qrY = MARGIN + 20;
  pages[0].drawImage(qrImg, { x: qrX, y: qrY, width: qrSize, height: qrSize });
  pages[0].drawText("Scan to verify", {
    x: qrX - 4, y: qrY - 10, size: 7, font: fontReg, color: COLOR_MUTED,
  });

  // Footer (page numbers, fingerprint, generated by) on every page
  const total = pages.length;
  const generatedAt = new Date().toISOString();
  pages.forEach((p, idx) => {
    p.drawLine({
      start: { x: MARGIN, y: MARGIN + 12 }, end: { x: PAGE_W - MARGIN, y: MARGIN + 12 },
      thickness: 0.4, color: COLOR_LINE,
    });
    p.drawText(`ATHER Group · Confidential · Generated ${generatedAt} by ${args.generatedBy}`, {
      x: MARGIN, y: MARGIN, size: 7, font: fontReg, color: COLOR_MUTED,
    });
    p.drawText(`Doc ID ${args.fingerprint}`, {
      x: MARGIN, y: MARGIN - 9, size: 6.5, font: fontReg, color: COLOR_MUTED,
    });
    const pn = `Page ${idx + 1} of ${total}`;
    const pnW = fontReg.widthOfTextAtSize(pn, 8);
    p.drawText(pn, { x: PAGE_W - MARGIN - pnW, y: MARGIN, size: 8, font: fontReg, color: COLOR_MUTED });
  });

  return pdf.save();
}

async function fingerprint(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return Array.from(new Uint8Array(hash))
    .slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();
}

/** Server-rendered Monthly Client Statement PDF (returns base64). */
export const generateMonthlyStatementPdf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ clientId: z.string().uuid(), month: monthRule }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);

    const [year, mon] = data.month.split("-").map(Number);
    const monthStart = `${data.month}-01`;
    const monthEnd = new Date(Date.UTC(year, mon, 1)).toISOString().slice(0, 10);

    const { data: client, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select("id, code, notes")
      .eq("id", data.clientId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: monthRows, error: mErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select(
        "fee_date, xauusd_price, daily_fee, usd_balance, annual_rate, position_type, additional_exposure_pct, effective_balance, day_multiplier, created_at",
      )
      .eq("client_id", data.clientId)
      .gte("fee_date", monthStart)
      .lt("fee_date", monthEnd)
      .order("fee_date", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    const { data: priorRow } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("usd_balance")
      .eq("client_id", data.clientId)
      .lt("fee_date", monthStart)
      .order("fee_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const firstInMonth = monthRows?.[0];
    const lastInMonth = monthRows?.[monthRows.length - 1];
    const opening = priorRow
      ? Number(priorRow.usd_balance)
      : firstInMonth ? Number(firstInMonth.usd_balance) : 0;
    const closing = lastInMonth ? Number(lastInMonth.usd_balance) : opening;

    let total_fee = 0, charged_days = 0, skipped_days = 0, weekend_days = 0, backfilled_days = 0;
    const rows = (monthRows ?? []).map((f) => {
      const fee = Number(f.daily_fee);
      const mult = Number(f.day_multiplier ?? 1);
      const created = new Date(f.created_at);
      const feeDay = new Date(`${f.fee_date}T00:00:00Z`);
      const isBackfilled = (created.getTime() - feeDay.getTime()) / 86400_000 > 1.5;
      const isWeekend = mult === 0;
      const isCharged = fee !== 0;
      total_fee += fee;
      if (isWeekend) weekend_days++;
      else if (isBackfilled) backfilled_days++;
      if (isCharged) charged_days++;
      else if (!isWeekend) skipped_days++;
      return {
        fee_date: f.fee_date,
        usd_balance: Number(f.usd_balance),
        effective_balance: f.effective_balance != null
          ? Number(f.effective_balance)
          : Number(f.usd_balance) * (1 + Number(f.additional_exposure_pct ?? 5) / 100),
        annual_rate: Number(f.annual_rate),
        day_multiplier: mult,
        daily_fee: fee,
        position_type: (f.position_type ?? "long") as "long" | "short",
        is_backfilled: isBackfilled,
        is_weekend: isWeekend,
        is_charged: isCharged,
      };
    });

    const { data: prof } = await supabaseAdmin
      .from("swap_profiles")
      .select("username")
      .eq("id", context.userId)
      .maybeSingle();
    const generatedBy = prof?.username ?? "unknown";

    const fp = await fingerprint(
      `${client.id}|${data.month}|${total_fee}|${rows.length}|${new Date().toISOString()}`,
    );
    const origin = process.env.PUBLIC_APP_URL ?? "https://ather.group";
    const verifyUrl = `${origin}/swap/verify?doc=${fp}`;

    const bytes = await buildPdf({
      client: { code: client.code, notes: client.notes ?? null },
      month: data.month,
      opening, closing,
      totals: { total_fee, charged_days, skipped_days, weekend_days, backfilled_days },
      rows,
      generatedBy,
      fingerprint: fp,
      verifyUrl,
    });

    await recordAudit({
      userId: context.userId,
      username: generatedBy,
      module: "reports",
      action: "pdf_server_rendered",
      entity_type: "monthly_statement",
      entity_id: client.id,
      details: {
        client_code: client.code,
        month: data.month,
        fingerprint: fp,
        rows: rows.length,
      },
    });

    // pdf-lib returns Uint8Array; encode as base64 for JSON transport
    let bin = "";
    for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    const base64 = btoa(bin);
    return {
      base64,
      filename: `ATHER-Swap-Statement-${client.code}-${data.month}.pdf`,
      fingerprint: fp,
    };
  });
