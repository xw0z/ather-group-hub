import { useEffect, useRef, useState } from "react";
import { Share2, Image as ImageIcon, FileText, Loader2, Download } from "lucide-react";
import { toPng } from "html-to-image";
import QRCode from "qrcode";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  listCompanyTransactions,
  type CompanySummary,
  type PremiumTx,
} from "@/lib/swap-premium.functions";

const fmtG = (n: number) =>
  `${n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 })} g`;
const fmtUSD = (n: number) => {
  const abs = Math.abs(n);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return n < 0 ? `-$${s}` : `$${s}`;
};
const fmtDate = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
const fmtDateOnly = (d: string) =>
  new Date(d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });

type Mode = "summary" | "statement";

export function ShareCompanyDialog({ summary }: { summary: CompanySummary }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode | null>(null);
  const [busy, setBusy] = useState(false);
  const [txs, setTxs] = useState<PremiumTx[] | null>(null);
  const [qr, setQr] = useState<string>("");
  const summaryRef = useRef<HTMLDivElement>(null);
  const statementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const url =
      typeof window !== "undefined"
        ? `${window.location.origin}/desk/app/discount-premium`
        : "https://ather.group";
    QRCode.toDataURL(url, { margin: 0, width: 200, color: { dark: "#0b0f1a", light: "#ffffff" } })
      .then(setQr)
      .catch(() => setQr(""));
  }, [open]);

  useEffect(() => {
    if (open && mode === "statement" && !txs) {
      listCompanyTransactions({ data: { companyId: summary.company.id } })
        .then(setTxs)
        .catch(() => setTxs([]));
    }
  }, [open, mode, summary.company.id, txs]);

  const handleShare = async (chosen: Mode) => {
    setMode(chosen);
    setBusy(true);
    try {
      // wait a tick for the hidden DOM to render
      await new Promise((r) => setTimeout(r, chosen === "statement" ? 400 : 150));
      const node = chosen === "summary" ? summaryRef.current : statementRef.current;
      if (!node) throw new Error("Render node missing");

      const dataUrl = await toPng(node, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });

      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `${summary.company.name.replace(/[^a-z0-9]+/gi, "_")}_${
        chosen === "summary" ? "summary" : "statement"
      }.png`;
      const file = new File([blob], fileName, { type: "image/png" });

      const nav = navigator as Navigator & {
        canShare?: (d: { files?: File[] }) => boolean;
        share?: (d: ShareData & { files?: File[] }) => Promise<void>;
      };
      if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
        try {
          await nav.share({
            files: [file],
            title: `${summary.company.name} — ATHER Desk`,
            text: `${summary.company.name} discount/premium ${
              chosen === "summary" ? "summary" : "statement"
            }`,
          });
          toast.success("Shared");
        } catch (err) {
          if ((err as Error).name !== "AbortError") {
            triggerDownload(dataUrl, fileName);
            toast.success("Image saved");
          }
        }
      } else {
        triggerDownload(dataUrl, fileName);
        toast.success("Image downloaded");
      }
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to generate image");
    } finally {
      setBusy(false);
    }
  };

  const triggerDownload = (dataUrl: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const generatedAt = new Date().toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) {
          setMode(null);
          setTxs(null);
        }
      }}
    >
      <DialogTrigger asChild>
        <Button size="icon" variant="ghost" className="h-7 w-7" title="Share">
          <Share2 className="h-3.5 w-3.5 text-sky-400" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share {summary.company.name}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3">
          <Button
            variant="outline"
            className="justify-start h-auto py-3"
            disabled={busy}
            onClick={() => handleShare("summary")}
          >
            {busy && mode === "summary" ? (
              <Loader2 className="h-5 w-5 animate-spin mr-3" />
            ) : (
              <ImageIcon className="h-5 w-5 mr-3 text-primary" />
            )}
            <div className="text-left">
              <div className="font-semibold">Share Company Summary</div>
              <div className="text-xs text-muted-foreground">
                One-page overview image
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start h-auto py-3"
            disabled={busy}
            onClick={() => handleShare("statement")}
          >
            {busy && mode === "statement" ? (
              <Loader2 className="h-5 w-5 animate-spin mr-3" />
            ) : (
              <FileText className="h-5 w-5 mr-3 text-primary" />
            )}
            <div className="text-left">
              <div className="font-semibold">Share Full Transaction Statement</div>
              <div className="text-xs text-muted-foreground">
                Detailed report with all transactions
              </div>
            </div>
          </Button>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Download className="h-3 w-3" /> Falls back to download on devices without
            native share.
          </p>
        </div>

        {/* Hidden offscreen render targets — kept in DOM so html-to-image can capture */}
        <div
          aria-hidden
          style={{
            position: "fixed",
            top: 0,
            left: "-99999px",
            pointerEvents: "none",
            opacity: 1,
          }}
        >
          <SummaryCard
            ref={summaryRef}
            summary={summary}
            qr={qr}
            generatedAt={generatedAt}
          />
          {txs && (
            <StatementCard
              ref={statementRef}
              summary={summary}
              txs={txs}
              qr={qr}
              generatedAt={generatedAt}
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Image templates -------------------- */

const BRAND_DARK = "#0b1020";
const BRAND_ACCENT = "#c9a24a";
const BRAND_INK = "#111827";
const BRAND_MUTED = "#6b7280";
const BRAND_LINE = "#e5e7eb";

const baseFont =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

function Brand() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 48,
          height: 48,
          borderRadius: 12,
          background: BRAND_DARK,
          color: BRAND_ACCENT,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: 22,
          letterSpacing: 1,
        }}
      >
        A
      </div>
      <div>
        <div
          style={{
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 2,
            color: BRAND_DARK,
          }}
        >
          ATHER
        </div>
        <div style={{ fontSize: 11, color: BRAND_MUTED, letterSpacing: 1.5 }}>
          DESK · DISCOUNT / PREMIUM
        </div>
      </div>
    </div>
  );
}

const StatBox = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "ok" | "danger" | "sky" | "fuchsia" | "accent";
}) => {
  const color =
    tone === "danger"
      ? "#dc2626"
      : tone === "ok"
        ? "#059669"
        : tone === "sky"
          ? "#0284c7"
          : tone === "fuchsia"
            ? "#c026d3"
            : tone === "accent"
              ? BRAND_ACCENT
              : BRAND_INK;
  return (
    <div
      style={{
        border: `1px solid ${BRAND_LINE}`,
        borderRadius: 12,
        padding: 16,
        background: "#fafbfc",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.5,
          color: BRAND_MUTED,
          fontWeight: 600,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 20,
          fontWeight: 700,
          color,
          marginTop: 6,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </div>
    </div>
  );
};

const Footer = ({ qr, generatedAt }: { qr: string; generatedAt: string }) => (
  <div
    style={{
      marginTop: 28,
      paddingTop: 18,
      borderTop: `1px solid ${BRAND_LINE}`,
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    }}
  >
    <div>
      <div
        style={{
          fontSize: 14,
          fontWeight: 700,
          color: BRAND_DARK,
          letterSpacing: 0.5,
        }}
      >
        ather.group
      </div>
      <div style={{ fontSize: 10, color: BRAND_MUTED, marginTop: 4 }}>
        Generated by ATHER Desk · {generatedAt}
      </div>
    </div>
    {qr ? (
      <img
        src={qr}
        alt=""
        style={{ width: 72, height: 72, borderRadius: 6, background: "#fff" }}
      />
    ) : null}
  </div>
);

const SummaryCard = ({
  ref,
  summary,
  qr,
  generatedAt,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  summary: CompanySummary;
  qr: string;
  generatedAt: string;
}) => (
  <div
    ref={ref}
    style={{
      width: 1080,
      padding: 56,
      background: "#ffffff",
      color: BRAND_INK,
      fontFamily: baseFont,
    }}
  >
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        paddingBottom: 24,
        borderBottom: `2px solid ${BRAND_DARK}`,
      }}
    >
      <Brand />
      <div style={{ textAlign: "right" }}>
        <div style={{ fontSize: 11, color: BRAND_MUTED, letterSpacing: 1 }}>
          GENERATED
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
          {generatedAt}
        </div>
      </div>
    </div>

    <div style={{ marginTop: 28 }}>
      <div
        style={{
          fontSize: 12,
          color: BRAND_MUTED,
          letterSpacing: 1.5,
          textTransform: "uppercase",
        }}
      >
        Company
      </div>
      <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4, letterSpacing: -0.5 }}>
        {summary.company.name}
      </div>
    </div>

    {/* Available Gold highlight */}
    <div
      style={{
        marginTop: 28,
        borderRadius: 16,
        padding: 32,
        background: `linear-gradient(135deg, ${BRAND_DARK}, #1e2746)`,
        color: "#fff",
        textAlign: "center",
      }}
    >
      <div
        style={{
          fontSize: 12,
          letterSpacing: 3,
          color: BRAND_ACCENT,
          fontWeight: 700,
        }}
      >
        AVAILABLE GOLD
      </div>
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.6)",
          marginTop: 2,
          letterSpacing: 1,
        }}
      >
        (without discount / premium)
      </div>
      <div
        style={{
          fontSize: 56,
          fontWeight: 800,
          marginTop: 10,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -1,
        }}
      >
        {fmtG(summary.clean_remaining_grams)}
      </div>
    </div>

    <div
      style={{
        marginTop: 24,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 12,
      }}
    >
      <StatBox
        label="Total Gold Balance"
        value={fmtG(summary.total_balance_grams)}
        tone="accent"
      />
      <StatBox
        label="Clean Gold Balance"
        value={fmtG(summary.clean_remaining_grams)}
        tone={summary.clean_remaining_grams < 0 ? "danger" : "ok"}
      />
      <StatBox
        label="Discount / Premium Gold"
        value={fmtG(summary.dp_grams)}
        tone="sky"
      />
      <StatBox
        label="Total D/P Charges"
        value={fmtUSD(summary.dp_charges_usd)}
        tone="fuchsia"
      />
    </div>

    <div
      style={{
        marginTop: 24,
        padding: 18,
        borderRadius: 12,
        border: `1px solid ${BRAND_LINE}`,
        display: "flex",
        justifyContent: "space-between",
        fontSize: 13,
      }}
    >
      <div>
        <div style={{ fontSize: 10, color: BRAND_MUTED, letterSpacing: 1 }}>
          TRANSACTIONS
        </div>
        <div style={{ fontWeight: 700, marginTop: 4 }}>{summary.tx_count}</div>
      </div>
    </div>

    <Footer qr={qr} generatedAt={generatedAt} />
  </div>
);

const StatementCard = ({
  ref,
  summary,
  txs,
  qr,
  generatedAt,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  summary: CompanySummary;
  txs: PremiumTx[];
  qr: string;
  generatedAt: string;
}) => {
  // Build chronological running balance
  const sorted = [...txs].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );
  let running = 0;
  const rows = sorted.map((t) => {
    const g = Number(t.grams) || 0;
    if (t.kind === "add") running += g;
    else if (t.kind === "remove") running -= g;
    else if (t.kind === "adjust") running += g;
    // discount/premium do not affect total gold balance
    return { t, balance: running };
  });

  const first = sorted[0]?.created_at;
  const last = sorted[sorted.length - 1]?.created_at;

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        padding: 56,
        background: "#ffffff",
        color: BRAND_INK,
        fontFamily: baseFont,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          paddingBottom: 24,
          borderBottom: `2px solid ${BRAND_DARK}`,
        }}
      >
        <Brand />
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 11, color: BRAND_MUTED, letterSpacing: 1 }}>
            GENERATED
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 4 }}>
            {generatedAt}
          </div>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <div
          style={{
            fontSize: 12,
            color: BRAND_MUTED,
            letterSpacing: 1.5,
            textTransform: "uppercase",
          }}
        >
          Statement · Company
        </div>
        <div style={{ fontSize: 30, fontWeight: 800, marginTop: 4 }}>
          {summary.company.name}
        </div>
      </div>

      <div
        style={{
          marginTop: 20,
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr 1fr",
          gap: 10,
        }}
      >
        <StatBox
          label="Total Gold"
          value={fmtG(summary.total_balance_grams)}
          tone="accent"
        />
        <StatBox
          label="Clean Gold"
          value={fmtG(summary.clean_remaining_grams)}
          tone={summary.clean_remaining_grams < 0 ? "danger" : "ok"}
        />
        <StatBox label="D/P Gold" value={fmtG(summary.dp_grams)} tone="sky" />
        <StatBox
          label="D/P Charges"
          value={fmtUSD(summary.dp_charges_usd)}
          tone="fuchsia"
        />
      </div>

      <div
        style={{
          marginTop: 16,
          padding: 14,
          borderRadius: 10,
          background: "#fafbfc",
          border: `1px solid ${BRAND_LINE}`,
          display: "flex",
          justifyContent: "space-between",
          fontSize: 12,
        }}
      >
        <div>
          <span style={{ color: BRAND_MUTED }}>Transactions: </span>
          <strong>{txs.length}</strong>
        </div>
        <div>
          <span style={{ color: BRAND_MUTED }}>First: </span>
          <strong>{first ? fmtDateOnly(first) : "—"}</strong>
        </div>
        <div>
          <span style={{ color: BRAND_MUTED }}>Last: </span>
          <strong>{last ? fmtDateOnly(last) : "—"}</strong>
        </div>
      </div>

      <div style={{ marginTop: 24 }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
          }}
        >
          <thead>
            <tr
              style={{
                background: BRAND_DARK,
                color: "#fff",
                textAlign: "left",
              }}
            >
              <th style={{ padding: "10px 12px", fontSize: 10, letterSpacing: 1 }}>
                DATE
              </th>
              <th style={{ padding: "10px 12px", fontSize: 10, letterSpacing: 1 }}>
                TYPE
              </th>
              <th style={{ padding: "10px 12px", fontSize: 10, letterSpacing: 1 }}>
                NOTES
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  fontSize: 10,
                  letterSpacing: 1,
                  textAlign: "right",
                }}
              >
                WEIGHT (g)
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  fontSize: 10,
                  letterSpacing: 1,
                  textAlign: "right",
                }}
              >
                D/P
              </th>
              <th
                style={{
                  padding: "10px 12px",
                  fontSize: 10,
                  letterSpacing: 1,
                  textAlign: "right",
                }}
              >
                BALANCE (g)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ t, balance }, i) => (
              <tr
                key={t.id}
                style={{
                  background: i % 2 === 0 ? "#ffffff" : "#fafbfc",
                  borderBottom: `1px solid ${BRAND_LINE}`,
                }}
              >
                <td style={{ padding: "8px 12px", color: BRAND_MUTED }}>
                  {fmtDate(t.created_at)}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    fontWeight: 600,
                    color:
                      t.kind === "add"
                        ? "#059669"
                        : t.kind === "remove"
                          ? "#dc2626"
                          : t.kind === "discount"
                            ? "#0284c7"
                            : t.kind === "premium"
                              ? "#c026d3"
                              : "#b45309",
                  }}
                >
                  {t.kind.toUpperCase()}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    color: BRAND_INK,
                    maxWidth: 280,
                  }}
                >
                  {t.notes ?? "—"}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {Number(t.grams).toFixed(3)}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {t.amount_usd != null ? fmtUSD(Number(t.amount_usd)) : "—"}
                </td>
                <td
                  style={{
                    padding: "8px 12px",
                    textAlign: "right",
                    fontWeight: 600,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {balance.toFixed(3)}
                </td>
              </tr>
            ))}
            <tr style={{ background: BRAND_DARK, color: "#fff", fontWeight: 700 }}>
              <td colSpan={3} style={{ padding: "12px" }}>
                TOTALS
              </td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {summary.total_balance_grams.toFixed(3)}
              </td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtUSD(summary.dp_charges_usd)}
              </td>
              <td
                style={{
                  padding: "12px",
                  textAlign: "right",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {summary.clean_remaining_grams.toFixed(3)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <Footer qr={qr} generatedAt={generatedAt} />
    </div>
  );
};
