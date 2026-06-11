// Shared formatters for Discount/Premium UI, share images, PDFs and statements.
// Centralising these guarantees screen / PNG / PDF / WhatsApp share all show
// identical numbers, dates and notes.

import type { PremiumTx } from "@/lib/swap-premium.functions";

export type DpNoteLabels = {
  premiumApplied: string;
  discountApplied: string;
  gold: string;
  value: string;
  emptyDash: string;
};

const DEFAULT_LABELS: DpNoteLabels = {
  premiumApplied: "Premium Applied",
  discountApplied: "Discount Applied",
  gold: "Gold",
  value: "Value",
  emptyDash: "—",
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** UTC-safe timestamp formatter — does NOT shift by viewer timezone. */
export function fmtDateUTC(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(
    d.getUTCDate(),
  )} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(
    d.getUTCSeconds(),
  )} UTC`;
}

export const fmtG = (n: number) =>
  `${(Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} g`;

export const fmtGNum = (n: number) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export const fmtUSD = (n: number) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `-$${s}` : `$${s}`;
};

/**
 * Single source of truth for the discount/premium note line.
 * `per_oz` is rendered with 2 decimals.
 */
export function formatTxNote(t: PremiumTx, labels: Partial<DpNoteLabels> = {}): string {
  const L = { ...DEFAULT_LABELS, ...labels };
  if (t.kind === "discount" || t.kind === "premium") {
    const isPremium = t.kind === "premium";
    const label = isPremium ? L.premiumApplied : L.discountApplied;
    const sign = isPremium ? "+" : "-";
    const rate = Number(t.per_oz ?? 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const grams = fmtGNum(Number(t.grams));
    const valueAbs = Math.abs(Number(t.amount_usd ?? 0)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const base = `${label} (${sign}${rate} USD/oz) | ${L.gold}: ${grams} g | ${L.value}: $${valueAbs}`;
    return t.notes ? `${base} — ${t.notes}` : base;
  }
  return t.notes || L.emptyDash;
}

/** Recompute company summary from the freshest transaction list. */
export function recomputeCompanySummary(txs: PremiumTx[]) {
  let total = 0;
  let dp_g = 0;
  let dp_usd = 0;
  for (const t of txs) {
    const g = Number(t.grams) || 0;
    const usd = Number(t.amount_usd) || 0;
    if (t.kind === "add") total += g;
    else if (t.kind === "remove") total -= g;
    else if (t.kind === "adjust") total += g;
    else if (t.kind === "discount" || t.kind === "premium") {
      dp_g += g;
      dp_usd += usd;
    }
  }
  return {
    total_balance_grams: total,
    dp_grams: dp_g,
    clean_remaining_grams: total - dp_g,
    dp_charges_usd: dp_usd,
    tx_count: txs.length,
  };
}
