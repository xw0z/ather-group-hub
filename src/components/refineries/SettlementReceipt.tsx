import type { SettlementPair } from "@/lib/refineries.functions";

/* ============================================================
   Professional inter-client SETTLEMENT receipt
   White A4 portrait, 794 × 1123 base size (px @ 96dpi)
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
const fmtDA = (n: number) => `${num2(n)} DA`;
const fmtDate = (s: string) => {
  try {
    const d = new Date(s.length === 10 ? `${s}T00:00:00Z` : s);
    return d.toLocaleDateString("en-GB", { year: "numeric", month: "short", day: "2-digit" });
  } catch { return s; }
};
const fmtTime = (s: string) => {
  try { return new Date(s).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false }); }
  catch { return ""; }
};
const signedColor = (n: number) => (n > 0 ? GREEN : n < 0 ? RED : INK);
const signedStr = (n: number, fmt: (x: number) => string) =>
  `${n > 0 ? "+" : ""}${fmt(n)}`;

const MONO = "'Epilogue', 'Inter', system-ui, sans-serif";
const DISPLAY = "'Urbanist', 'Epilogue', system-ui, sans-serif";

export function SettlementReceiptReport({
  settlement, refineryName,
}: { settlement: SettlementPair; refineryName: string }) {
  const W = 794;
  const s = settlement;
  const isGold = s.kind === "gold";
  const hasFee = isGold && s.apply_fee && s.total_fee > 0;
  const fromGoldDelta = s.from.new_purity - s.from.previous_purity;
  const fromDaDelta = s.from.new_da - s.from.previous_da;
  const toGoldDelta = s.to.new_purity - s.to.previous_purity;
  const toDaDelta = s.to.new_da - s.to.previous_da;
  const receiptNo = s.from.transaction_number.replace(/-[AB]$/, "");

  return (
    <div
      data-receipt-root
      style={{
        width: W,
        minHeight: 1123,
        background: PAPER,
        color: INK,
        fontFamily: "'Epilogue', 'Inter', system-ui, sans-serif",
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
            <div style={{ fontSize: 11, color: SUB, letterSpacing: 0.5, marginTop: 1 }}>Inter-Client Settlement Receipt</div>
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
          }}>Settlement No.</div>
          <div style={{ fontSize: 18, fontWeight: 800, marginTop: 6, fontFamily: MONO, color: INK }}>
            {receiptNo}
          </div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 8 }}>
            <strong style={{ color: INK }}>Date:</strong> {fmtDate(s.transaction_date)}
          </div>
          <div style={{ fontSize: 11, color: SUB, marginTop: 2 }}>
            <strong style={{ color: INK }}>Time:</strong> {fmtTime(s.created_at)}
          </div>
        </div>
      </div>

      <div style={{ height: 4, background: ORANGE, borderRadius: 2, marginTop: 18 }} />
      <div style={{ height: 1, background: INK, marginTop: 2 }} />

      {/* ===== PARTIES ===== */}
      <SectionLabel>Parties</SectionLabel>
      <div style={{
        display: "grid", gridTemplateColumns: "1fr 60px 1fr", gap: 0,
        alignItems: "stretch",
        border: `1px solid ${LINE}`, borderRadius: 6, overflow: "hidden",
      }}>
        <PartyCell role="From Client" name={(s.from.client_code ? `${s.from.client_code} (${s.from.client_name})` : s.from.client_name)} subRef={receiptNo} />
        <div style={{
          display: "flex", alignItems: "center", justifyContent: "center",
          background: ORANGE_SOFT, color: ORANGE, fontSize: 22, fontWeight: 800,
          borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`,
        }}>→</div>
        <PartyCell role="To Client" name={(s.to.client_code ? `${s.to.client_code} (${s.to.client_name})` : s.to.client_name)} subRef={receiptNo} />
      </div>

      {/* ===== SETTLEMENT DETAILS ===== */}
      <SectionLabel>Settlement Details</SectionLabel>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        border: `1px solid ${LINE}`, tableLayout: "fixed",
      }}>
        <thead>
          <tr style={{ background: HEAD }}>
            <Th align="left" width="55%">Item</Th>
            <Th align="right">Value</Th>
          </tr>
        </thead>
        <tbody>
          <Row label="Settlement Type" value={isGold ? "Pure Gold Settlement" : "DA Settlement"} />
          {isGold ? (
            <Row label="Pure Gold Amount" value={fmtG(s.amount)} strong accent />
          ) : (
            <Row label="DA Amount" value={fmtDA(s.amount)} strong accent />
          )}
          {isGold && (
            <>
              <Row label="Weight @ 730 Purity" value={hasFee ? fmtG(s.weight_730) : "—"} />
              <Row label="Refinery Fee Price" value={hasFee ? `${num2(s.fee_price)} DA / g` : "—"} />
              <Row label="Total Refinery Fee" value={hasFee ? fmtDA(s.total_fee) : "—"} accent={hasFee} strong={hasFee} />
              <Row label="Fee Charged To" value={hasFee ? `${(s.to.client_code ? `${s.to.client_code} (${s.to.client_name})` : s.to.client_name)} (Receiving)` : "Not applied"} />
            </>
          )}
        </tbody>
      </table>

      {/* ===== HIGHLIGHT BOX for gold + fee ===== */}
      {hasFee && (
        <>
          <SectionLabel>Gold Settlement & Refining Fee Total</SectionLabel>
          <div style={{
            border: `2px solid ${ORANGE}`, borderRadius: 8,
            background: ORANGE_SOFT, padding: "22px 24px",
          }}>
            <div style={{
              display: "grid", gridTemplateColumns: "1fr 1px 1fr", alignItems: "center",
            }}>
              <div style={{ textAlign: "center", padding: "4px 12px" }}>
                <div style={{
                  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
                  color: SUB, fontWeight: 700, marginBottom: 8,
                }}>Pure Gold Transferred</div>
                <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: INK, letterSpacing: 0.3 }}>
                  {num2(s.amount)} g
                </div>
              </div>
              <div style={{ width: 1, height: 60, background: ORANGE, opacity: 0.35 }} />
              <div style={{ textAlign: "center", padding: "4px 12px" }}>
                <div style={{
                  fontSize: 10, letterSpacing: 2, textTransform: "uppercase",
                  color: ORANGE, fontWeight: 700, marginBottom: 8,
                }}>Total Refinery Fee</div>
                <div style={{ fontFamily: MONO, fontSize: 26, fontWeight: 800, color: ORANGE, letterSpacing: 0.3 }}>
                  {fmtDA(s.total_fee)}
                </div>
              </div>
            </div>
            <div style={{ height: 1, background: ORANGE, opacity: 0.25, margin: "18px 0 14px" }} />
            <div style={{
              fontSize: 9, letterSpacing: 2, textTransform: "uppercase",
              color: ORANGE, fontWeight: 700, marginBottom: 6, textAlign: "center",
            }}>Formula</div>
            <div style={{ fontFamily: MONO, fontSize: 13, color: INK, fontWeight: 600, textAlign: "center" }}>
              {num2(s.weight_730)} g  ×  {num2(s.fee_price)} DA/g  =  <span style={{ color: ORANGE, fontWeight: 800 }}>{fmtDA(s.total_fee)}</span>
            </div>
            <div style={{ fontSize: 10, color: SUB, textAlign: "center", marginTop: 4, fontStyle: "italic" }}>
              Weight @ 730 × Fee Price = Total Refinery Fee — charged to {(s.to.client_code ? `${s.to.client_code} (${s.to.client_name})` : s.to.client_name)}
            </div>
          </div>
        </>
      )}

      {/* ===== BALANCE MOVEMENT ===== */}
      <SectionLabel>Final Balance Movements</SectionLabel>
      <table style={{
        width: "100%", borderCollapse: "collapse",
        border: `1.5px solid ${INK}`, tableLayout: "fixed",
      }}>
        <thead>
          <tr style={{ background: HEAD }}>
            <Th align="left" width="22%">Client</Th>
            <Th align="left" width="14%">Account</Th>
            <Th align="right">Previous</Th>
            <Th align="right">Movement</Th>
            <Th align="right">New Balance</Th>
          </tr>
        </thead>
        <tbody>
          <BalRow client={(s.from.client_code ? `${s.from.client_code} (${s.from.client_name})` : s.from.client_name)} role="From" account="Gold" prev={s.from.previous_purity} delta={fromGoldDelta} next={s.from.new_purity} fmt={fmtG} />
          <BalRow client={(s.from.client_code ? `${s.from.client_code} (${s.from.client_name})` : s.from.client_name)} role="From" account="DA" prev={s.from.previous_da} delta={fromDaDelta} next={s.from.new_da} fmt={fmtDA} alt />
          <BalRow client={(s.to.client_code ? `${s.to.client_code} (${s.to.client_name})` : s.to.client_name)} role="To" account="Gold" prev={s.to.previous_purity} delta={toGoldDelta} next={s.to.new_purity} fmt={fmtG} divider />
          <BalRow client={(s.to.client_code ? `${s.to.client_code} (${s.to.client_name})` : s.to.client_name)} role="To" account="DA" prev={s.to.previous_da} delta={toDaDelta} next={s.to.new_da} fmt={fmtDA} alt />
        </tbody>
      </table>

      {/* ===== NOTES ===== */}
      {s.notes && (
        <>
          <SectionLabel>Notes</SectionLabel>
          <div style={{
            padding: 14, border: `1px solid ${LINE}`, borderRadius: 6,
            background: PAPER_ALT, fontSize: 12, color: INK, lineHeight: 1.6,
          }}>{s.notes}</div>
        </>
      )}

      {/* ===== AUDIT ===== */}
      <div style={{ marginTop: 18, fontSize: 10, color: SUB, fontStyle: "italic" }}>
        Created by {s.created_by_name ?? "—"} on {fmtDate(s.created_at)} at {fmtTime(s.created_at)}
      </div>

      {/* ===== SIGNATURES ===== */}
      <div style={{ marginTop: 40, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 28 }}>
        <Signature label="From Client" />
        <Signature label="To Client" />
        <Signature label="Authorized Signature" />
      </div>

      {/* ===== FOOTER ===== */}
      <div style={{ marginTop: 36, paddingTop: 14, borderTop: `2px solid ${INK}`, textAlign: "center" }}>
        <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: 2.5, color: INK }}>ATHER GROUP</div>
        <div style={{ fontSize: 10, color: SUB, marginTop: 2, letterSpacing: 0.5 }}>Refinery Management System</div>
        <div style={{ fontSize: 9, color: SUB, marginTop: 6, fontStyle: "italic" }}>
          Generated by ATHER DESK · This document is an official inter-client settlement receipt.
        </div>
      </div>
    </div>
  );

  function BalRow({
    client, role, account, prev, delta, next, fmt, alt, divider,
  }: {
    client: string; role: "From" | "To"; account: string;
    prev: number; delta: number; next: number;
    fmt: (n: number) => string; alt?: boolean; divider?: boolean;
  }) {
    return (
      <tr style={{
        background: alt ? PAPER_ALT : PAPER,
        borderTop: divider ? `1.5px solid ${INK}` : undefined,
      }}>
        <Td align="left" strong>
          {client}
          <div style={{ fontSize: 9, color: SUB, fontWeight: 500, marginTop: 1, letterSpacing: 1 }}>
            {role.toUpperCase()}
          </div>
        </Td>
        <Td align="left">{account}</Td>
        <Td align="right" mono>{fmt(prev)}</Td>
        <Td align="right" mono strong style={{ color: signedColor(delta) }}>
          {delta === 0 ? "—" : signedStr(delta, fmt)}
        </Td>
        <Td align="right" mono strong style={{ fontSize: 13 }}>{fmt(next)}</Td>
      </tr>
    );
  }
}

/* ----- primitives ----- */

function PartyCell({ role, name, subRef }: { role: string; name: string; subRef: string }) {
  return (
    <div style={{ padding: "16px 18px" }}>
      <div style={{
        fontSize: 9, letterSpacing: 1.6, textTransform: "uppercase",
        color: SUB, fontWeight: 700, marginBottom: 6,
      }}>{role}</div>
      <div style={{ fontSize: 18, fontWeight: 800, color: INK, lineHeight: 1.2 }}>{name}</div>
      <div style={{ fontSize: 10, color: SUB, marginTop: 6, fontFamily: MONO }}>Ref: {subRef}</div>
    </div>
  );
}

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
      textAlign: align, padding: "10px 12px", fontSize: 12, color: INK,
      fontFamily: mono ? MONO : undefined,
      fontWeight: strong ? 700 : 400,
      borderRight: `1px solid ${LINE_SOFT}`,
      borderBottom: `1px solid ${LINE_SOFT}`,
      ...style,
    }}>{children}</td>
  );
}

function Row({
  label, value, strong, accent,
}: { label: string; value: string; strong?: boolean; accent?: boolean }) {
  return (
    <tr style={{ background: accent ? ORANGE_SOFT : PAPER }}>
      <Td align="left" strong={strong}>{label}</Td>
      <Td align="right" mono strong={strong} style={{
        fontSize: strong ? 14 : 12,
        color: accent ? ORANGE : INK,
      }}>{value}</Td>
    </tr>
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
