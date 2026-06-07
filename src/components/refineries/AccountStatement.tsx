import type { AccountStatement, StatementRow } from "@/lib/refineries.functions";

/* ============================================================
   Professional Client Account Statement
   A4 portrait, 794 × 1123 base size (px @ 96 dpi)
   WHITE background. Used as the SINGLE source of truth for
   both PDF export and PNG share — guarantees identical output.
============================================================ */

const ORANGE = "#e85d3a";
const ORANGE_SOFT = "#fdece6";
const INK = "#111111";
const SUB = "#5b6577";
const LINE = "#cfd3da";
const LINE_SOFT = "#e5e7eb";
const PAPER = "#ffffff";
const PAPER_ALT = "#f7f8fa";
const HEAD = "#eceef2";
const RED = "#b3261e";
const GREEN = "#1f7a4d";
const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

const num2 = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const num0 = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
const fmtG = (n: number) => `${num2(n)}`;
const fmtDA = (n: number) => `${num2(n)}`;
const fmtPurity = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const fmtDate = (s: string) => {
  try {
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
  } catch { return s; }
};
const fmtDateTime = (s: string) => {
  try {
    return new Date(s).toLocaleString("en-GB", {
      year: "numeric", month: "short", day: "2-digit",
      hour: "2-digit", minute: "2-digit",
    });
  } catch { return s; }
};

const TYPE_LABEL: Record<StatementRow["type"], string> = {
  gold_received: "Gold Received",
  gold_delivered: "Gold Delivered",
  refining_fee: "Refining Fee",
  da_received: "DA Received",
  da_paid: "DA Paid",
  settlement: "SETTLEMENT",
  adjustment: "Adjustment",
  reversal: "Correction",
};

function directionOf(r: StatementRow): { label: string; color: string } {
  const goldIn = r.gold_credit > 0;
  const goldOut = r.gold_debit > 0;
  const daIn = r.da_credit > 0;
  const daOut = r.da_debit > 0;
  if (r.type === "refining_fee") return { label: "FEE", color: ORANGE };
  if (goldIn || daIn) return { label: "IN", color: GREEN };
  if (goldOut || daOut) return { label: "OUT", color: RED };
  return { label: "—", color: SUB };
}

/* ============================================================
   FULL REPORT — pages of A4 (used for BOTH PDF and PNG)
============================================================ */

export function AccountStatementReport({ data }: { data: AccountStatement }) {
  const PAGE_W = 794;
  const ROWS_PER_PAGE_FIRST = 18; // first page has summary, fewer rows
  const ROWS_PER_PAGE = 26;
  const pages: StatementRow[][] = [];
  if (data.rows.length === 0) {
    pages.push([]);
  } else {
    let i = 0;
    const first = data.rows.slice(0, ROWS_PER_PAGE_FIRST);
    pages.push(first);
    i = first.length;
    while (i < data.rows.length) {
      pages.push(data.rows.slice(i, i + ROWS_PER_PAGE));
      i += ROWS_PER_PAGE;
    }
  }

  return (
    <div
      data-statement-root
      style={{
        fontFamily: 'Inter, "Helvetica Neue", Arial, sans-serif',
        color: INK,
        background: PAPER,
      }}
    >
      {pages.map((pageRows, idx) => {
        const startIndex =
          idx === 0 ? 0 : ROWS_PER_PAGE_FIRST + (idx - 1) * ROWS_PER_PAGE;
        return (
          <StatementPage
            key={idx}
            data={data}
            rows={pageRows}
            pageIdx={idx}
            totalPages={pages.length}
            width={PAGE_W}
            startIndex={startIndex}
          />
        );
      })}
    </div>
  );
}

function StatementPage({
  data, rows, pageIdx, totalPages, width, startIndex,
}: {
  data: AccountStatement;
  rows: StatementRow[];
  pageIdx: number;
  totalPages: number;
  width: number;
  startIndex: number;
}) {
  const isFirst = pageIdx === 0;
  const isLast = pageIdx === totalPages - 1;

  return (
    <div
      data-statement-page
      style={{
        width,
        minHeight: 1123,
        background: PAPER,
        padding: "30px 36px 60px",
        boxSizing: "border-box",
        position: "relative",
        borderTop: `5px solid ${ORANGE}`,
        color: INK,
      }}
    >
      {/* ─── Header ─── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 16 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 56, height: 56, borderRadius: 10,
            background: ORANGE,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#fff", fontWeight: 900, fontSize: 26, letterSpacing: -1,
          }}>A</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 900, letterSpacing: 3, color: INK }}>ATHER GROUP</div>
            <div style={{ fontSize: 10, color: SUB, letterSpacing: 2, textTransform: "uppercase", marginTop: 2 }}>
              Refinery Management System
            </div>
            <div style={{ fontSize: 11, color: INK, marginTop: 4, fontWeight: 600 }}>
              {data.refinery.name}
            </div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            display: "inline-block",
            background: ORANGE_SOFT, color: ORANGE,
            padding: "4px 10px", borderRadius: 4,
            fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
          }}>Account Statement</div>
          <div style={{ marginTop: 8, fontSize: 9, color: SUB, letterSpacing: 1.5, textTransform: "uppercase" }}>Statement №</div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: INK, marginTop: 1 }}>
            {data.statement_number}
          </div>
          <div style={{ fontSize: 9, color: SUB, marginTop: 4 }}>
            Page {pageIdx + 1} of {totalPages}
          </div>
        </div>
      </div>

      <div style={{ height: 4, background: ORANGE, marginTop: 14, borderRadius: 2 }} />

      {/* ─── Meta block ─── */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0, marginTop: 16, border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
        <MetaCell label="Client" value={data.client.name} strong rightBorder bottomBorder />
        <MetaCell label="Refinery" value={data.refinery.name} bottomBorder />
        <MetaCell
          label="Statement Period"
          value={`${fmtDate(data.range.from)}  →  ${fmtDate(data.range.to)}`}
          rightBorder
          bottomBorder={isFirst}
        />
        <MetaCell
          label="Statement Date"
          value={fmtDateTime(data.generated_at)}
          bottomBorder={isFirst}
        />
        {isFirst && (
          <>
            <MetaCell label="Generated By" value={data.generated_by} rightBorder />
            <MetaCell label="Transactions" value={String(data.summary.transaction_count)} />
          </>
        )}
      </div>

      {/* ─── Summary (first page only) ─── */}
      {isFirst && (
        <>
          <SectionTitle>Account Summary</SectionTitle>
          <SummaryTable data={data} />
        </>
      )}

      {/* ─── Transactions ─── */}
      <SectionTitle>
        Transactions{totalPages > 1 ? ` — Part ${pageIdx + 1} / ${totalPages}` : ""}
      </SectionTitle>
      <TxTable rows={rows} startIndex={startIndex} />

      {/* ─── Closing balances (last page only) ─── */}
      {isLast && (
        <>
          <SectionTitle>Closing Balances</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <BigBalance label="Closing Gold Balance" value={`${fmtG(data.closing_gold)} g`} />
            <BigBalance label="Closing DA Balance" value={`${fmtDA(data.closing_da)} DA`} />
          </div>
          <SignatureBlock />
        </>
      )}

      {/* ─── Footer ─── */}
      <div style={{
        position: "absolute", left: 36, right: 36, bottom: 16,
        paddingTop: 8, borderTop: `1px solid ${LINE_SOFT}`,
        display: "flex", justifyContent: "space-between", alignItems: "center",
        fontSize: 9, color: SUB, letterSpacing: 0.6,
      }}>
        <span>
          <strong style={{ color: INK, letterSpacing: 2 }}>ATHER GROUP</strong>
          {" · "}Refinery Management System{" · "}Generated by ATHER DESK
        </span>
        <span style={{ fontFamily: MONO }}>{data.statement_number} · Page {pageIdx + 1}/{totalPages}</span>
      </div>
    </div>
  );
}

function MetaCell({
  label, value, strong, rightBorder, bottomBorder,
}: { label: string; value: string; strong?: boolean; rightBorder?: boolean; bottomBorder?: boolean }) {
  return (
    <div style={{
      padding: "10px 14px",
      borderRight: rightBorder ? `1px solid ${LINE}` : "none",
      borderBottom: bottomBorder ? `1px solid ${LINE}` : "none",
      background: PAPER,
    }}>
      <div style={{ fontSize: 8.5, color: SUB, letterSpacing: 2, textTransform: "uppercase", fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: strong ? 14 : 12, fontWeight: strong ? 800 : 600, color: INK, marginTop: 3 }}>{value}</div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: INK,
      fontWeight: 800, marginTop: 18, marginBottom: 8,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ height: 3, flex: "0 0 22px", background: ORANGE, borderRadius: 2 }} />
      <span>{children}</span>
      <span style={{ height: 1, flex: 1, background: LINE_SOFT }} />
    </div>
  );
}

function SummaryTable({ data }: { data: AccountStatement }) {
  const items: Array<{ label: string; value: string; tone?: "pos" | "neg" | "accent" | "neutral" }> = [
    { label: "Opening Gold Balance", value: `${fmtG(data.opening_gold)} g`, tone: "neutral" },
    { label: "Opening DA Balance", value: `${fmtDA(data.opening_da)} DA`, tone: "neutral" },
    { label: "Total Gold Received", value: `${fmtG(data.summary.total_gold_received)} g`, tone: "pos" },
    { label: "Total Gold Delivered", value: `${fmtG(data.summary.total_gold_delivered)} g`, tone: "neg" },
    { label: "Total DA Received", value: `${fmtDA(data.summary.total_da_received)} DA`, tone: "pos" },
    { label: "Total DA Paid", value: `${fmtDA(data.summary.total_da_paid)} DA`, tone: "neg" },
    { label: "Total Refining Fees", value: `${fmtDA(data.summary.total_refining_fees)} DA`, tone: "accent" },
    { label: "Transactions in Period", value: num0(data.summary.transaction_count), tone: "neutral" },
    { label: "Closing Gold Balance", value: `${fmtG(data.closing_gold)} g`, tone: "accent" },
    { label: "Closing DA Balance", value: `${fmtDA(data.closing_da)} DA`, tone: "accent" },
  ];
  return (
    <div style={{ border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr" }}>
        {items.map((it, i) => {
          const isClosing = i >= items.length - 2;
          const color =
            it.tone === "pos" ? GREEN :
            it.tone === "neg" ? RED :
            it.tone === "accent" ? ORANGE : INK;
          return (
            <div key={i} style={{
              display: "flex", justifyContent: "space-between", alignItems: "center",
              padding: "9px 14px",
              borderBottom: i < items.length - 2 ? `1px solid ${LINE_SOFT}` : "none",
              borderRight: i % 2 === 0 ? `1px solid ${LINE_SOFT}` : "none",
              background: isClosing ? ORANGE_SOFT : (i % 4 < 2 ? PAPER : PAPER_ALT),
            }}>
              <span style={{
                fontSize: 10.5, color: SUB, letterSpacing: 1, textTransform: "uppercase",
                fontWeight: isClosing ? 800 : 600,
              }}>{it.label}</span>
              <span style={{
                fontSize: isClosing ? 14 : 12, fontWeight: 800, color,
                fontFamily: MONO,
              }}>{it.value}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TxTable({ rows, startIndex }: { rows: StatementRow[]; startIndex: number }) {
  const th: React.CSSProperties = {
    padding: "7px 5px", fontSize: 8.5, textAlign: "left",
    letterSpacing: 0.8, textTransform: "uppercase", fontWeight: 800,
    color: INK, background: HEAD, borderBottom: `2px solid ${INK}`,
  };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const td: React.CSSProperties = {
    padding: "6px 5px", fontSize: 9, verticalAlign: "middle",
    borderBottom: `1px solid ${LINE_SOFT}`, color: INK,
  };
  const tdR: React.CSSProperties = { ...td, textAlign: "right", fontFamily: MONO };

  return (
    <table style={{
      width: "100%", borderCollapse: "collapse", marginTop: 4, tableLayout: "fixed",
      border: `1px solid ${LINE}`,
    }}>
      <colgroup>
        <col style={{ width: 26 }} />
        <col style={{ width: 64 }} />
        <col style={{ width: 70 }} />
        <col style={{ width: 78 }} />
        <col style={{ width: 38 }} />
        <col style={{ width: 56 }} />
        <col style={{ width: 44 }} />
        <col style={{ width: 56 }} />
        <col style={{ width: 56 }} />
        <col style={{ width: 60 }} />
        <col style={{ width: 60 }} />
        <col style={{ width: 60 }} />
        <col style={{ width: 60 }} />
      </colgroup>
      <thead>
        <tr>
          <th style={{ ...th, textAlign: "center" }}>#</th>
          <th style={th}>Date</th>
          <th style={th}>Ref №</th>
          <th style={th}>Type</th>
          <th style={{ ...th, textAlign: "center" }}>Dir</th>
          <th style={thR}>Gross (g)</th>
          <th style={thR}>Purity</th>
          <th style={thR}>Pure (g)</th>
          <th style={thR}>W @ 730</th>
          <th style={thR}>Ref. Fee</th>
          <th style={thR}>DA Mov.</th>
          <th style={thR}>Gold Bal.</th>
          <th style={thR}>DA Bal.</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={13} style={{ ...td, textAlign: "center", padding: 24, color: SUB }}>
              No transactions in this period.
            </td>
          </tr>
        )}
        {rows.map((r, i) => {
          const zebra = (startIndex + i) % 2 === 1;
          const dir = directionOf(r);
          const goldNet = r.gold_credit - r.gold_debit;
          const daNet = r.da_credit - r.da_debit;
          const refFee = r.type === "refining_fee" ? (r.fee_total ?? 0) : 0;

          const gross = r.original_weight ?? 0;
          const purity = r.original_purity ?? 0;
          const pure = r.type === "refining_fee"
            ? (gross * purity) / 1000
            : Math.max(r.gold_credit, r.gold_debit);
          const w730 = r.weight_at_730 ?? 0;

          return (
            <tr key={i} style={{ background: zebra ? PAPER_ALT : PAPER }}>
              <td style={{ ...td, textAlign: "center", color: SUB, fontFamily: MONO }}>{startIndex + i + 1}</td>
              <td style={td}>{fmtDate(r.date)}</td>
              <td style={{ ...td, fontFamily: MONO, fontSize: 8.5 }}>{r.reference}</td>
              <td style={{ ...td, fontSize: 9 }}>{TYPE_LABEL[r.type]}</td>
              <td style={{ ...td, textAlign: "center" }}>
                <span style={{
                  display: "inline-block", padding: "1px 6px", borderRadius: 3,
                  fontSize: 8, fontWeight: 800, letterSpacing: 0.6,
                  color: dir.color, background: `${dir.color}1A`, border: `1px solid ${dir.color}40`,
                }}>{dir.label}</span>
              </td>
              <td style={tdR}>{gross > 0 ? num2(gross) : "—"}</td>
              <td style={tdR}>{purity > 0 ? fmtPurity(purity) : "—"}</td>
              <td style={tdR}>{pure > 0 ? num2(pure) : "—"}</td>
              <td style={tdR}>{w730 > 0 ? num2(w730) : "—"}</td>
              <td style={{ ...tdR, color: refFee > 0 ? ORANGE : SUB, fontWeight: refFee > 0 ? 700 : 400 }}>
                {refFee > 0 ? num2(refFee) : "—"}
              </td>
              <td style={{ ...tdR, color: daNet > 0 ? GREEN : daNet < 0 ? RED : SUB, fontWeight: daNet !== 0 ? 700 : 400 }}>
                {daNet !== 0 ? `${daNet > 0 ? "+" : ""}${num2(daNet)}` : "—"}
              </td>
              <td style={{ ...tdR, fontWeight: 800 }}>{num2(r.running_gold)}</td>
              <td style={{ ...tdR, fontWeight: 800 }}>{num2(r.running_da)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BigBalance({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      border: `2px solid ${ORANGE}`, borderRadius: 8, padding: "14px 18px",
      background: ORANGE_SOFT,
    }}>
      <div style={{ fontSize: 9.5, color: SUB, letterSpacing: 2, textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color: INK, fontFamily: MONO, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function SignatureBlock() {
  return (
    <div style={{
      marginTop: 36,
      display: "grid", gridTemplateColumns: "1fr 1fr", gap: 60,
    }}>
      <div>
        <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 6, fontSize: 9, color: SUB, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
          Prepared By
        </div>
      </div>
      <div>
        <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 6, fontSize: 9, color: SUB, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
          Authorised Signature
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   PNG SHARE — uses the EXACT same template as the PDF.
   The dialog stitches all pages into a single tall PNG.
============================================================ */

export const AccountStatementSummary = AccountStatementReport;
