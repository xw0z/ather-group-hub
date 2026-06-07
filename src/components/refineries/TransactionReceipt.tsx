import type { RefineryTransaction } from "@/lib/refineries.functions";

/* ============================================================
   Professional refinery transaction receipt
   White A4 portrait, 794 × 1123 base size (px @ 96dpi)
   Rendered off-screen at scale=2.5–3 for PDF/PNG export.
============================================================ */

const ORANGE = "#e85d3a";
const ORANGE_SOFT = "#fdece6";
const INK = "#1a1a1a";
const SUB = "#5b6577";
const LINE = "#e3e3e3";
const PAPER = "#ffffff";
const PAPER_2 = "#fafafa";
const HEAD = "#f3f4f6";
const RED = "#b3261e";
const GREEN = "#1f7a4d";

const fmtG = (n: number) =>
  `${Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} g`;
const fmtDA = (n: number) =>
  `${Number(n).toLocaleString("en-US", { maximumFractionDigits: 2 })} DA`;
const fmtPurity = (n: number) =>
  Number(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
        padding: "40px 48px",
        boxSizing: "border-box",
        fontSize: 12,
        lineHeight: 1.45,
      }}
    >
      {/* HEADER */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: 8,
              background: ORANGE, color: "#fff",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontWeight: 800, fontSize: 22, letterSpacing: 1,
              boxShadow: "0 2px 6px rgba(232,93,58,0.25)",
            }}
          >AG</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: 1.5 }}>ATHER GROUP</div>
            <div style={{ fontSize: 11, color: SUB, letterSpacing: 0.5 }}>Refinery Management System</div>
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: SUB, letterSpacing: 1.5, textTransform: "uppercase" }}>Transaction Receipt</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginTop: 2, fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {tx.transaction_number}
          </div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 4 }}>{fmtDate(tx.transaction_date)}</div>
          <div style={{ fontSize: 11, color: SUB }}>{fmtTime(tx.created_at)}</div>
        </div>
      </div>

      {/* ORANGE DIVIDER */}
      <div style={{ height: 3, background: ORANGE, borderRadius: 2, marginTop: 18 }} />

      {/* TITLE */}
      <div style={{ textAlign: "center", marginTop: 22, marginBottom: 18 }}>
        <div style={{
          fontSize: 18, fontWeight: 800, letterSpacing: 3,
          textTransform: "uppercase",
        }}>Refinery Transaction Receipt</div>
        <div style={{ width: 80, height: 2, background: ORANGE, margin: "8px auto 0" }} />
      </div>

      {/* CLIENT SECTION */}
      <div style={{
        border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden",
      }}>
        <div style={{
          background: HEAD, padding: "8px 14px",
          fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
          color: SUB, fontWeight: 700,
        }}>Transaction Details</div>
        <div style={{
          display: "grid", gridTemplateColumns: "1fr 1fr", gap: 0,
        }}>
          <InfoCell label="Client Name" value={tx.client_name ?? "—"} />
          <InfoCell label="Refinery" value={refineryName} />
          <InfoCell label="Direction" value={tx.direction === "receiving" ? "Receiving Gold" : "Delivery Gold"} />
          <InfoCell label="Transaction Type" value={tx.transaction_type.toUpperCase()} />
          <InfoCell label="Created By" value={tx.created_by_name ?? "—"} />
          <InfoCell label="Date" value={fmtDate(tx.transaction_date)} />
        </div>
      </div>

      {/* DA-ONLY SECTION */}
      {!isGold && (
        <div style={{ marginTop: 18, border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden" }}>
          <div style={{
            background: HEAD, padding: "8px 14px",
            fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
            color: SUB, fontWeight: 700,
          }}>DA Movement</div>
          <div style={{ padding: 14, display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: SUB }}>DA Amount</span>
            <span style={{ fontSize: 18, fontWeight: 700 }}>{fmtDA(Number(tx.da_amount))}</span>
          </div>
        </div>
      )}

      {/* GOLD BARS TABLE */}
      {isGold && tx.bars && tx.bars.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <SectionTitle>Gold Bars</SectionTitle>
          <table style={{
            width: "100%", borderCollapse: "collapse", marginTop: 8,
            border: `1px solid ${LINE}`,
          }}>
            <thead>
              <tr style={{ background: HEAD }}>
                <Th width={40} align="left">#</Th>
                <Th align="right">Gross Weight (g)</Th>
                <Th align="right">Purity</Th>
                <Th align="right">Pure Gold (g)</Th>
              </tr>
            </thead>
            <tbody>
              {tx.bars.map((b, i) => (
                <tr key={i} style={{ background: i % 2 === 0 ? PAPER : PAPER_2 }}>
                  <Td align="left">{b.item_number ?? i + 1}</Td>
                  <Td align="right" mono>{Number(b.gross_weight).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</Td>
                  <Td align="right" mono>{fmtPurity(Number(b.purity))}</Td>
                  <Td align="right" mono><strong>{Number(b.pure_weight).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</strong></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* TOTALS BOX */}
      {isGold && (
        <div style={{
          marginTop: 18, border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden",
        }}>
          <div style={{
            background: HEAD, padding: "8px 14px",
            fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
            color: SUB, fontWeight: 700,
          }}>Totals</div>
          <div style={{ padding: "10px 14px" }}>
            <TotalRow label="Total Gross Weight" value={fmtG(totalGross)} />
            <TotalRow label="Total Pure Gold" value={fmtG(totalPure)} bold />
            {hasFee && <>
              <TotalRow label="Weight @ 730" value={fmtG(w730)} />
              <TotalRow label="Refining Fee Price" value={`${fmtDA(feePrice)} / g`} />
              <div style={{ height: 1, background: LINE, margin: "8px 0" }} />
              <TotalRow label="Total Refining Fee" value={fmtDA(totalFee)} bold accent />
            </>}
          </div>
        </div>
      )}

      {/* FEE FORMULA */}
      {hasFee && (
        <div style={{
          marginTop: 12, padding: "10px 14px",
          background: ORANGE_SOFT, border: `1px dashed ${ORANGE}`,
          borderRadius: 6, fontSize: 11, color: INK,
        }}>
          <span style={{ color: SUB, marginRight: 8, textTransform: "uppercase", letterSpacing: 1 }}>Formula</span>
          <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
            {fmtG(w730)} × {fmtDA(feePrice)}/g = <strong>{fmtDA(totalFee)}</strong>
          </span>
        </div>
      )}

      {/* BALANCE MOVEMENT */}
      {hasBalances && (
        <div style={{ marginTop: 18 }}>
          <SectionTitle>Balance Movement</SectionTitle>
          <table style={{
            width: "100%", borderCollapse: "collapse", marginTop: 8,
            border: `1px solid ${LINE}`,
          }}>
            <thead>
              <tr style={{ background: HEAD }}>
                <Th align="left">Account</Th>
                <Th align="right">Previous</Th>
                <Th align="right">Movement</Th>
                <Th align="right">New Balance</Th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ background: PAPER }}>
                <Td align="left"><strong>Gold (Pure)</strong></Td>
                <Td align="right" mono style={{ color: signedColor(prevG) }}>{signedStr(prevG, fmtG)}</Td>
                <Td align="right" mono style={{ color: signedColor(dGold) }}>{signedStr(dGold, fmtG)}</Td>
                <Td align="right" mono style={{ color: signedColor(newG), fontWeight: 700 }}>{signedStr(newG, fmtG)}</Td>
              </tr>
              <tr style={{ background: PAPER_2 }}>
                <Td align="left"><strong>DA Account</strong></Td>
                <Td align="right" mono style={{ color: signedColor(prevDA) }}>{signedStr(prevDA, fmtDA)}</Td>
                <Td align="right" mono style={{ color: signedColor(dDA) }}>{signedStr(dDA, fmtDA)}</Td>
                <Td align="right" mono style={{ color: signedColor(newDA), fontWeight: 700 }}>{signedStr(newDA, fmtDA)}</Td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* NOTES */}
      {tx.notes && (
        <div style={{
          marginTop: 18, padding: 12, border: `1px solid ${LINE}`, borderRadius: 6,
          background: PAPER_2,
        }}>
          <div style={{ fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: SUB, fontWeight: 700, marginBottom: 4 }}>Notes</div>
          <div style={{ fontSize: 12 }}>{tx.notes}</div>
        </div>
      )}

      {/* SIGNATURES */}
      <div style={{ marginTop: 36, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 24 }}>
        <Signature label="Prepared By" />
        <Signature label="Received By" />
        <Signature label="Authorized Signature" />
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: 36, paddingTop: 12, borderTop: `1px solid ${LINE}`, textAlign: "center" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 2, color: INK }}>ATHER GROUP</div>
        <div style={{ fontSize: 10, color: SUB, marginTop: 2 }}>Generated by ATHER DESK · This receipt is system-generated</div>
      </div>
    </div>
  );
}

/* ----- small primitives ----- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase",
      color: SUB, fontWeight: 700,
      display: "flex", alignItems: "center", gap: 8,
    }}>
      <span style={{ width: 4, height: 12, background: ORANGE, borderRadius: 2 }} />
      {children}
    </div>
  );
}

function InfoCell({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: "10px 14px", borderTop: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}` }}>
      <div style={{ fontSize: 9, letterSpacing: 1.2, textTransform: "uppercase", color: SUB, fontWeight: 600 }}>{label}</div>
      <div style={{ fontSize: 13, marginTop: 2, color: INK }}>{value}</div>
    </div>
  );
}

function Th({ children, align, width }: { children: React.ReactNode; align: "left" | "right"; width?: number }) {
  return (
    <th style={{
      textAlign: align, padding: "8px 12px",
      fontSize: 10, letterSpacing: 1, textTransform: "uppercase",
      color: SUB, fontWeight: 700,
      borderBottom: `1px solid ${LINE}`,
      width,
    }}>{children}</th>
  );
}

function Td({
  children, align, mono, style,
}: { children: React.ReactNode; align: "left" | "right"; mono?: boolean; style?: React.CSSProperties }) {
  return (
    <td style={{
      textAlign: align, padding: "8px 12px", fontSize: 12, color: INK,
      fontFamily: mono ? "ui-monospace, SFMono-Regular, Menlo, monospace" : undefined,
      ...style,
    }}>{children}</td>
  );
}

function TotalRow({
  label, value, bold, accent,
}: { label: string; value: string; bold?: boolean; accent?: boolean }) {
  return (
    <div style={{
      display: "flex", justifyContent: "space-between", padding: "4px 0",
      fontSize: bold ? 13 : 12,
      fontWeight: bold ? 700 : 400,
      color: accent ? ORANGE : INK,
    }}>
      <span style={{ color: bold ? INK : SUB, fontWeight: bold ? 600 : 400 }}>{label}</span>
      <span style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", color: accent ? ORANGE : INK }}>{value}</span>
    </div>
  );
}

function Signature({ label }: { label: string }) {
  return (
    <div style={{ textAlign: "center" }}>
      <div style={{ height: 36 }} />
      <div style={{ borderTop: `1px solid ${INK}`, paddingTop: 6, fontSize: 10, letterSpacing: 1.5, textTransform: "uppercase", color: SUB, fontWeight: 600 }}>{label}</div>
    </div>
  );
}
