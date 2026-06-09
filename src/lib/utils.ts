import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Format an ISO timestamp as "YYYY-MM-DD HH:MM:SS" in the user's local time. */
export function fmtTimestamp(s: string | null | undefined): string {
  if (!s) return "—";
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return String(s);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
  } catch {
    return String(s);
  }
}

/**
 * Format a transaction's full timestamp as "YYYY-MM-DD HH:MM:SS".
 * Uses `transaction_date` (user-chosen business date) for the date portion and
 * the time-of-day from `created_at` so that same-day transactions show the exact
 * order in which they were created.
 */
export function fmtTxTimestamp(
  transactionDate: string | null | undefined,
  createdAt: string | null | undefined,
): string {
  if (!transactionDate && !createdAt) return "—";
  if (!createdAt) return String(transactionDate);
  try {
    const c = new Date(createdAt);
    if (isNaN(c.getTime())) return String(transactionDate ?? createdAt);
    const time = `${pad2(c.getHours())}:${pad2(c.getMinutes())}:${pad2(c.getSeconds())}`;
    const datePart = transactionDate
      ? String(transactionDate).slice(0, 10)
      : `${c.getFullYear()}-${pad2(c.getMonth() + 1)}-${pad2(c.getDate())}`;
    return `${datePart} ${time}`;
  } catch {
    return String(transactionDate ?? createdAt);
  }
}

