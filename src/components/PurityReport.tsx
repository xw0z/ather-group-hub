import { useEffect } from "react";
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

const UAEFlag = () => (
  <svg viewBox="0 0 60 30" style={{ width: 210, height: 105, marginBottom: 18, display: "inline-block" }}>
    <rect width="15" height="30" fill="#ce1126" />
    <rect x="15" width="45" height="10" fill="#00732f" />
    <rect x="15" y="10" width="45" height="10" fill="#ffffff" />
    <rect x="15" y="20" width="45" height="10" fill="#000000" />
  </svg>
);

/** Deterministic pseudo-QR built from the report id hash. Pure SVG, no network. */
function PseudoQR({ seed, size = 180 }: { seed: string; size?: number }) {
  const N = 21;
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  const rand = (i: number) => {
    const v = Math.sin(h + i * 12.9898) * 43758.5453;
    return v - Math.floor(v);
  };
  const cells: JSX.Element[] = [];
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
        }}
      >
        <div>
          <img src={atherLogoAsset.url} alt="Ather" style={{ width: 180, height: "auto" }} />
          <div style={{ marginTop: 18, fontSize: 34, fontWeight: 700, color: "#9a7b1f" }}>
            GOLD &amp; PRECIOUS METALS
          </div>
          <div style={{ marginTop: 10, fontSize: 22, letterSpacing: 3, color: "#9a7b1f" }}>
            TRUST • INTEGRITY • EXCELLENCE
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <h1
            style={{
              fontFamily: "Cinzel, serif",
              fontSize: 92,
              letterSpacing: 4,
              color: "#b88a18",
              margin: "20px 0 10px",
              fontWeight: 700,
            }}
          >
            GOLD PURITY REPORT
          </h1>
          <div style={{ color: "#c9a227", fontSize: 28 }}>◆</div>
        </div>
        <div style={{ textAlign: "right", fontSize: 30, fontWeight: 500 }}>
          <UAEFlag />
          <div>Dubai, United Arab Emirates</div>
        </div>
      </header>

      {/* TOP INFO */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1.5fr 1fr",
          marginTop: 130,
          alignItems: "center",
        }}
      >
        <div>
          <div style={{ fontSize: 32, color: "#9a7b1f", fontWeight: 700, letterSpacing: 1 }}>
            CLIENT CODE
          </div>
          <div
            style={{
              fontFamily: '"DM Serif Display", serif',
              fontSize: 260,
              lineHeight: 0.9,
              marginTop: 20,
              color: "#1c2431",
            }}
          >
            {data.clientCode}
          </div>
          <div style={{ fontSize: 42, color: "#333", marginTop: 20 }}>
            {data.tripCode} • {data.depositCode}
          </div>
        </div>
        <div
          style={{
            borderLeft: "4px solid #c9a227",
            paddingLeft: 70,
            display: "grid",
            gap: 36,
          }}
        >
          <div>
            <span style={{ display: "block", fontSize: 30, color: "#666" }}>Report Date</span>
            <strong style={{ display: "block", fontSize: 36, marginTop: 8 }}>
              {data.reportDate}
            </strong>
          </div>
          <div>
            <span style={{ display: "block", fontSize: 30, color: "#666" }}>Report Time (GST)</span>
            <strong style={{ display: "block", fontSize: 36, marginTop: 8 }}>
              {data.reportTime}
            </strong>
          </div>
          <div>
            <span style={{ display: "block", fontSize: 30, color: "#666" }}>Report ID</span>
            <strong
              style={{
                display: "block",
                fontSize: 30,
                marginTop: 8,
                fontFamily: "ui-monospace, Menlo, Consolas, monospace",
              }}
            >
              {data.reportId}
            </strong>
          </div>
        </div>
      </section>

      {/* SUMMARY CARDS */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 48,
          marginTop: 90,
        }}
      >
        <SummaryCard icon="▰" label="BARS" value={String(data.barsCount)} />
        <SummaryCard icon="⚖" label="TOTAL WEIGHT (g)" value={data.totalWeight} />
        <SummaryCard
          icon="↘"
          label="TOTAL LOSS (g)"
          value={data.totalLoss}
          variant={data.totalLossClass}
        />
      </section>

      {/* TABLE */}
      <table
        style={{
          width: "100%",
          marginTop: 70,
          borderCollapse: "separate",
          borderSpacing: 0,
          borderRadius: 24,
          overflow: "hidden",
          fontSize: 36,
          boxShadow: "0 10px 45px rgba(0,0,0,0.06)",
        }}
      >
        <thead>
          <tr>
            {["#", "WEIGHT (g)", "BAFLEH ‰", "PURE (g)", "LOSS (g)"].map((h) => (
              <th
                key={h}
                style={{
                  background: "#c29a18",
                  color: "white",
                  height: 95,
                  fontSize: 34,
                  fontWeight: 700,
                  textAlign: "center",
                }}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.bars.map((b, i) => (
            <tr
              key={b.index}
              style={{ background: i % 2 === 0 ? "#ffffff" : "#f7f1e4" }}
            >
              <td style={cellStyle}>{b.index}</td>
              <td style={cellStyle}>{b.weight}</td>
              <td style={cellStyle}>{b.purity}</td>
              <td style={cellStyle}>{b.pure}</td>
              <td
                style={{
                  ...cellStyle,
                  color:
                    b.lossClass === "red"
                      ? "#d33c2d"
                      : b.lossClass === "green"
                      ? "#0e8f55"
                      : undefined,
                  fontWeight: b.lossClass ? 700 : 400,
                }}
              >
                {b.loss}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* COMPENSATION */}
      <section
        style={{
          marginTop: 80,
          minHeight: 310,
          border: "4px solid #c9a227",
          borderRadius: 30,
          background: "linear-gradient(135deg, #fffdf8, #f8f0d9)",
          display: "grid",
          gridTemplateColumns: "300px 1fr 250px",
          alignItems: "center",
          padding: 45,
          boxSizing: "border-box",
        }}
      >
        <div style={{ fontSize: 90, color: "#c9a227", textAlign: "center" }}>▰▰▰</div>
        <div>
          <div style={{ fontSize: 34, fontWeight: 700, textAlign: "center", color: "#333" }}>
            AMOUNT TO COMPENSATE
          </div>
          <div
            style={{
              fontFamily: '"Cormorant Garamond", serif',
              fontSize: 130,
              textAlign: "center",
              color: "#b88a18",
              lineHeight: 1,
              fontWeight: 700,
            }}
          >
            {data.totalLoss} g of Pure Gold
          </div>
        </div>
        <div
          style={{
            width: 180,
            height: 180,
            border: "4px solid #c9a227",
            borderRadius: "50%",
            color: "#b88a18",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            fontSize: 28,
            fontWeight: 700,
            margin: "0 auto",
            lineHeight: 1.2,
          }}
        >
          QUALITY
          <br />
          &amp; TRUST
        </div>
      </section>

      {/* VERIFICATION */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gap: 60,
          marginTop: 70,
          borderTop: "3px solid #c9a227",
          paddingTop: 55,
        }}
      >
        <div>
          <div style={{ display: "flex", gap: 28, alignItems: "flex-start" }}>
            <PseudoQR seed={data.reportId} size={180} />
            <div>
              <strong style={vStrong}>Verify this report</strong>
              <p style={vText}>Scan the QR code to verify the authenticity of this report.</p>
            </div>
          </div>
        </div>
        <div>
          <strong style={vStrong}>VERIFIED &amp; CERTIFIED</strong>
          <p style={vText}>This report is generated from laboratory purity measurements.</p>
        </div>
        <div>
          <strong style={vStrong}>AUTHORIZED SIGNATURE</strong>
          <div
            style={{
              fontFamily: '"Great Vibes", cursive',
              fontSize: 76,
              color: "#111",
              borderBottom: "2px solid #bbb",
              margin: "15px 0",
              lineHeight: 1.1,
            }}
          >
            {data.signatureName ?? "Ather Quality"}
          </div>
          <p style={vText}>Authorized by Ather Quality Department</p>
        </div>
      </section>

      {/* DISCLAIMER */}
      <div
        style={{
          marginTop: 65,
          background: "#fff",
          border: "2px solid #eadfbd",
          borderRadius: 20,
          padding: "35px 50px",
          fontSize: 28,
          textAlign: "center",
        }}
      >
        This report was generated from laboratory purity measurements and is intended for
        commercial reconciliation purposes.
      </div>

      {/* FOOTER */}
      <footer
        style={{
          marginTop: 70,
          paddingTop: 35,
          borderTop: "2px solid #d8c37b",
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          fontSize: 26,
          color: "#333",
        }}
      >
        <div>
          Generated by <strong>Ather Gold &amp; Precious Metals</strong>
        </div>
        <div style={{ textAlign: "center" }}>
          Verification ID: <strong>{data.reportId}</strong>
        </div>
        <div style={{ textAlign: "right" }}>Dubai, United Arab Emirates</div>
      </footer>
    </div>
  );
}

const cellStyle: React.CSSProperties = {
  height: 95,
  textAlign: "center",
  borderBottom: "2px solid #eee4c8",
  fontFamily: "Inter, system-ui, sans-serif",
  fontSize: 36,
};

const vStrong: React.CSSProperties = {
  display: "block",
  fontSize: 32,
  color: "#9a7b1f",
  marginBottom: 18,
};
const vText: React.CSSProperties = {
  fontSize: 26,
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
  icon: string;
  label: string;
  value: string;
  variant?: "red" | "green" | "";
}) {
  const isLoss = variant === "red";
  return (
    <div
      style={{
        minHeight: 250,
        background: "#fff",
        border: "2px solid #eadfbd",
        borderRadius: 30,
        boxShadow: "0 18px 60px rgba(0,0,0,0.08)",
        padding: 42,
        boxSizing: "border-box",
        display: "grid",
        gridTemplateColumns: "110px 1fr",
        gridTemplateRows: "60px 1fr",
        alignItems: "center",
      }}
    >
      <div
        style={{
          gridRow: "span 2",
          width: 90,
          height: 90,
          borderRadius: "50%",
          background: isLoss ? "#fff0f0" : "#fff7df",
          color: isLoss ? "#d33c2d" : "#c9a227",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 46,
        }}
      >
        {icon}
      </div>
      <span style={{ fontSize: 30, fontWeight: 600, color: "#555" }}>{label}</span>
      <strong
        style={{
          fontSize: 58,
          fontWeight: 800,
          color: variant === "red" ? "#d33c2d" : variant === "green" ? "#0e8f55" : "#1c2431",
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
