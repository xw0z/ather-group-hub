import type { RefineryTransaction } from "@/lib/refineries.functions";

/* ============================================================
   Professional refinery transaction receipt
   White A4 portrait, 794 × 1123 base size (px @ 96dpi)
   Rendered off-screen at scale=2.5–3 for PDF/PNG export.
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

const num2 = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtG = (n: number) => `${num2(n)} g`;
const fmtDA = (n: number) =>
  `${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} DA`;
const fmtPurity = (n: number) => num2(n);
const fmtDate = (s: string) => {
  try {
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
  } catch { return s; }
};
const fmtTime = (s: string) => {
  try { return new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
};
const signedColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : INK);
const signedStr = (n: number, fmt: (x: number) => string) =>
  `${n > 0 ? "+" : ""}${fmt(n)}`;

const MONO = "ui-monospace, SFMono-Regular, Menlo, monospace";

export function TransactionReceiptReport({
  tx, refineryName,
}: { tx: RefineryTransaction; refineryName: string }) {
  const W = 794;
  const isGold = tx.transaction_type === "gold";
  const totalPure = Number(tx.total_pure_weight || 0);
  const totalGross = Number(tx.total_gross_weight || 0);
  const w730 = totalPure > 0 ? (totalPure * 1000) / 730 : 0;
  const feePrice = Number(tx.fee_price || 0);
  const totalFee = Number(tx.total_refining_fee || 0);
  const hasFee = isGold && totalFee > 0;
  const prevG = Number(tx.previous_purity_balance ?? 0);
  const newG = Number(tx.new_purity_balance ?? 0);
  const dGold = newG - prevG;
  const prevDA = Number(tx.previous_da_balance ?? 0);
  const newDA = Number(tx.new_da_balance ?? 0);
  const dDA = newDA - prevDA;
  const hasBalances = tx.previous_purity_balance != null || tx.previous_da_balance != null;

  return (
    <div
      style={{
        width: W,
        minHeight: 1123,
        background: PAPER,
        color: INK,
        fontFamily: 'Inter, "Helvetica Neue", Arial, sans-serif',
        padding: "44px 52px",
        boxSizing: "border-box",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {/* ===== HEADER ===== */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <div
            style={{
              width: 64, height: 64, borderRadius: 10,
              background: ORANGE, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 24, letterSpacing: 1.5,
              boxShadow: "0 3px 8px rgba(232,93,58,0.28)",
            }}
          >AG</div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800, letterSpacing: 1.8, color: INK }}>ATHER GROUP</div>
            <div style={{ fontSize: 12, color: SUB, marginTop: 2 }}>{refineryName}</div>
            <div style={{ fontSize: 11, color: SUB, letterSpacing: 0.5, marginTop: 1 }}>Transaction Receipt</div>
          </div>
        </div>
        <div style={{ textAlign: "right", minWidth: 200 }}>
          <div style={{
            display: "inline-block",
            padding: "4px 10px",
            background: ORANGE_SOFT,
            color: ORANGE,
            fontSize: 10, letterSpacing: 1.8, textTransform: "uppercase", fontWeight: 700,
            borderRadius: 4,
          }}>Receipt No.</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6, fontFamily: MONO, color: INK }}>
            {tx.transaction_number}
          </div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 8 }}>
            <strong style={{ color: INK }}>Date:</strong> {fmtDate(tx.transaction_date)}
          </div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
            <strong style={{ color: INK }}>Time:</strong> {fmtTime(tx.created_at)}
          </div>
        </div>
      </div>

      {/* Strong separator */}
      <div style={{ height: 4, background: ORANGE, borderRadius: 2, marginTop: 18 }} />
      <div style={{ height: 1, background: INK, marginTop: 2 }} />

      {/* ===== CLIENT / TRANSACTION INFO ===== */}
      <SectionLabel>Client & Transaction Information</SectionLabel>
      <div style={{
        border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden",
        display: "grid", gridTemplateColumns: "1fr 1fr",
      }}>
        <InfoCell label="Client" value={tx.client_code ?? "—"} strong />
        <InfoCell label="Refinery" value={refineryName} />
        <InfoCell label="Direction" value={tx.direction === "receiving" ? "Receiving Gold" : "Delivery Gold"} />
        <InfoCell label="Transaction Type" value={tx.transaction_type.toUpperCase()} />
        <InfoCell label="Created By" value={tx.created_by_name ?? "—"} />
        <InfoCell label="Date" value={fmtDate(tx.transaction_date)} />
      </div>

      {/* ===== DA-ONLY ===== */}
      {!isGold && (
        <>
          <SectionLabel>DA Movement</SectionLabel>
          <div style={{
            border: `1px solid ${LINE}`, borderRadius: 6, padding: 18,
            display: "flex", justifyContent: "space-between", alignItems: "center",
          }}>
            <span style={{ color: SUB, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 }}>DA Amount</span>
            <span style={{ fontSize: 22, fontWeight: 800, fontFamily: MONO }}>{fmtDA(Number(tx.da_amount))}</span>
          </div>
        </>
      )}

      {/* ===== GOLD BARS TABLE ===== */}
      {isGold && tx.bars && tx.bars.length > 0 && (
        <>
          <SectionLabel>Gold Bars</SectionLabel>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            border: `1px solid ${LINE}`,
            tableLayout: "fixed",
          }}>
            <thead>
              <tr style={{ background: HEAD }}>
                <Th width="9%" align="center">#</Th>
                <Th align="right">Gross Weight (g)</Th>
                <Th width="14%" align="center">Purity</Th>
                <Th align="right">Pure Gold (g)</Th>
                <Th align="right">Weight @ 730 (g)</Th>
              </tr>
            </thead>
            <tbody>
              {tx.bars.map((b, i) => {
                const pure = Number(b.pure_weight);
                const barW730 = pure > 0 ? pure / 0.73 : 0;
                return (
                  <tr key={i} style={{ background: i % 2 === 0 ? PAPER : PAPER_ALT }}>
                    <Td align="center" mono>{b.item_number ?? i + 1}</Td>
                    <Td align="right" mono>{num2(Number(b.gross_weight))}</Td>
                    <Td align="center" mono>{fmtPurity(Number(b.purity))}</Td>
                    <Td align="right" mono strong>{num2(pure)}</Td>
                    <Td align="right" mono>{num2(barW730)}</Td>
                  </tr>
                );
              })}
              {/* Integrated totals row */}
              <tr style={{ background: HEAD, borderTop: `1.5px solid ${INK}` }}>
                <Td align="center" strong style={{ textTransform: "uppercase", letterSpacing: 1, fontSize: 11 }}>Total</Td>
                <Td align="right" mono strong style={{ fontSize: 13 }}>{num2(totalGross)}</Td>
                <Td align="center" mono style={{ color: SUB }}>—</Td>
                <Td align="right" mono strong style={{ fontSize: 13, color: ORANGE }}>{num2(totalPure)}</Td>
                <Td align="right" mono strong style={{ fontSize: 13, color: ORANGE }}>{num2(w730)}</Td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* ===== SUMMARY BOX ===== */}
      {isGold && (
        <>
          <SectionLabel>Summary</SectionLabel>
          <div style={{
            border: `1.5px solid ${INK}`, borderRadius: 6, overflow: "hidden",
          }}>
            <SummaryRow label="Total Gross Weight" value={fmtG(totalGross)} />
            <SummaryRow label="Total Pure Gold" value={fmtG(totalPure)} emphasis />
            <SummaryRow label="Total Weight @ 730" value={fmtG(w730)} emphasis />
            {hasFee && <>
              <SummaryRow label="Refining Fee Price" value={`${num2(feePrice)} DA / g`} />
              <SummaryRow label="Total Refining Fee" value={fmtDA(totalFee)} accent last />
            </>}
            {!hasFee && <SummaryRow label="Refining Fee" value="—" subtle last />}
          </div>
        </>
      )}

      {/* ===== GOLD PURITY & REFINING FEE TOTAL ===== */}
      {hasFee && (
        <>
          <SectionLabel>Gold Purity & Refining Fee Total</SectionLabel>
          <div style={{
            border: `2px solid ${ORANGE}`, borderRadius: 8,
            background: ORANGE_SOFT,
            padding: "22px 24px",
          }}>
            {/* Two big value blocks */}
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1px 1fr", gap: 0,
              alignItems: "center",
            }}>
              <div style={{ textAlign: "center", padding: "4px 12px" }}>
                <div style={{
                  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
                  color: SUB, fontWeight: 700, marginBottom: 8,
                }}>Total Pure Gold</div>
                <div style={{
                  fontFamily: MONO, fontSize: 26, fontWeight: 800, color: INK, letterSpacing: 0.3,
                }}>{num2(totalPure)} g</div>
              </div>
              <div style={{ width: 1, height: 60, background: ORANGE, opacity: 0.35 }} />
              <div style={{ textAlign: "center", padding: "4px 12px" }}>
                <div style={{
                  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
                  color: ORANGE, fontWeight: 700, marginBottom: 8,
                }}>Total Refining Fee</div>
                <div style={{
                  fontFamily: MONO, fontSize: 26, fontWeight: 800, color: ORANGE, letterSpacing: 0.3,
                }}>{fmtDA(totalFee)}</div>
              </div>
            </div>

            {/* Divider */}
            <div style={{ height: 1, background: ORANGE, opacity: 0.25, margin: "18px 0 14px" }} />

            {/* Formula */}
            <div style={{
              fontSize: 9, letterSpacing: 2, textTransform: "uppercase",
              color: ORANGE, fontWeight: 700, marginBottom: 6, textAlign: "center",
            }}>Formula</div>
            <div style={{
              fontFamily: MONO, fontSize: 13, color: INK, fontWeight: 600, textAlign: "center",
            }}>
              {num2(w730)} g  ×  {num2(feePrice)} DA/g  =  <span style={{ color: ORANGE, fontWeight: 800 }}>{fmtDA(totalFee)}</span>
            </div>
            <div style={{
              fontSize: 10, color: SUB, textAlign: "center", marginTop: 4, fontStyle: "italic",
            }}>Weight @ 730 × Fee Price = Total Refining Fee</div>
          </div>
        </>
      )}

      {/* ===== BALANCE MOVEMENT ===== */}
      {hasBalances && (
        <>
          <SectionLabel>Balance Movement</SectionLabel>
          <table style={{
            width: "100%", borderCollapse: "collapse",
            border: `1.5px solid ${INK}`,
            tableLayout: "fixed",
          }}>
            <thead>
              <tr style={{ background: HEAD }}>
                <Th align="left" width="25%">Account</Th>
                <Th align="right">Previous Balance</Th>
                <Th align="right">Movement</Th>
                <Th align="right">New Balance</Th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: PAPER }}>
                <Td align="left" strong>Gold Balance</Td>
                <Td align="right" mono>{fmtG(prevG)}</Td>
                <Td align="right" mono strong style={{ color: signedColor(dGold) }}>{signedStr(dGold, fmtG)}</Td>
                <Td align="right" mono strong style={{ color: INK, fontSize: 13 }}>{fmtG(newG)}</Td>
              </tr>
              <tr style={{ background: PAPER_ALT }}>
                <Td align="left" strong>DA Balance</Td>
                <Td align="right" mono>{fmtDA(prevDA)}</Td>
                <Td align="right" mono strong style={{ color: signedColor(dDA) }}>{signedStr(dDA, fmtDA)}</Td>
                <Td align="right" mono strong style={{ color: INK, fontSize: 13 }}>{fmtDA(newDA)}</Td>
              </tr>
            </tbody>
          </table>
        </>
      )}

      {/* ===== NOTES ===== */}
      {tx.notes && (
        <>
          <SectionLabel>Notes</SectionLabel>
          <div style={{
            padding: 14, border: `1px solid ${LINE}`, borderRadius: 6,
            background: PAPER_ALT, fontSize: 12, color: INK, lineHeight: 1.6,
          }}>
            {tx.notes}
          </div>
        </>
      )}

      {/* ===== SIGNATURES ===== */}
      <div style={{ marginTop: 50, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>
        <Signature label="Prepared By" />
        <Signature label="Received By" />
        <Signature label="Authorized Signature" />
      </div>

      {/* ===== FOOTER ===== */}
      <div style={{ marginTop: 40, paddingTop: 14, borderTop: `2px solid ${INK}`, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2.5, color: INK }}>ATHER GROUP</div>
        <div style={{ fontSize: 10, color: SUB, marginTop: 2, letterSpacing: 0.5 }}>Refinery Management System</div>
        <div style={{ fontSize: 9, color: SUB, marginTop: 6, fontStyle: "italic" }}>
          Generated by ATHER DESK · This document is an official refinery transaction receipt.
        </div>
      </div>
    </div>
  );
}

/* ----- primitives ----- */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      marginTop: 22, marginBottom: 8,
      display: "flex", alignItems: "center", gap: 10,
    }}>
      <span style={{ width: 4, height: 14, background: ORANGE, borderRadius: 2 }} />
      <span style={{
        fontSize: 11, letterSpacing: 2, textTransform: "uppercase",
        color: INK, fontWeight: 700,
      }}>{children}</span>
      <span style={{ flex: 1, height: 1, background: LINE_SOFT, marginLeft: 4 }} />
    </div>
  );
}

function InfoCell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{
      padding: "12px 16px",
      borderRight: `1px solid ${LINE_SOFT}`,
      borderBottom: `1px solid ${LINE_SOFT}`,
    }}>
      <div style={{ fontSize: 9, letterSpacing: 1.4, textTransform: "uppercase", color: SUB, fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 3, color: INK, fontWeight: strong ? 700 : 500 }}>{value}</div>
    </div>
  );
}

function Th({
  children, align, width,
}: { children: React.ReactNode; align: "left" | "right" | "center"; width?: string | number }) {
  return (
    <th style={{
      textAlign: align, padding: "10px 12px",
      fontSize: 10, letterSpacing: 1.2, textTransform: "uppercase",
      color: INK, fontWeight: 700,
      borderRight: `1px solid ${LINE}`,
      borderBottom: `1.5px solid ${INK}`,
      width,
    }}>{children}</th>
  );
}

function Td({
  children, align, mono, strong, style,
}: {
  children: React.ReactNode; align: "left" | "right" | "center";
  mono?: boolean; strong?: boolean; style?: React.CSSProperties;
}) {
  return (
    <td style={{
      textAlign: align, padding: "9px 12px", fontSize: 12, color: INK,
      fontFamily: mono ? MONO : undefined,
      fontWeight: strong ? 700 : 400,
      borderRight: `1px solid ${LINE_SOFT}`,
      borderBottom: `1px solid ${LINE_SOFT}`,
      ...style,
    }}>{children}</td>
  );
}

function SummaryRow({
  label, value, emphasis, accent, subtle, last,
}: {
  label: string; value: string;
  emphasis?: boolean; accent?: boolean; subtle?: boolean; last?: boolean;
}) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", alignItems: "center",
      padding: accent ? "14px 18px" : "11px 18px",
      borderBottom: last ? "none" : `1px solid ${LINE_SOFT}`,
      background: accent ? ORANGE_SOFT : PAPER,
    }}>
      <span style={{
        fontSize: accent ? 13 : 12,
        color: subtle ? SUB : INK,
        fontWeight: accent || emphasis ? 700 : 500,
        textTransform: accent ? "uppercase" : "none",
        letterSpacing: accent ? 1 : 0,
      }}>{label}</span>
      <span style={{
        fontFamily: MONO,
        fontSize: accent ? 18 : emphasis ? 15 : 13,
        fontWeight: accent || emphasis ? 800 : 600,
        color: accent ? ORANGE : INK,
      }}>{value}</span>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ height: 56 }} />
      <div style={{
        borderTop: `1.5px solid ${INK}`,
        paddingTop: 8,
        fontSize: 10, letterSpacing: 1.8, textTransform: "uppercase",
        color: INK, fontWeight: 700,
      }}>{label}</div>
      <div style={{ fontSize: 9, color: SUB, marginTop: 2, fontStyle: "italic" }}>Signature & Date</div>
    </div>
  );
}
