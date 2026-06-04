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

/* -------------------- Brand tokens — MATCHES Margin report identity --------------------
   These are the exact colors/fonts used by ReportsCenter (Margin/Swap/Portfolio exports).
   Do not introduce a different palette here. */

const BG = "#1a1a1a";
const CARD = "#222222";
const CARD_2 = "#2a2a2a";
const BORDER = "#2f2f2f";
const BORDER_SOFT = "#2a2a2a";
const TEXT = "#f4f1ec";
const TEXT_MUTED = "#9a9a9a";
const TEXT_SOFT = "#d9d4cc";
const TEXT_FAINT = "#7a7a7a";
const EMBER = "#e85d3a";
const EMBER_DEEP = "#c64a2d";
const DANGER = "#ef4444";
const OK = "#22c55e";

const baseFont =
  "Epilogue, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const displayFont = "Urbanist, " + baseFont;

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
      color: { dark: "#1a1a1a", light: "#ffffff" },
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
        backgroundColor: BG,
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

/* -------------------- Brand header — pixel-matches ReportsCenter brandHeader() -------------------- */

function Brand({ subtitle }: { subtitle: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <div
        style={{
          width: 38,
          height: 38,
          borderRadius: 8,
          background: `linear-gradient(135deg, ${EMBER}, ${EMBER_DEEP})`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          color: BG,
          fontSize: 18,
          fontFamily: displayFont,
        }}
      >
        A
      </div>
      <div>
        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 800,
            letterSpacing: "-0.02em",
            fontSize: 18,
            lineHeight: 1,
            color: TEXT,
          }}
        >
          ATHER GROUP
        </div>
        <div
          style={{
            fontSize: 11,
            color: TEXT_MUTED,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginTop: 3,
          }}
        >
          {subtitle}
        </div>
      </div>
    </div>
  );
}

/* -------------------- Row primitive — matches ReportsCenter row() -------------------- */

function Row({
  label,
  value,
  valueColor,
  emphasize,
}: {
  label: string;
  value: string;
  valueColor?: string;
  emphasize?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        padding: "10px 0",
        borderBottom: emphasize ? "none" : `1px solid ${BORDER_SOFT}`,
      }}
    >
      <span style={{ fontSize: 13, color: TEXT_MUTED, letterSpacing: "0.02em" }}>
        {label}
      </span>
      <span
        style={{
          fontSize: emphasize ? 20 : 15,
          color: valueColor ?? TEXT,
          fontWeight: emphasize ? 700 : 600,
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {value}
      </span>
    </div>
  );
}

/* -------------------- The unified premium report — Margin visual family -------------------- */

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

  const subtitle =
    reportType === "STATEMENT"
      ? "Discount / Premium Statement"
      : "Discount / Premium Report";

  return (
    <div
      ref={ref}
      style={{
        width: 780,
        background: BG,
        color: TEXT,
        fontFamily: baseFont,
        padding: "32px 36px 28px",
      }}
    >
      {/* Header — matches Margin brandHeader + clientHeaderHtml */}
      <Brand subtitle={subtitle} />

      <div
        style={{
          marginTop: 22,
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
        }}
      >
        <div>
          <div
            style={{
              fontSize: 11,
              color: TEXT_MUTED,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Company
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 700,
              marginTop: 2,
              letterSpacing: "-0.01em",
              color: TEXT,
              fontFamily: displayFont,
            }}
          >
            {summary.company.name}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div
            style={{
              fontSize: 11,
              color: TEXT_MUTED,
              letterSpacing: "0.08em",
              textTransform: "uppercase",
            }}
          >
            Snapshot
          </div>
          <div style={{ fontSize: 13, color: TEXT_SOFT, marginTop: 4 }}>
            {generatedAt}
          </div>
        </div>
      </div>

      {/* Hero — Available Gold (without discount / premium) */}
      <div
        style={{
          marginTop: 18,
          padding: "22px 20px",
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 2,
            background: `linear-gradient(90deg, ${EMBER}, ${EMBER_DEEP})`,
          }}
        />
        <div
          style={{
            fontSize: 11,
            color: TEXT_MUTED,
            letterSpacing: "0.12em",
            textTransform: "uppercase",
          }}
        >
          Available Gold
        </div>
        <div
          style={{
            fontSize: 10,
            color: TEXT_FAINT,
            letterSpacing: "0.1em",
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          Without discount / premium
        </div>
        <div
          style={{
            fontSize: 38,
            fontWeight: 800,
            marginTop: 10,
            fontVariantNumeric: "tabular-nums",
            letterSpacing: "-0.01em",
            color: summary.clean_remaining_grams < 0 ? DANGER : EMBER,
            fontFamily: displayFont,
          }}
        >
          {fmtGNum(summary.clean_remaining_grams)}
          <span
            style={{
              fontSize: 18,
              color: TEXT_SOFT,
              marginLeft: 8,
              fontWeight: 700,
            }}
          >
            g
          </span>
        </div>
      </div>

      {/* Summary block — matches Margin's row() card */}
      <div
        style={{
          marginTop: 16,
          padding: "4px 16px",
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
        }}
      >
        <Row
          label="Total Balance"
          value={fmtG(summary.total_balance_grams)}
          valueColor={summary.total_balance_grams < 0 ? DANGER : undefined}
        />
        <Row
          label="Discount / Premium Gold"
          value={fmtG(summary.dp_grams)}
          valueColor={EMBER}
        />
        <Row
          label="Available Gold (without D/P)"
          value={fmtG(summary.clean_remaining_grams)}
          valueColor={summary.clean_remaining_grams < 0 ? DANGER : undefined}
        />
        <Row label="Transactions" value={String(dpTxs.length)} />
        <Row
          label="Total Discount / Premium (USD)"
          value={fmtUSD(summary.dp_charges_usd)}
          valueColor={summary.dp_charges_usd < 0 ? DANGER : OK}
          emphasize
        />
      </div>

      {/* Transactions table — matches Margin/Swap table style */}
      <div style={{ marginTop: 18 }}>
        <div
          style={{
            fontSize: 11,
            color: TEXT_MUTED,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginBottom: 8,
          }}
        >
          — Discount / Premium Transactions —
        </div>

        {dpTxs.length === 0 ? (
          <div
            style={{
              padding: 18,
              textAlign: "center",
              color: TEXT_MUTED,
              fontSize: 13,
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
            }}
          >
            No discount or premium transactions recorded.
          </div>
        ) : (
          <div
            style={{
              background: CARD,
              border: `1px solid ${BORDER}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1.4fr 0.7fr 0.8fr 0.9fr 1fr",
                padding: "10px 14px",
                background: CARD_2,
                fontSize: 11,
                color: TEXT_MUTED,
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              <span>Date</span>
              <span>Type</span>
              <span style={{ textAlign: "right" }}>Weight</span>
              <span style={{ textAlign: "right" }}>$/oz</span>
              <span style={{ textAlign: "right" }}>USD</span>
            </div>
            {dpTxs.map((t) => (
              <div
                key={t.id}
                style={{
                  display: "grid",
                  gridTemplateColumns: "1.4fr 0.7fr 0.8fr 0.9fr 1fr",
                  padding: "9px 14px",
                  borderTop: `1px solid ${BORDER_SOFT}`,
                  fontSize: 13,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    color: TEXT_SOFT,
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {fmtDate(t.created_at)}
                </span>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 800,
                    letterSpacing: "0.12em",
                    color: t.kind === "discount" ? OK : EMBER,
                  }}
                >
                  {t.kind === "discount" ? "DISCOUNT" : "PREMIUM"}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: TEXT,
                    fontWeight: 600,
                  }}
                >
                  {fmtGNum(Number(t.grams))} g
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: TEXT_SOFT,
                  }}
                >
                  {t.per_oz != null
                    ? `$${Number(t.per_oz).toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}`
                    : "—"}
                </span>
                <span
                  style={{
                    textAlign: "right",
                    fontVariantNumeric: "tabular-nums",
                    color: TEXT,
                    fontWeight: 700,
                  }}
                >
                  {t.amount_usd != null
                    ? fmtUSD(Number(t.amount_usd))
                    : "—"}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer — matches Margin brandFooter() exactly, with QR on the side */}
      <div
        style={{
          marginTop: 22,
          paddingTop: 14,
          borderTop: `1px solid ${BORDER_SOFT}`,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 16,
        }}
      >
        <div style={{ flex: 1, textAlign: "center" }}>
          <div
            style={{
              fontSize: 10,
              color: TEXT_FAINT,
              fontStyle: "italic",
            }}
          >
            Generated by ATHER Desk · values reflect data at time of export.
          </div>
          <div
            style={{
              marginTop: 10,
              fontFamily: displayFont,
              fontWeight: 800,
              letterSpacing: "0.04em",
              fontSize: 12,
              color: TEXT_SOFT,
            }}
          >
            ATHER GROUP
          </div>
          <div
            style={{
              fontSize: 10,
              color: TEXT_FAINT,
              letterSpacing: "0.1em",
              textTransform: "uppercase",
              marginTop: 2,
            }}
          >
            Confidential Client Report
          </div>
        </div>
        {qr ? (
          <div style={{ textAlign: "center" }}>
            <img
              src={qr}
              alt=""
              style={{
                width: 64,
                height: 64,
                borderRadius: 6,
                background: "#fff",
                padding: 3,
              }}
            />
            <div
              style={{
                fontSize: 8,
                color: TEXT_FAINT,
                marginTop: 4,
                letterSpacing: "0.14em",
              }}
            >
              SCAN · VERIFY
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
};
