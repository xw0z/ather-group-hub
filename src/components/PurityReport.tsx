import { useEffect, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import atherLogoAsset from "@/assets/ather-logo.asset.json";
import goldBarsImg from "@/assets/report-bars.png";
import badgeImg from "@/assets/report-badge.png";
import scaleImg from "@/assets/report-scale.png";
import lossImg from "@/assets/report-loss.png";


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
        border: "6px solid #C79A19",
        borderRadius: 36,
        boxSizing: "border-box",
        fontFamily: "Inter, system-ui, sans-serif",
        position: "relative",
      }}
    >
      {/* HEADER */}
      <header>
        {/* Single row: Logo (left) + Title (center) + Flag (right) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "220px 1fr 220px",
            alignItems: "center",
            gap: 40,
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifySelf: "center" }}>
            <img src={atherLogoAsset.url} alt="Ather" style={{ width: 172, height: "auto", display: "block" }} />
            <div style={{ marginTop: 18, fontSize: 22, fontWeight: 700, color: "#9a7b1f", letterSpacing: 1, lineHeight: 1.25, whiteSpace: "nowrap", textAlign: "center" }}>
              GOLD &amp; PRECIOUS METALS
            </div>
            <div style={{ marginTop: 10, fontSize: 16, letterSpacing: 2, color: "#9a7b1f", fontWeight: 600, whiteSpace: "nowrap", textAlign: "center" }}>
              TRUST • INTEGRITY • EXCELLENCE
            </div>
          </div>

          <div style={{ textAlign: "center" }}>
            <h1
              style={{
                fontFamily: "Cinzel, serif",
                fontSize: 119,
                letterSpacing: 6,
                color: "#B88A18",
                margin: "0 0 18px",
                fontWeight: 700,
                whiteSpace: "nowrap",
              }}
            >
              GOLD PURITY REPORT
            </h1>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 18, color: "#C79A19", fontSize: 30 }}>
              <span style={{ width: 120, height: 3, background: "#C79A19" }} />
              ◆
              <span style={{ width: 120, height: 3, background: "#C79A19" }} />
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifySelf: "center" }}>
            <svg viewBox="0 0 60 30" preserveAspectRatio="none" style={{ width: 172, height: 115, display: "block" }}>
              <rect width="15" height="30" fill="#ce1126" />
              <rect x="15" width="45" height="10" fill="#00732f" />
              <rect x="15" y="10" width="45" height="10" fill="#ffffff" />
              <rect x="15" y="20" width="45" height="10" fill="#000000" />
            </svg>
            <div style={{ marginTop: 16, fontSize: 24, color: "#444444", fontWeight: 500, lineHeight: 1.25, whiteSpace: "nowrap", textAlign: "center" }}>
              Dubai,<br />United Arab Emirates
            </div>
          </div>
        </div>
      </header>

      {/* TOP INFO — Client Code (left) + Report Date/Time/ID (right, near flag) */}
      <section style={{ marginTop: 130, display: "grid", gridTemplateColumns: "1fr auto", gap: 80, alignItems: "start" }}>
        <div>
          <div style={{ fontSize: 42, color: "#9a7b1f", fontWeight: 600, letterSpacing: 2, fontFamily: "Inter, system-ui, sans-serif" }}>
            CLIENT CODE
          </div>
          <div
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: 204,
              lineHeight: 0.95,
              marginTop: 18,
              color: "#1C2431",
              fontWeight: 400,
            }}
          >
            {data.clientCode}
          </div>
        </div>

        {/* Right: Report meta aligned to right edge under flag */}
        <div style={{ display: "grid", gap: 36, paddingTop: 20, justifySelf: "end" }}>
          <MetaRow icon={<CalendarIcon />} label="Report Date" value={data.reportDate} />
          <MetaRow icon={<ClockIcon />} label="Report Time (GST)" value={data.reportTime} />
          <MetaRow icon={<ShieldIcon />} label="Report ID" value={data.reportId} mono />
        </div>
      </section>

      {/* SUMMARY CARDS — strict equal grid, icon/label/value centered */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 48, marginTop: 110 }}>
        <SummaryCard icon={<AssetIcon src={goldBarsImg} alt="Bars" />} iconBg="#FFF7DF" label="BARS" value={String(data.barsCount)} />
        <SummaryCard icon={<AssetIcon src={scaleImg} alt="Scale" />} iconBg="#FFF7DF" label="TOTAL WEIGHT (g)" value={data.totalWeight} />
        <SummaryCard
          icon={<AssetIcon src={lossImg} alt="Loss" />}
          iconBg="#FFF0F0"
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
                  background: "#C79A19",
                  color: "white",
                  height: 120,
                  fontSize: 36,
                  fontWeight: 600,
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
          border: "4px solid #C79A19",
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
          <img
            src={goldBarsImg}
            alt="Gold bullion bars"
            width={561}
            crossOrigin="anonymous"
            style={{
              width: 561,
              height: "auto",
              display: "block",
              objectFit: "contain",
              filter: "drop-shadow(0 18px 22px rgba(120,85,10,0.35))",
            }}
          />
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontSize: 38, fontWeight: 700, color: "#555", letterSpacing: 4 }}>
            AMOUNT TO COMPENSATE
          </div>
          <div
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: 254,
              color: "#B88A18",
              lineHeight: 1,
              fontWeight: 700,
              marginTop: 20,
              letterSpacing: 1,
            }}
          >
            {data.totalLoss}
            <span style={{ fontSize: 90, marginLeft: 18, color: "#B88A18" }}>g</span>
          </div>

          <div style={{ fontFamily: '"Cormorant Garamond", serif', fontSize: 46, color: "#7a5f15", marginTop: 10, fontStyle: "italic" }}>
            of Pure Gold
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <img
            src={badgeImg}
            alt="Quality & Trust"
            width={396}
            crossOrigin="anonymous"
            style={{
              width: 396,
              height: "auto",
              display: "block",
              objectFit: "contain",
              filter: "drop-shadow(0 14px 18px rgba(120,85,10,0.30))",
            }}
          />
        </div>

      </section>

      {/* VERIFICATION */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 60,
          marginTop: 90,
          borderTop: "3px solid #C79A19",
          paddingTop: 60,
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
            <PseudoQR seed={data.reportId} size={120} />
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
      <div style={{ marginTop: 70, height: 2, background: "linear-gradient(90deg, transparent, #C79A19, transparent)" }} />
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

const ICON_GOLD = "#C79A19";


/* Lucide: calendar-days */
function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" width={66} height={66} fill="none" stroke={ICON_GOLD} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M8 2v4M16 2v4" />
      <rect width="18" height="18" x="3" y="4" rx="2" />
      <path d="M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

/* Lucide: clock */
function ClockIcon() {
  return (
    <svg viewBox="0 0 24 24" width={66} height={66} fill="none" stroke={ICON_GOLD} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

/* Lucide: shield-check */
function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" width={66} height={66} fill="none" stroke={ICON_GOLD} strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}




const cellStyle: React.CSSProperties = {
  height: 174,
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

function AssetIcon({ src, alt, size = 180 }: { src: string; alt: string; size?: number }) {
  return (
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      crossOrigin="anonymous"
      style={{ width: size, height: size, objectFit: "contain", display: "block" }}
    />
  );
}

function SummaryCard({
  icon,
  iconBg,
  label,
  value,
  variant,
}: {
  icon: ReactElement;
  iconBg: string;
  label: string;
  value: string;
  variant?: "red" | "green" | "";
}) {
  return (
    <div
      style={{
        minHeight: 540,
        background: "#ffffff",
        border: "2px solid #eadfbd",
        borderRadius: 54,
        boxShadow: "0 25px 70px rgba(0,0,0,0.08)",
        padding: 72,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "space-between",
        textAlign: "center",
      }}
    >
      <div
        style={{
          width: 200,
          height: 200,
          borderRadius: "50%",
          background: iconBg,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        {icon}
      </div>
      <div style={{ fontSize: 34, fontWeight: 700, color: "#555", letterSpacing: 2 }}>{label}</div>
      <strong
        style={{
          fontSize: 126,
          fontWeight: 800,
          color: variant === "red" ? "#d33c2d" : variant === "green" ? "#0e8f55" : "#1c2431",
          fontFamily: "Inter, system-ui, sans-serif",
          letterSpacing: 1,
          lineHeight: 1,
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
    scale: opts.scale ?? 6,
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
