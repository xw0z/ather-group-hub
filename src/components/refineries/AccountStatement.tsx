import type { AccountStatement, StatementRow } from "@/lib/refineries.functions";

/* ============================================================
   Professional Client Account Statement — Simplified
   A4 portrait, 794 × 1123 base size (px @ 96 dpi)
   WHITE background. Single source of truth for PDF + PNG share.
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
const fmtG = (n: number) => `${num2(n)}`;
const fmtDA = (n: number) => `${num2(n)}`;
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
  gold_received: "Buy",
  gold_delivered: "Sell",
  refining_fee: "Refining Fee",
  da_received: "DA Received",
  da_paid: "DA Paid",
  settlement: "Settlement",
  buy_metal: "Metal Buy",
  sell_metal: "Metal Sell",
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

const balanceColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : INK);

/* ============================================================
   FULL REPORT — pages of A4 (used for BOTH PDF and PNG)
============================================================ */

export function AccountStatementReport({ data }: { data: AccountStatement }) {
  const PAGE_W = 794;
  const ROWS_PER_PAGE_FIRST = 20;
  const ROWS_PER_PAGE = 28;
  const pages: StatementRow[][] = [];
  if (data.rows.length === 0) {
    pages.push([]);
  } else {
    const first = data.rows.slice(0, ROWS_PER_PAGE_FIRST);
    pages.push(first);
    let i = first.length;
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
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{
            display: "inline-block",
            background: ORANGE_SOFT, color: ORANGE,
            padding: "4px 10px", borderRadius: 4,
            fontSize: 10, fontWeight: 700, letterSpacing: 2, textTransform: "uppercase",
          }}>Account Statement</div>
          <div style={{ fontSize: 9, color: SUB, marginTop: 6 }}>
            Page {pageIdx + 1} of {totalPages}
          </div>
        </div>
      </div>

      <div style={{ height: 4, background: ORANGE, marginTop: 14, borderRadius: 2 }} />

      {/* ─── Compact identity block ─── */}
      <div style={{ marginTop: 18, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 24 }}>
        <div>
          <div style={{ fontSize: 9, color: SUB, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>Client</div>
          <div style={{ fontSize: 22, fontWeight: 900, color: INK, marginTop: 4, letterSpacing: -0.3 }}>
            {data.client.name}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 9, color: SUB, letterSpacing: 2, textTransform: "uppercase", fontWeight: 700 }}>Statement</div>
          <div style={{ fontFamily: MONO, fontSize: 12, fontWeight: 700, color: INK, marginTop: 4 }}>
            {data.statement_number}
          </div>
          <div style={{ fontSize: 10, color: SUB, marginTop: 4 }}>
            Period:{" "}
            <span style={{ color: INK, fontWeight: 600 }}>
              {fmtDate(data.range.from)} – {fmtDate(data.range.to)}
            </span>
          </div>
        </div>
      </div>

      {/* ─── Account overview: 4 large balance cards (first page only) ─── */}
      {isFirst && (
        <>
          <SectionTitle>Account Overview</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 10 }}>
            <BalanceCard label="Opening Gold" value={`${fmtG(data.opening_gold)} g`} color={balanceColor(data.opening_gold)} />
            <BalanceCard label="Closing Gold" value={`${fmtG(data.closing_gold)} g`} color={balanceColor(data.closing_gold)} emphasized />
            <BalanceCard label="Opening DA" value={`${fmtDA(data.opening_da)} DA`} color={balanceColor(data.opening_da)} />
            <BalanceCard label="Closing DA" value={`${fmtDA(data.closing_da)} DA`} color={balanceColor(data.closing_da)} emphasized />
          </div>
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
            <BigBalance label="Closing Gold Balance" value={`${fmtG(data.closing_gold)} g`} color={balanceColor(data.closing_gold)} />
            <BigBalance label="Closing DA Balance" value={`${fmtDA(data.closing_da)} DA`} color={balanceColor(data.closing_da)} />
          </div>
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
          Generated on: <span style={{ color: INK, fontWeight: 600 }}>{fmtDateTime(data.generated_at)}</span>
        </span>
        <span>
          <strong style={{ color: INK, letterSpacing: 2 }}>ATHER GROUP</strong>
          {" · "}Refinery Management System
        </span>
        <span style={{ fontFamily: MONO }}>Page {pageIdx + 1}/{totalPages}</span>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 3, textTransform: "uppercase", color: INK,
      fontWeight: 800, marginTop: 22, marginBottom: 10,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ height: 3, flex: "0 0 22px", background: ORANGE, borderRadius: 2 }} />
      <span>{children}</span>
      <span style={{ height: 1, flex: 1, background: LINE_SOFT }} />
    </div>
  );
}

function BalanceCard({ label, value, color, emphasized }: { label: string; value: string; color: string; emphasized?: boolean }) {
  return (
    <div style={{
      border: `1px solid ${emphasized ? ORANGE : LINE}`,
      borderRadius: 8,
      padding: "14px 14px",
      background: emphasized ? ORANGE_SOFT : PAPER,
    }}>
      <div style={{ fontSize: 9, color: SUB, letterSpacing: 1.5, textTransform: "uppercase", fontWeight: 700 }}>
        {label}
      </div>
      <div style={{
        fontSize: 18, fontWeight: 900, color, fontFamily: MONO, marginTop: 6,
      }}>
        {value}
      </div>
    </div>
  );
}

function TxTable({ rows, startIndex }: { rows: StatementRow[]; startIndex: number }) {
  const th: React.CSSProperties = {
    padding: "9px 8px", fontSize: 9, textAlign: "left",
    letterSpacing: 1, textTransform: "uppercase", fontWeight: 800,
    color: INK, background: HEAD, borderBottom: `2px solid ${INK}`,
  };
  const thR: React.CSSProperties = { ...th, textAlign: "right" };
  const thC: React.CSSProperties = { ...th, textAlign: "center" };
  const td: React.CSSProperties = {
    padding: "8px 8px", fontSize: 10, verticalAlign: "middle",
    borderBottom: `1px solid ${LINE_SOFT}`, color: INK,
  };
  const tdR: React.CSSProperties = { ...td, textAlign: "right", fontFamily: MONO };

  return (
    <table style={{
      width: "100%", borderCollapse: "collapse", marginTop: 4, tableLayout: "fixed",
      border: `1px solid ${LINE}`,
    }}>
      <colgroup>
        <col style={{ width: 90 }} />
        <col style={{ width: 100 }} />
        <col style={{ width: 60 }} />
        <col style={{ width: 60 }} />
        <col style={{ width: 100 }} />
        <col style={{ width: 120 }} />
        <col style={{ width: "auto" }} />
      </colgroup>
      <thead>
        <tr>
          <th style={th}>Date</th>
          <th style={th}>Type</th>
          <th style={thC}>Metal</th>
          <th style={thC}>Dir</th>
          <th style={thR}>Gold (g)</th>
          <th style={thR}>DA Amount</th>
          <th style={th}>Description</th>
        </tr>
      </thead>
      <tbody>
        {rows.length === 0 && (
          <tr>
            <td colSpan={7} style={{ ...td, textAlign: "center", padding: 28, color: SUB }}>
              No transactions in this period.
            </td>
          </tr>
        )}
        {rows.map((r, i) => {
          const zebra = (startIndex + i) % 2 === 1;
          const dir = directionOf(r);
          const goldNet = r.gold_credit - r.gold_debit;
          const daNet = r.da_credit - r.da_debit;
          const metalLabel = r.metal
            ? (r.metal === "gold" ? "GOLD" : "SILVER")
            : (r.type === "gold_received" || r.type === "gold_delivered" || (r.type === "settlement" && goldNet !== 0) ? "GOLD" : "—");

          return (
            <tr key={i} style={{ background: zebra ? PAPER_ALT : PAPER }}>
              <td style={td}>{fmtDate(r.date)}</td>
              <td style={td}>{TYPE_LABEL[r.type]}</td>
              <td style={{ ...td, textAlign: "center", fontSize: 9, fontWeight: 700, color: SUB }}>{metalLabel}</td>
              <td style={{ ...td, textAlign: "center" }}>
                <span style={{
                  display: "inline-block", padding: "2px 8px", borderRadius: 3,
                  fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
                  color: dir.color, background: `${dir.color}1A`, border: `1px solid ${dir.color}40`,
                }}>{dir.label}</span>
              </td>
              <td style={{ ...tdR, color: goldNet > 0 ? GREEN : goldNet < 0 ? RED : SUB, fontWeight: goldNet !== 0 ? 700 : 400 }}>
                {goldNet !== 0 ? `${goldNet > 0 ? "+" : ""}${num2(goldNet)} g` : "—"}
              </td>
              <td style={{ ...tdR, color: daNet > 0 ? GREEN : daNet < 0 ? RED : SUB, fontWeight: daNet !== 0 ? 700 : 400 }}>
                {daNet !== 0 ? `${daNet > 0 ? "+" : ""}${num2(daNet)} DA` : "—"}
              </td>
              <td style={{ ...td, color: SUB, fontSize: 9.5 }}>
                {r.description || TYPE_LABEL[r.type]}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function BigBalance({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{
      border: `2px solid ${ORANGE}`, borderRadius: 8, padding: "14px 18px",
      background: ORANGE_SOFT,
    }}>
      <div style={{ fontSize: 9.5, color: SUB, letterSpacing: 2, textTransform: "uppercase", fontWeight: 800 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 900, color, fontFamily: MONO, marginTop: 4 }}>{value}</div>
    </div>
  );
}

/* ============================================================
   PNG SHARE — uses the EXACT same template as the PDF.
============================================================ */

export const AccountStatementSummary = AccountStatementReport;
