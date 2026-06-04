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

/* -------------------- Formatters -------------------- */

const fmtG = (n: number) =>
  `${(Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} g`;

const fmtGNum = (n: number) =>
  (Number(n) || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const fmtUSD = (n: number) => {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const s = abs.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return v < 0 ? `-$${s}` : `$${s}`;
};

const fmtDate = (d: string) =>
  new Date(d).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

type Mode = "summary" | "statement";

/* -------------------- Brand tokens (matches ATHER Desk premium identity) -------------------- */

const BRAND_NAVY = "#0b1224";
const BRAND_NAVY_2 = "#142042";
const BRAND_NAVY_3 = "#1d2c5c";
const BRAND_GOLD = "#c9a24a";
const BRAND_GOLD_SOFT = "#e6c878";
const INK = "#0f172a";
const INK_SOFT = "#475569";
const MUTED = "#94a3b8";
const LINE = "#e5e7eb";
const LINE_SOFT = "#eef1f6";
const ROW_ALT = "#f7f9fc";
const SURFACE = "#ffffff";
const DANGER = "#dc2626";
const OK = "#059669";

const baseFont =
  "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/* -------------------- Component -------------------- */

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
    QRCode.toDataURL(url, {
      margin: 0,
      width: 220,
      color: { dark: BRAND_NAVY, light: "#ffffff" },
    })
      .then(setQr)
      .catch(() => setQr(""));
  }, [open]);

  useEffect(() => {
    if (open && !txs) {
      listCompanyTransactions({ data: { companyId: summary.company.id } })
        .then(setTxs)
        .catch(() => setTxs([]));
    }
  }, [open, summary.company.id, txs]);

  const handleShare = async (chosen: Mode) => {
    setMode(chosen);
    setBusy(true);
    try {
      await new Promise((r) => setTimeout(r, chosen === "statement" ? 400 : 150));
      const node = chosen === "summary" ? summaryRef.current : statementRef.current;
      if (!node) throw new Error("Render node missing");

      const dataUrl = await toPng(node, {
        pixelRatio: 3,
        cacheBust: true,
        backgroundColor: "#ffffff",
      });

      const blob = await (await fetch(dataUrl)).blob();
      const fileName = `ATHER_${summary.company.name.replace(/[^a-z0-9]+/gi, "_")}_${
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

        {/* Hidden offscreen render targets */}
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
          <ReportCard
            ref={summaryRef}
            summary={summary}
            txs={txs}
            qr={qr}
            generatedAt={generatedAt}
            reportType="SUMMARY"
          />
          {txs && (
            <ReportCard
              ref={statementRef}
              summary={summary}
              txs={txs}
              qr={qr}
              generatedAt={generatedAt}
              reportType="STATEMENT"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------- Branded sub-components -------------------- */

function Brand({ inverse = false }: { inverse?: boolean }) {
  const fg = inverse ? "#ffffff" : INK;
  const sub = inverse ? "rgba(255,255,255,0.65)" : MUTED;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
      <div
        style={{
          width: 54,
          height: 54,
          borderRadius: 14,
          background: `linear-gradient(135deg, ${BRAND_GOLD}, ${BRAND_GOLD_SOFT})`,
          color: BRAND_NAVY,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 900,
          fontSize: 26,
          letterSpacing: 1,
          boxShadow: "0 6px 18px rgba(201,162,74,0.35)",
        }}
      >
        A
      </div>
      <div>
        <div
          style={{
            fontSize: 24,
            fontWeight: 900,
            letterSpacing: 4,
            color: fg,
            lineHeight: 1,
          }}
        >
          ATHER
        </div>
        <div
          style={{
            fontSize: 10,
            color: sub,
            letterSpacing: 2,
            marginTop: 6,
            fontWeight: 600,
          }}
        >
          DESK · PRECIOUS METALS
        </div>
      </div>
    </div>
  );
}

function StatPill({
  label,
  value,
  tone = "default",
}: {
  label: string;
  value: string;
  tone?: "default" | "danger" | "ok" | "gold";
}) {
  const valueColor =
    tone === "danger"
      ? DANGER
      : tone === "ok"
        ? OK
        : tone === "gold"
          ? BRAND_GOLD
          : INK;
  return (
    <div
      style={{
        flex: 1,
        background: SURFACE,
        border: `1px solid ${LINE}`,
        borderRadius: 14,
        padding: "18px 20px",
        boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: 1.6,
          color: MUTED,
          fontWeight: 700,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: valueColor,
          marginTop: 8,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.3,
        }}
      >
        {value}
      </div>
    </div>
  );
}

/* -------------------- The unified premium report -------------------- */

const ReportCard = ({
  ref,
  summary,
  txs,
  qr,
  generatedAt,
  reportType,
}: {
  ref: React.RefObject<HTMLDivElement | null>;
  summary: CompanySummary;
  txs: PremiumTx[] | null;
  qr: string;
  generatedAt: string;
  reportType: "SUMMARY" | "STATEMENT";
}) => {
  const dpTxs = (txs ?? [])
    .filter((t) => t.kind === "discount" || t.kind === "premium")
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

  return (
    <div
      ref={ref}
      style={{
        width: 1080,
        background: "#f5f7fb",
        color: INK,
        fontFamily: baseFont,
        padding: 0,
      }}
    >
      {/* Header band — dark navy with gold accent */}
      <div
        style={{
          background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_2} 60%, ${BRAND_NAVY_3} 100%)`,
          padding: "44px 56px 56px",
          position: "relative",
          borderBottom: `4px solid ${BRAND_GOLD}`,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <Brand inverse />
          <div style={{ textAlign: "right" }}>
            <div
              style={{
                display: "inline-block",
                background: "rgba(201,162,74,0.15)",
                border: `1px solid ${BRAND_GOLD}`,
                color: BRAND_GOLD_SOFT,
                padding: "6px 14px",
                borderRadius: 999,
                fontSize: 10,
                fontWeight: 700,
                letterSpacing: 2,
              }}
            >
              DISCOUNT / PREMIUM · {reportType}
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(255,255,255,0.55)",
                marginTop: 12,
                letterSpacing: 1.2,
              }}
            >
              GENERATED
            </div>
            <div
              style={{
                fontSize: 14,
                fontWeight: 600,
                marginTop: 3,
                color: "#fff",
              }}
            >
              {generatedAt}
            </div>
          </div>
        </div>

        {/* Company name block */}
        <div style={{ marginTop: 36 }}>
          <div
            style={{
              fontSize: 11,
              color: BRAND_GOLD_SOFT,
              letterSpacing: 2,
              fontWeight: 700,
            }}
          >
            COMPANY
          </div>
          <div
            style={{
              fontSize: 40,
              fontWeight: 900,
              marginTop: 6,
              color: "#fff",
              letterSpacing: -0.8,
              lineHeight: 1.1,
            }}
          >
            {summary.company.name}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: "44px 56px 48px" }}>
        {/* Hero card — Available Gold (without discount / premium) */}
        <div
          style={{
            borderRadius: 20,
            padding: "40px 44px",
            background: `linear-gradient(135deg, ${BRAND_NAVY} 0%, ${BRAND_NAVY_3} 100%)`,
            color: "#fff",
            boxShadow: "0 18px 40px -18px rgba(11,18,36,0.55)",
            position: "relative",
            overflow: "hidden",
          }}
        >
          {/* gold ribbon */}
          <div
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              height: 4,
              background: `linear-gradient(90deg, ${BRAND_GOLD}, ${BRAND_GOLD_SOFT}, ${BRAND_GOLD})`,
            }}
          />
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              gap: 24,
            }}
          >
            <div>
              <div
                style={{
                  fontSize: 11,
                  letterSpacing: 3,
                  color: BRAND_GOLD,
                  fontWeight: 800,
                }}
              >
                AVAILABLE GOLD
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "rgba(255,255,255,0.6)",
                  marginTop: 4,
                  letterSpacing: 1,
                }}
              >
                Without discount / premium
              </div>
              <div
                style={{
                  fontSize: 64,
                  fontWeight: 900,
                  marginTop: 18,
                  fontVariantNumeric: "tabular-nums",
                  letterSpacing: -1.5,
                  lineHeight: 1,
                  color: "#fff",
                }}
              >
                {fmtGNum(summary.clean_remaining_grams)}
                <span
                  style={{
                    fontSize: 26,
                    color: BRAND_GOLD_SOFT,
                    marginLeft: 10,
                    fontWeight: 700,
                  }}
                >
                  g
                </span>
              </div>
            </div>
            <div
              style={{
                textAlign: "right",
                paddingBottom: 8,
              }}
            >
              <div
                style={{
                  fontSize: 10,
                  letterSpacing: 2,
                  color: "rgba(255,255,255,0.55)",
                  fontWeight: 700,
                }}
              >
                TOTAL BALANCE
              </div>
              <div
                style={{
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#fff",
                  marginTop: 6,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {fmtG(summary.total_balance_grams)}
              </div>
            </div>
          </div>
        </div>

        {/* Stat row */}
        <div style={{ display: "flex", gap: 14, marginTop: 18 }}>
          <StatPill
            label="Discount / Premium Gold"
            value={fmtG(summary.dp_grams)}
            tone="gold"
          />
          <StatPill
            label="Discount / Premium (USD)"
            value={fmtUSD(summary.dp_charges_usd)}
            tone={summary.dp_charges_usd < 0 ? "danger" : "default"}
          />
          <StatPill
            label="Transactions"
            value={String(dpTxs.length)}
          />
        </div>

        {/* Transactions table */}
        <div style={{ marginTop: 36 }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 14,
            }}
          >
            <div
              style={{
                fontSize: 11,
                color: INK_SOFT,
                letterSpacing: 2,
                textTransform: "uppercase",
                fontWeight: 700,
              }}
            >
              Discount / Premium Transactions
            </div>
            <div
              style={{
                height: 1,
                flex: 1,
                background: LINE,
                marginLeft: 16,
              }}
            />
          </div>

          {dpTxs.length === 0 ? (
            <div
              style={{
                padding: 28,
                borderRadius: 14,
                border: `1px dashed ${LINE}`,
                color: MUTED,
                textAlign: "center",
                fontSize: 13,
                background: SURFACE,
              }}
            >
              No discount or premium transactions recorded.
            </div>
          ) : (
            <div
              style={{
                borderRadius: 14,
                overflow: "hidden",
                border: `1px solid ${LINE}`,
                background: SURFACE,
                boxShadow: "0 1px 2px rgba(15,23,42,0.04)",
              }}
            >
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  fontSize: 13,
                }}
              >
                <thead>
                  <tr
                    style={{
                      background: BRAND_NAVY,
                      color: "#fff",
                      textAlign: "left",
                    }}
                  >
                    <th
                      style={{
                        padding: "14px 16px",
                        fontSize: 10,
                        letterSpacing: 1.4,
                        fontWeight: 700,
                      }}
                    >
                      DATE
                    </th>
                    <th
                      style={{
                        padding: "14px 16px",
                        fontSize: 10,
                        letterSpacing: 1.4,
                        fontWeight: 700,
                      }}
                    >
                      TYPE
                    </th>
                    <th
                      style={{
                        padding: "14px 16px",
                        fontSize: 10,
                        letterSpacing: 1.4,
                        fontWeight: 700,
                        textAlign: "right",
                      }}
                    >
                      WEIGHT (g)
                    </th>
                    <th
                      style={{
                        padding: "14px 16px",
                        fontSize: 10,
                        letterSpacing: 1.4,
                        fontWeight: 700,
                        textAlign: "right",
                      }}
                    >
                      PRICE ($/oz)
                    </th>
                    <th
                      style={{
                        padding: "14px 16px",
                        fontSize: 10,
                        letterSpacing: 1.4,
                        fontWeight: 700,
                        textAlign: "right",
                      }}
                    >
                      AMOUNT (USD)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {dpTxs.map((t, i) => (
                    <tr
                      key={t.id}
                      style={{
                        background: i % 2 === 0 ? SURFACE : ROW_ALT,
                        borderBottom: `1px solid ${LINE_SOFT}`,
                      }}
                    >
                      <td
                        style={{
                          padding: "14px 16px",
                          color: INK_SOFT,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtDate(t.created_at)}
                      </td>
                      <td style={{ padding: "14px 16px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "4px 10px",
                            borderRadius: 999,
                            fontSize: 10,
                            fontWeight: 800,
                            letterSpacing: 1.2,
                            background:
                              t.kind === "discount"
                                ? "rgba(2,132,199,0.10)"
                                : "rgba(192,38,211,0.10)",
                            color: t.kind === "discount" ? "#0369a1" : "#a21caf",
                            border: `1px solid ${
                              t.kind === "discount"
                                ? "rgba(2,132,199,0.25)"
                                : "rgba(192,38,211,0.25)"
                            }`,
                          }}
                        >
                          {t.kind === "discount" ? "DISCOUNT" : "PREMIUM"}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: INK,
                          fontWeight: 600,
                        }}
                      >
                        {fmtGNum(Number(t.grams))}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          color: INK_SOFT,
                        }}
                      >
                        {t.per_oz != null
                          ? `$${Number(t.per_oz).toLocaleString("en-US", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}`
                          : "—"}
                      </td>
                      <td
                        style={{
                          padding: "14px 16px",
                          textAlign: "right",
                          fontVariantNumeric: "tabular-nums",
                          fontWeight: 700,
                          color: INK,
                        }}
                      >
                        {t.amount_usd != null
                          ? fmtUSD(Number(t.amount_usd))
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Premium totals summary card */}
        <div
          style={{
            marginTop: 28,
            borderRadius: 16,
            border: `1px solid ${LINE}`,
            background: SURFACE,
            overflow: "hidden",
            boxShadow: "0 4px 14px -8px rgba(15,23,42,0.18)",
          }}
        >
          <div
            style={{
              background: `linear-gradient(90deg, ${BRAND_NAVY}, ${BRAND_NAVY_3})`,
              color: "#fff",
              padding: "14px 22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontSize: 11,
                letterSpacing: 2.2,
                fontWeight: 800,
                color: BRAND_GOLD_SOFT,
              }}
            >
              REPORT TOTALS
            </div>
            <div
              style={{
                fontSize: 10,
                color: "rgba(255,255,255,0.6)",
                letterSpacing: 1.2,
              }}
            >
              ATHER DESK
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr 1fr",
            }}
          >
            <TotalCell
              label="Available Gold"
              sub="without D/P"
              value={fmtG(summary.clean_remaining_grams)}
            />
            <TotalCell
              label="Discount / Premium Gold"
              sub="combined"
              value={fmtG(summary.dp_grams)}
              accent
            />
            <TotalCell
              label="Total Discount / Premium"
              sub="USD"
              value={fmtUSD(summary.dp_charges_usd)}
              last
            />
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            marginTop: 32,
            paddingTop: 22,
            borderTop: `1px solid ${LINE}`,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}
        >
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 800,
                color: BRAND_NAVY,
                letterSpacing: 0.5,
              }}
            >
              ather.group
            </div>
            <div
              style={{
                fontSize: 10,
                color: MUTED,
                marginTop: 5,
                letterSpacing: 0.5,
              }}
            >
              Generated by ATHER Desk · {generatedAt}
            </div>
            <div
              style={{
                fontSize: 9,
                color: MUTED,
                marginTop: 3,
                letterSpacing: 0.4,
              }}
            >
              This document is a system-generated report. Values reflect data at
              time of export.
            </div>
          </div>
          {qr ? (
            <div style={{ textAlign: "center" }}>
              <img
                src={qr}
                alt=""
                style={{
                  width: 82,
                  height: 82,
                  borderRadius: 8,
                  background: "#fff",
                  padding: 4,
                  border: `1px solid ${LINE}`,
                }}
              />
              <div
                style={{
                  fontSize: 8,
                  color: MUTED,
                  marginTop: 4,
                  letterSpacing: 1.2,
                }}
              >
                SCAN · VERIFY
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

function TotalCell({
  label,
  sub,
  value,
  accent,
  last,
}: {
  label: string;
  sub: string;
  value: string;
  accent?: boolean;
  last?: boolean;
}) {
  return (
    <div
      style={{
        padding: "22px 24px",
        borderRight: last ? "none" : `1px solid ${LINE_SOFT}`,
        background: accent ? "#fdfaf1" : SURFACE,
      }}
    >
      <div
        style={{
          fontSize: 10,
          letterSpacing: 1.6,
          color: MUTED,
          fontWeight: 700,
          textTransform: "uppercase",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 9,
          color: MUTED,
          marginTop: 2,
          letterSpacing: 0.8,
        }}
      >
        {sub}
      </div>
      <div
        style={{
          fontSize: 22,
          fontWeight: 800,
          color: accent ? BRAND_GOLD : INK,
          marginTop: 10,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: -0.3,
        }}
      >
        {value}
      </div>
    </div>
  );
}
