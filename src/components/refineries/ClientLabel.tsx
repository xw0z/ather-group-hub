import type { ReactNode } from "react";

/**
 * Canonical client display: `CODE (Name)`.
 * Code is bold/mono, name is normal weight.
 * Falls back gracefully when code or name is missing.
 */
export function ClientLabel({
  code,
  name,
  className,
  codeClassName,
  nameClassName,
}: {
  code: string | null | undefined;
  name: string | null | undefined;
  className?: string;
  codeClassName?: string;
  nameClassName?: string;
}): ReactNode {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (!c && !n) return <span className={className}>—</span>;
  if (!c) return <span className={className}>{n}</span>;
  if (!n) return <span className={className}><span className={`font-mono font-bold ${codeClassName ?? ""}`}>{c}</span></span>;
  return (
    <span className={className}>
      <span className={`font-mono font-bold ${codeClassName ?? ""}`}>{c}</span>
      <span className={`font-normal text-muted-foreground ${nameClassName ?? ""}`}> ({n})</span>
    </span>
  );
}

/** Plain string variant for receipts/PDFs/share text. */
export function clientLabelText(
  code: string | null | undefined,
  name: string | null | undefined,
): string {
  const c = (code ?? "").trim();
  const n = (name ?? "").trim();
  if (!c && !n) return "—";
  if (!c) return n;
  if (!n) return c;
  return `${c} (${n})`;
}
