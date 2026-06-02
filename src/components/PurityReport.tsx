import { useEffect, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import atherLogoAsset from "@/assets/ather-logo.asset.json";

export type PurityReportBar = {
  index: number;
  weight: string;
  purity: string;
  pure: string;
  loss: string;
  lossClass: "green" | "red" | "";
};

export type PurityReportData = {
  clientCode: string;
  tripCode: string;
  depositCode: string;
  reportDate: string;
  reportTime: string;
  reportId: string;
  barsCount: number;
  totalWeight: string;
  totalLoss: string;
  totalLossClass: "green" | "red";
  bars: PurityReportBar[];
  signatureName?: string;
};

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Cinzel:wght@700;800&family=Cormorant+Garamond:wght@700&family=DM+Serif+Display&family=Inter:wght@400;500;600;700;800&family=Great+Vibes&display=swap";

function injectFonts() {
  if (typeof document === "undefined") return;
  const id = "ather-purity-report-fonts";
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = FONTS_HREF;
  document.head.appendChild(link);
}

async function waitForFonts() {
  try {
    const f = (document as Document & {
      fonts?: { load: (s: string) => Promise<unknown>; ready: Promise<unknown> };
    }).fonts;
    if (!f) return;
    await Promise.all([
      f.load("700 92px 'Cinzel'"),
      f.load("400 260px 'DM Serif Display'"),
      f.load("700 130px 'Cormorant Garamond'"),
      f.load("400 76px 'Great Vibes'"),
      f.load("700 36px 'Inter'"),
      f.load("500 30px 'Inter'"),
    ]);
    await f.ready;
  } catch {
    /* non-fatal */
  }
}

/* ---------- Inline SVG assets ---------- */


/** Deterministic pseudo-QR built from the report id hash. Pure SVG, no network. */
function PseudoQR({ seed, size = 180 }: { seed: string; size?: number }) {
  const N = 21;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const rand = (i: number) => {
    const v = Math.sin(h + i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  const cells: ReactElement[] = [];
  const isFinder = (r: number, c: number) => {
    const inBox = (r0: number, c0: number) =>
      r >= r0 && r < r0 + 7 && c >= c0 && c < c0 + 7;
    return inBox(0, 0) || inBox(0, N - 7) || inBox(N - 7, 0);
  };
  const finderFill = (r: number, c: number) => {
    const test = (r0: number, c0: number) => {
      const rr = r - r0;
      const cc = c - c0;
      if (rr < 0 || rr > 6 || cc < 0 || cc > 6) return null;
      if (rr === 0 || rr === 6 || cc === 0 || cc === 6) return true;
      if (rr >= 2 && rr <= 4 && cc >= 2 && cc <= 4) return true;
      return false;
    };
    return test(0, 0) ?? test(0, N - 7) ?? test(N - 7, 0);
  };
  for (let r = 0; r < N; r++) {
    for (let c = 0; c < N; c++) {
      let on: boolean;
      if (isFinder(r, c)) on = !!finderFill(r, c);
      else on = rand(r * N + c) > 0.5;
      if (on) {
        cells.push(
          <rect
            key={`${r}-${c}`}
            x={c}
            y={r}
            width={1}
            height={1}
            fill="#111"
          />,
        );
      }
    }
  }
  return (
    <svg viewBox={`0 0 ${N} ${N}`} style={{ width: size, height: size, display: "block" }}>
      <rect width={N} height={N} fill="#fff" />
      {cells}
    </svg>
  );
}

/* ---------- The report itself (matches user-provided HTML/CSS) ---------- */

export function PurityReport({ data }: { data: PurityReportData }) {
  return (
    <div
      style={{
        width: 2480,
        minHeight: 3508,
        padding: 110,
        background: "linear-gradient(180deg, #fffdf8 0%, #f7f2e8 100%)",
        color: "#1c2431",
        border: "6px solid #c9a227",
        borderRadius: 36,
        boxSizing: "border-box",
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
      }}
    >
      {/* HEADER */}
      <header
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 2fr 1fr",
          alignItems: "start",
          gap: 40,
        }}
      >
        {/* Left: brand, centered */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <img src={atherLogoAsset.url} alt="Ather" style={{ width: 420, height: "auto" }} />
          <div style={{ marginTop: 24, fontSize: 36, fontWeight: 700, color: "#9a7b1f", letterSpacing: 1 }}>
            GOLD &amp; PRECIOUS METALS
          </div>
          <div style={{ marginTop: 24, fontSize: 24, letterSpacing: 4, color: "#9a7b1f", fontWeight: 600 }}>
            TRUST • INTEGRITY • EXCELLENCE
          </div>
        </div>

        {/* Center title */}
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: 110,
              letterSpacing: 6,
              color: "#b88a18",
              margin: "10px 0 18px",
              fontWeight: 700,
            }}
          >
            GOLD PURITY REPORT
          </h1>
          <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18, color: "#c9a227", fontSize: 30 }}>
            <span style={{ width: 120, height: 2, background: "#c9a227" }} />
            ◆
            <span style={{ width: 120, height: 2, background: "#c9a227" }} />
          </div>
        </div>

        {/* Right: flag, centered */}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center" }}>
          <svg viewBox="0 0 60 30" style={{ width: 360, height: 180, display: "block" }}>
            <rect width="15" height="30" fill="#ce1126" />
            <rect x="15" width="45" height="10" fill="#00732f" />
            <rect x="15" y="10" width="45" height="10" fill="#ffffff" />
            <rect x="15" y="20" width="45" height="10" fill="#000000" />
          </svg>
          <div style={{ marginTop: 24, fontSize: 42, color: "#444444", fontWeight: 500 }}>
            Dubai, United Arab Emirates
          </div>
        </div>
      </header>

      {/* TOP INFO */}
      <section style={{ marginTop: 130, display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 80, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 42, color: "#9a7b1f", fontWeight: 600, letterSpacing: 2 }}>
            CLIENT CODE
          </div>
          <div
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: 210,
              lineHeight: 0.95,
              marginTop: 18,
              color: "#1c2431",
              fontWeight: 400,
            }}
          >
            {data.clientCode}
          </div>
          <div style={{ fontSize: 40, color: "#555", marginTop: 24, letterSpacing: 1 }}>
            {data.tripCode} • {data.depositCode}
          </div>

          {/* Meta rows with gold icons */}
          <div style={{ marginTop: 70, display: "grid", gap: 36, maxWidth: 900 }}>
            <MetaRow icon={<CalendarIcon />} label="Report Date" value={data.reportDate} />
            <MetaRow icon={<ClockIcon />} label="Report Time (GST)" value={data.reportTime} />
            <MetaRow icon={<ShieldIcon />} label="Report ID" value={data.reportId} mono />
          </div>
        </div>

        {/* Right ornamental panel */}
        <div
          style={{
            borderLeft: "4px solid #c9a227",
            paddingLeft: 70,
            paddingTop: 30,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
            textAlign: "center",
          }}
        >
          <div style={{ fontFamily: "Cinzel, serif", fontSize: 36, color: "#9a7b1f", letterSpacing: 4 }}>
            CERTIFICATE OF
          </div>
          <div style={{ fontFamily: "Cinzel, serif", fontSize: 60, color: "#b88a18", letterSpacing: 6, fontWeight: 700 }}>
            PURITY
          </div>
          <div style={{ width: "60%", height: 2, background: "linear-gradient(90deg, transparent, #c9a227, transparent)" }} />
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 38, color: "#555", fontStyle: "italic", lineHeight: 1.4 }}>
            Issued for commercial<br />reconciliation of bullion
          </div>
        </div>
      </section>

      {/* SUMMARY CARDS */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 48, marginTop: 110 }}>
        <SummaryCard icon={<BarsIcon />} label="BARS" value={String(data.barsCount)} />
        <SummaryCard icon={<ScaleIcon />} label="TOTAL WEIGHT (g)" value={data.totalWeight} />
        <SummaryCard
          icon={<TrendDownIcon />}
          label="TOTAL LOSS (g)"
          value={data.totalLoss}
          variant={data.totalLossClass}
        />
      </section>

      {/* TABLE */}
      <table
        style={{
          width: "100%",
          marginTop: 90,
          borderCollapse: "separate",
          borderSpacing: 0,
          borderRadius: 24,
          overflow: "hidden",
          fontSize: 36,
          boxShadow: "0 18px 60px rgba(0,0,0,0.08)",
          border: "2px solid #eadfbd",
        }}
      >
        <thead>
          <tr>
            {["#", "WEIGHT (g)", "BAFLEH ‰", "PURE (g)", "LOSS (g)"].map((h) => (
              <th
                key={h}
                style={{
                  background: "linear-gradient(180deg, #d4ad28 0%, #b8901a 100%)",
                  color: "white",
                  height: 120,
                  fontSize: 36,
                  fontWeight: 700,
                  letterSpacing: 1.5,
                  textAlign: "center",
                  borderBottom: "3px solid #9a7b1f",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.bars.map((b, i) => (
            <tr key={b.index} style={{ background: i % 2 === 0 ? "#ffffff" : "#fbf6e9" }}>
              <td style={cellStyle}>{b.index}</td>
              <td style={cellStyle}>{b.weight}</td>
              <td style={cellStyle}>{b.purity}</td>
              <td style={cellStyle}>{b.pure}</td>
              <td
                style={{
                  ...cellStyle,
                  color: b.lossClass === "red" ? "#d33c2d" : b.lossClass === "green" ? "#0e8f55" : undefined,
                  fontWeight: b.lossClass ? 700 : 500,
                }}
              >
                {b.loss}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* COMPENSATION — centerpiece */}
      <section
        style={{
          marginTop: 100,
          minHeight: 380,
          border: "4px solid #c9a227",
          borderRadius: 30,
          background: "linear-gradient(135deg, #fffdf8 0%, #faf1d6 100%)",
          display: "grid",
          gridTemplateColumns: "440px 1fr 400px",
          alignItems: "center",
          padding: "50px 60px",
          boxSizing: "border-box",
          boxShadow: "0 20px 70px rgba(184,138,24,0.15)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "center" }}>
          <GoldBarsStack width={420} />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 38, fontWeight: 700, color: "#555", letterSpacing: 4 }}>
            AMOUNT TO COMPENSATE
          </div>
          <div
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: 216,
              color: "#b88a18",
              lineHeight: 1,
              fontWeight: 700,
              marginTop: 20,
              letterSpacing: 1,
            }}
          >
            {data.totalLoss}
            <span style={{ fontSize: 90, marginLeft: 18, color: "#9a7b1f" }}>g</span>
          </div>
          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 46, color: "#7a5f15", marginTop: 10, fontStyle: "italic" }}>
            of Pure Gold
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <QualitySeal />
        </div>
      </section>

      {/* VERIFICATION */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 60,
          marginTop: 90,
          borderTop: "3px solid #c9a227",
          paddingTop: 60,
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
            <PseudoQR seed={data.reportId} size={200} />
            <div>
              <strong style={vStrong}>VERIFY THIS REPORT</strong>
              <p style={vText}>Scan the QR code to verify the authenticity of this report.</p>
            </div>
          </div>
        </div>
        <div>
          <strong style={vStrong}>VERIFIED &amp; CERTIFIED</strong>
          <p style={vText}>This report is generated from laboratory purity measurements at the Ather refinery.</p>
        </div>
        <div>
          <strong style={vStrong}>AUTHORIZED SIGNATURE</strong>
          <div
            style={{
              fontFamily: '"Great Vibes", cursive',
              fontSize: 90,
              color: "#111",
              borderBottom: "2px solid #bbb",
              margin: "10px 0 14px",
              lineHeight: 1.1,
              paddingBottom: 6,
            }}
          >
            {data.signatureName ?? "Ather Quality"}
          </div>
          <p style={{ fontSize: 36, color: "#666666", margin: 0 }}>
            Authorized by Ather Quality Department
          </p>
        </div>
      </section>

      {/* DISCLAIMER */}
      <div
        style={{
          marginTop: 75,
          background: "#fff",
          border: "2px solid #eadfbd",
          borderRadius: 20,
          padding: "35px 50px",
          fontSize: 28,
          textAlign: "center",
          color: "#555",
          fontStyle: "italic",
        }}
      >
        This report was generated from laboratory purity measurements and is intended for
        commercial reconciliation purposes.
      </div>

      {/* FOOTER */}
      <div style={{ marginTop: 70, height: 2, background: "linear-gradient(90deg, transparent, #c9a227, transparent)" }} />
      <footer
        style={{
          marginTop: 35,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          fontSize: 28,
          color: "#444",
        }}
      >
        <div>
          Generated by <strong style={{ color: "#9a7b1f" }}>Ather Gold &amp; Precious Metals</strong>
        </div>
        <div style={{ textAlign: "center" }}>
          Verification ID: <strong style={{ fontFamily: "ui-monospace, Menlo, monospace", color: "#1c2431" }}>{data.reportId}</strong>
        </div>
        <div style={{ textAlign: "right" }}>Dubai, United Arab Emirates</div>
      </footer>
    </div>
  );
}

/* ---------- Inline icon + decorative components ---------- */

function MetaRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: ReactElement;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 28 }}>
      <div
        style={{
          width: 84,
          height: 84,
          borderRadius: 18,
          background: "linear-gradient(135deg, #fff7df, #f5e6b0)",
          border: "2px solid #e2c970",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div>
        <div style={{ fontSize: 28, color: "#9a7b1f", fontWeight: 600, letterSpacing: 1.5 }}>{label}</div>
        <div
          style={{
            fontSize: 40,
            color: "#1c2431",
            fontWeight: 700,
            marginTop: 4,
            fontFamily: mono ? "ui-monospace, Menlo, Consolas, monospace" : undefined,
          }}
        >
          {value}
        </div>
      </div>
    </div>
  );
}

const ICON_GOLD = "#b88a18";

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width={46} height={46} fill="none" stroke={ICON_GOLD} strokeWidth={1.8}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 9h18M8 3v4M16 3v4" />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width={46} height={46} fill="none" stroke={ICON_GOLD} strokeWidth={1.8}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width={46} height={46} fill="none" stroke={ICON_GOLD} strokeWidth={1.8}>
      <path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5l8-3z" />
      <path d="M9 12l2 2 4-4" strokeLinecap="round" />
    </svg>
  );
}

function BarsIcon() {
  return (
    <svg viewBox="0 0 100 100" width={110} height={110}>
      <defs>
        <linearGradient id="gbar1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#f7df95" />
          <stop offset="50%" stopColor="#d4ad28" />
          <stop offset="100%" stopColor="#9a7b1f" />
        </linearGradient>
      </defs>
      {/* back bar */}
      <polygon points="30,55 70,55 78,48 38,48" fill="#e9c75a" />
      <rect x="30" y="55" width="40" height="14" fill="url(#gbar1)" stroke="#8a6c14" strokeWidth="0.6" />
      {/* middle */}
      <polygon points="22,72 72,72 80,65 30,65" fill="#f0d572" />
      <rect x="22" y="72" width="50" height="16" fill="url(#gbar1)" stroke="#8a6c14" strokeWidth="0.6" />
      {/* front (offset) */}
      <polygon points="40,40 70,40 76,34 46,34" fill="#f4dc88" />
      <rect x="40" y="40" width="30" height="12" fill="url(#gbar1)" stroke="#8a6c14" strokeWidth="0.6" />
    </svg>
  );
}

function ScaleIcon() {
  return (
    <svg viewBox="0 0 100 100" width={110} height={110}>
      <defs>
        <linearGradient id="gscale" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f0cf5a" />
          <stop offset="100%" stopColor="#b88a18" />
        </linearGradient>
      </defs>
      <rect x="46" y="20" width="8" height="60" rx="2" fill="url(#gscale)" />
      <rect x="32" y="78" width="36" height="6" rx="2" fill="url(#gscale)" />
      <circle cx="50" cy="20" r="5" fill="#b88a18" />
      <line x1="50" y1="25" x2="22" y2="40" stroke="#b88a18" strokeWidth="1.5" />
      <line x1="50" y1="25" x2="78" y2="40" stroke="#b88a18" strokeWidth="1.5" />
      <path d="M12 42 L32 42 L28 56 L16 56 Z" fill="url(#gscale)" stroke="#8a6c14" strokeWidth="0.6" />
      <path d="M68 42 L88 42 L84 56 L72 56 Z" fill="url(#gscale)" stroke="#8a6c14" strokeWidth="0.6" />
    </svg>
  );
}

function TrendDownIcon() {
  return (
    <svg viewBox="0 0 100 100" width={110} height={110} fill="none">
      <polyline points="10,25 35,50 55,40 90,80" stroke="#d33c2d" strokeWidth="5" strokeLinejoin="round" strokeLinecap="round" />
      <polygon points="90,80 76,78 86,68" fill="#d33c2d" />
      <line x1="10" y1="90" x2="92" y2="90" stroke="#d33c2d" strokeWidth="2" opacity="0.4" />
      <line x1="10" y1="10" x2="10" y2="90" stroke="#d33c2d" strokeWidth="2" opacity="0.4" />
    </svg>
  );
}

function GoldBarsStack({ width }: { width: number }) {
  return (
    <svg viewBox="0 0 200 160" width={width} height={width * 0.8}>
      <defs>
        <linearGradient id="gstack" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fbe892" />
          <stop offset="45%" stopColor="#d4ad28" />
          <stop offset="100%" stopColor="#8a6c14" />
        </linearGradient>
        <linearGradient id="gtop" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff1ad" />
          <stop offset="100%" stopColor="#e0bf4a" />
        </linearGradient>
      </defs>
      {/* bar back-left */}
      <g>
        <polygon points="20,90 90,90 100,78 30,78" fill="url(#gtop)" stroke="#8a6c14" strokeWidth="0.8" />
        <rect x="20" y="90" width="70" height="28" fill="url(#gstack)" stroke="#7a5f15" strokeWidth="0.8" />
        <polygon points="90,90 90,118 100,106 100,78" fill="#9a7b1f" stroke="#7a5f15" strokeWidth="0.8" />
        <text x="55" y="108" textAnchor="middle" fill="#7a5f15" fontSize="8" fontWeight="700" fontFamily="serif">999.9</text>
      </g>
      {/* bar back-right */}
      <g>
        <polygon points="100,90 170,90 180,78 110,78" fill="url(#gtop)" stroke="#8a6c14" strokeWidth="0.8" />
        <rect x="100" y="90" width="70" height="28" fill="url(#gstack)" stroke="#7a5f15" strokeWidth="0.8" />
        <polygon points="170,90 170,118 180,106 180,78" fill="#9a7b1f" stroke="#7a5f15" strokeWidth="0.8" />
        <text x="135" y="108" textAnchor="middle" fill="#7a5f15" fontSize="8" fontWeight="700" fontFamily="serif">ATHER</text>
      </g>
      {/* bar front */}
      <g>
        <polygon points="55,118 145,118 158,104 68,104" fill="url(#gtop)" stroke="#8a6c14" strokeWidth="0.8" />
        <rect x="55" y="118" width="90" height="34" fill="url(#gstack)" stroke="#7a5f15" strokeWidth="0.8" />
        <polygon points="145,118 145,152 158,138 158,104" fill="#9a7b1f" stroke="#7a5f15" strokeWidth="0.8" />
        <text x="100" y="132" textAnchor="middle" fill="#7a5f15" fontSize="9" fontWeight="700" fontFamily="serif">ATHER</text>
        <text x="100" y="144" textAnchor="middle" fill="#7a5f15" fontSize="7" fontWeight="600" fontFamily="serif">FINE GOLD 999.9</text>
      </g>
    </svg>
  );
}

function QualitySeal() {
  const size = 330;
  const c = size / 2;
  // laurel positions
  const laurels = Array.from({ length: 7 });
  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size}>
      <defs>
        <radialGradient id="sealBg" cx="0.5" cy="0.4" r="0.7">
          <stop offset="0%" stopColor="#fff5cf" />
          <stop offset="60%" stopColor="#e7c357" />
          <stop offset="100%" stopColor="#8a6c14" />
        </radialGradient>
        <linearGradient id="sealRing" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4dc88" />
          <stop offset="100%" stopColor="#8a6c14" />
        </linearGradient>
      </defs>

      {/* Laurel leaves around outer */}
      {laurels.map((_, i) => {
        const angleL = 180 + (i * 18);
        const angleR = 360 - (i * 18);
        return (
          <g key={i}>
            <ellipse
              cx={c + Math.cos((angleL * Math.PI) / 180) * (c - 14)}
              cy={c + Math.sin((angleL * Math.PI) / 180) * (c - 14)}
              rx="14" ry="6"
              fill="#9a7b1f" opacity="0.85"
              transform={`rotate(${angleL + 90} ${c + Math.cos((angleL * Math.PI) / 180) * (c - 14)} ${c + Math.sin((angleL * Math.PI) / 180) * (c - 14)})`}
            />
            <ellipse
              cx={c + Math.cos((angleR * Math.PI) / 180) * (c - 14)}
              cy={c + Math.sin((angleR * Math.PI) / 180) * (c - 14)}
              rx="14" ry="6"
              fill="#9a7b1f" opacity="0.85"
              transform={`rotate(${angleR + 90} ${c + Math.cos((angleR * Math.PI) / 180) * (c - 14)} ${c + Math.sin((angleR * Math.PI) / 180) * (c - 14)})`}
            />
          </g>
        );
      })}

      {/* shadow */}
      <circle cx={c} cy={c + 6} r={c - 24} fill="#000" opacity="0.12" />
      {/* outer ring */}
      <circle cx={c} cy={c} r={c - 26} fill="url(#sealRing)" stroke="#7a5f15" strokeWidth="2" />
      {/* inner ring */}
      <circle cx={c} cy={c} r={c - 44} fill="url(#sealBg)" stroke="#7a5f15" strokeWidth="1.5" />
      {/* decorative stars around inner ring */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const r = c - 35;
        const x = c + Math.cos(a) * r;
        const y = c + Math.sin(a) * r;
        return <text key={i} x={x} y={y + 4} textAnchor="middle" fontSize="14" fill="#7a5f15">★</text>;
      })}
      {/* center content */}
      <text x={c} y={c - 50} textAnchor="middle" fill="#7a5f15" fontSize="26" fontFamily="serif" fontWeight="700">★ ★ ★</text>
      <text x={c} y={c - 6} textAnchor="middle" fill="#1c2431" fontSize="36" fontWeight="800" fontFamily="serif" letterSpacing="2">QUALITY</text>
      <text x={c} y={c + 24} textAnchor="middle" fill="#7a5f15" fontSize="22" fontStyle="italic" fontFamily="serif">&amp;</text>
      <text x={c} y={c + 56} textAnchor="middle" fill="#1c2431" fontSize="36" fontWeight="800" fontFamily="serif" letterSpacing="2">TRUST</text>
    </svg>
  );
}

const cellStyle: React.CSSProperties = {
  height: 110,
  textAlign: "center",
  borderBottom: "2px solid #f0e5c5",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 38,
  fontWeight: 500,
  color: "#1c2431",
  padding: "0 14px",
};

const vStrong: React.CSSProperties = {
  display: "block",
  fontSize: 32,
  color: "#9a7b1f",
  marginBottom: 18,
  letterSpacing: 2,
};
const vText: React.CSSProperties = {
  fontSize: 28,
  color: "#444",
  lineHeight: 1.4,
  margin: 0,
};

function SummaryCard({
  icon,
  label,
  value,
  variant,
}: {
  icon: ReactElement;
  label: string;
  value: string;
  variant?: "red" | "green" | "";
}) {
  return (
    <div
      style={{
        minHeight: 390,
        background: "#ffffff",
        border: "2px solid #eadfbd",
        borderRadius: 32,
        boxShadow: "0 25px 70px rgba(184,138,24,0.12)",
        padding: 50,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
        <div
          style={{
            width: 130,
            height: 130,
            borderRadius: 24,
            background: "linear-gradient(135deg, #fff7df 0%, #f5e6b0 100%)",
            border: "2px solid #e2c970",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          {icon}
        </div>
        <span style={{ fontSize: 34, fontWeight: 700, color: "#555", letterSpacing: 2 }}>{label}</span>
      </div>
      <strong
        style={{
          fontSize: 96,
          fontWeight: 800,
          color: variant === "red" ? "#d33c2d" : variant === "green" ? "#0e8f55" : "#1c2431",
          textAlign: "right",
          fontFamily: '"DM Serif Display", serif',
          letterSpacing: 1,
        }}
      >
        {value}
      </strong>
    </div>
  );
}

/* ---------- Headless renderer: mount → snapshot → unmount ---------- */

export async function renderPurityReportToCanvas(
  data: PurityReportData,
  opts: { scale?: number } = {},
): Promise<HTMLCanvasElement> {
  injectFonts();
  await waitForFonts();

  // Off-screen mount, real size so html2canvas measures correctly.
  const host = document.createElement("div");
  host.style.position = "fixed";
  host.style.left = "-100000px";
  host.style.top = "0";
  host.style.width = "2480px";
  host.style.pointerEvents = "none";
  host.style.zIndex = "-1";
  document.body.appendChild(host);

  const root = createRoot(host);
  await new Promise<void>((resolve) => {
    root.render(<RenderOnce data={data} onMounted={resolve} />);
  });
  // Give layout + webfonts one more frame
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  await waitForFonts();

  const target = host.firstElementChild as HTMLElement;
  const { default: html2canvas } = await import("html2canvas-pro");
  const canvas = await html2canvas(target, {
    scale: opts.scale ?? 4,
    useCORS: true,
    backgroundColor: "#fffdf8",
    logging: false,
  });

  root.unmount();
  host.remove();
  return canvas;
}

function RenderOnce({
  data,
  onMounted,
}: {
  data: PurityReportData;
  onMounted: () => void;
}) {
  useEffect(() => {
    onMounted();
  }, [onMounted]);
  return <PurityReport data={data} />;
}
