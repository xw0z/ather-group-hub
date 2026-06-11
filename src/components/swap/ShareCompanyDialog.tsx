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
import { logClientAuditEvent } from "@/lib/swap-audit.functions";

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

const fmtDate = (d: string) => {
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return d;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())} ${p(dt.getHours())}:${p(dt.getMinutes())}:${p(dt.getSeconds())}`;
};

type Mode = "summary" | "statement";

/* -------------------- Brand tokens -------------------- */

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
const INFO = "#38bdf8";

const baseFont =
  "Epilogue, ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";
const displayFont = "Urbanist, " + baseFont;

const TX_LABEL: Record<PremiumTx["kind"], string> = {
  add: "ADD",
  remove: "REMOVE",
  adjust: "ADJUST",
  discount: "DISCOUNT",
  premium: "PREMIUM",
};
const TX_COLOR: Record<PremiumTx["kind"], string> = {
  add: OK,
  remove: DANGER,
  adjust: INFO,
  discount: OK,
  premium: EMBER,
};

/** Build a single-line, professional note for discount/premium rows. */
function formatTxNote(t: PremiumTx): string {
  if (t.kind === "discount" || t.kind === "premium") {
    const isPremium = t.kind === "premium";
    const label = isPremium ? "Premium Applied" : "Discount Applied";
    const sign = isPremium ? "+" : "-";
    const rate = Number(t.per_oz ?? 0).toFixed(0);
    const grams = (Number(t.grams) || 0).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const valueAbs = Math.abs(Number(t.amount_usd ?? 0)).toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const base = `${label} (${sign}${rate} USD/oz) | Gold: ${grams} g | Value: $${valueAbs}`;
    return t.notes ? `${base} — ${t.notes}` : base;
  }
  return t.notes || "—";
}

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

  const triggerDownload = (dataUrl: string, fileName: string) => {
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const withTimeout = <T,>(p: Promise<T>, ms: number, label: string): Promise<T> =>
    new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
      p.then(
        (v) => {
          clearTimeout(t);
          resolve(v);
        },
        (e) => {
          clearTimeout(t);
          reject(e);
        },
      );
    });

  const shareNode = async (
    node: HTMLDivElement,
    fileNameSuffix: string,
    _titleSuffix: string,
  ) => {
    const dataUrl = await withTimeout(
      toPng(node, { pixelRatio: 3, cacheBust: true, backgroundColor: BG }),
      30000,
      "Image generation",
    );
    const blob = await (await fetch(dataUrl)).blob();
    const fileName = `ATHER_${summary.company.name.replace(/[^a-z0-9]+/gi, "_")}_${fileNameSuffix}.png`;
    const file = new File([blob], fileName, { type: "image/png" });
    const nav = navigator as Navigator & {
      canShare?: (d: { files?: File[] }) => boolean;
      share?: (d: ShareData & { files?: File[] }) => Promise<void>;
    };
    if (nav.share && nav.canShare && nav.canShare({ files: [file] })) {
      try {
        await nav.share({ files: [file] });
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
  };

  const audit = (action: string, status: "success" | "failure", details?: Record<string, unknown>) => {
    logClientAuditEvent({
      data: {
        module: "premium",
        action,
        status,
        entity_type: "premium_company",
        entity_id: summary.company.id,
        details: {
          company_name: summary.company.name,
          ...details,
        },
      },
    }).catch(() => {});
  };

  const generateCompanySummaryImage = async () => {
    setMode("summary");
    setBusy(true);
    const toastId = toast.loading("Generating summary…");
    try {
      await new Promise((r) => setTimeout(r, 120));
      const node = summaryRef.current;
      if (!node) throw new Error("Summary render node missing");
      await shareNode(node, "summary", "company summary");
      audit("company_summary_shared", "success");
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to generate summary";
      toast.error(msg);
      audit("company_summary_shared", "failure", { error: msg });
    } finally {
      toast.dismiss(toastId);
      setBusy(false);
      setMode(null);
    }
  };

  const generateFullTransactionStatement = async () => {
    setMode("statement");
    setBusy(true);
    const toastId = toast.loading("Generating full statement…");
    try {
      // Always refetch ALL transactions for the company (not just D/P)
      const all = await withTimeout(
        listCompanyTransactions({ data: { companyId: summary.company.id } }),
        20000,
        "Loading transactions",
      );
      setTxs(all);
      // Allow the offscreen node to render with the freshly loaded list
      await new Promise((r) => setTimeout(r, 350));
      const node = statementRef.current;
      if (!node) throw new Error("Statement render node missing");
      await shareNode(node, "statement", "full transaction statement");
      audit("full_statement_shared", "success", { tx_count: all.length });
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : "Failed to generate statement";
      toast.error(msg);
      audit("full_statement_shared", "failure", { error: msg });
    } finally {
      toast.dismiss(toastId);
      setBusy(false);
      setMode(null);
    }
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
            onClick={generateCompanySummaryImage}
          >
            {busy && mode === "summary" ? (
              <Loader2 className="h-5 w-5 animate-spin mr-3" />
            ) : (
              <ImageIcon className="h-5 w-5 mr-3 text-primary" />
            )}
            <div className="text-left">
              <div className="font-semibold">
                {busy && mode === "summary"
                  ? "Generating summary…"
                  : "Share Company Summary"}
              </div>
              <div className="text-xs text-muted-foreground">
                One-page overview image
              </div>
            </div>
          </Button>
          <Button
            variant="outline"
            className="justify-start h-auto py-3"
            disabled={busy}
            onClick={generateFullTransactionStatement}
          >
            {busy && mode === "statement" ? (
              <Loader2 className="h-5 w-5 animate-spin mr-3" />
            ) : (
              <FileText className="h-5 w-5 mr-3 text-primary" />
            )}
            <div className="text-left">
              <div className="font-semibold">
                {busy && mode === "statement"
                  ? "Generating full statement…"
                  : "Share Full Transaction Statement"}
              </div>
              <div className="text-xs text-muted-foreground">
                Every transaction for this company
              </div>
            </div>
          </Button>
          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
            <Download className="h-3 w-3" /> Falls back to download on devices without
            native share.
          </p>
        </div>

        {/* Hidden offscreen render targets — two distinct components */}
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

/* -------------------- Brand header -------------------- */

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

function CompanyHeader({
  name,
  generatedAt,
}: {
  name: string;
  generatedAt: string;
}) {
  return (
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
          {name}
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
  );
}

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

function BrandFooter({ qr }: { qr: string }) {
  return (
    <div
      style={{
        marginTop: 22,
        paddingTop: 16,
        borderTop: `1px solid ${BORDER_SOFT}`,
        display: "grid",
        gridTemplateColumns: "72px 1fr 72px",
        alignItems: "center",
        gap: 16,
      }}
    >
      {/* Spacer to balance QR on the right */}
      <div />
      <div style={{ textAlign: "center" }}>
        <div
          style={{
            fontFamily: displayFont,
            fontWeight: 800,
            letterSpacing: "0.04em",
            fontSize: 13,
            color: TEXT_SOFT,
          }}
        >
          ATHER GROUP
        </div>
        <div
          style={{
            fontSize: 10,
            color: TEXT_FAINT,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            marginTop: 4,
          }}
        >
          Confidential Client Report
        </div>
        <div
          style={{
            fontSize: 10,
            color: TEXT_FAINT,
            fontStyle: "italic",
            marginTop: 6,
          }}
        >
          Generated by ATHER Desk · values reflect data at time of export.
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifySelf: "end" }}>
        {qr ? (
          <>
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
          </>
        ) : null}
      </div>
    </div>
  );
}


/* -------------------- Available (no D/P) hero highlight -------------------- */

function AvailableHighlight({ grams }: { grams: number }) {
  const positive = grams >= 0;
  const color = positive ? OK : DANGER;
  return (
    <div
      style={{
        marginTop: 18,
        padding: "26px 24px",
        background: CARD,
        border: `2px solid ${color}`,
        borderRadius: 14,
        textAlign: "center",
        boxShadow: `0 0 0 4px ${color}22 inset`,
      }}
    >
      <div
        style={{
          fontSize: 12,
          color: TEXT_MUTED,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          fontWeight: 700,
        }}
      >
        Available — No D/P
      </div>
      <div
        style={{
          fontSize: 11,
          color: TEXT_FAINT,
          marginTop: 4,
        }}
      >
        Total available gold after excluding Discount / Premium effect
      </div>
      <div
        style={{
          fontSize: 48,
          fontWeight: 900,
          marginTop: 12,
          fontVariantNumeric: "tabular-nums",
          letterSpacing: "-0.02em",
          color,
          fontFamily: displayFont,
          lineHeight: 1,
        }}
      >
        {fmtGNum(grams)}
        <span
          style={{
            fontSize: 22,
            color,
            marginLeft: 10,
            fontWeight: 700,
            opacity: 0.85,
          }}
        >
          g
        </span>
      </div>
    </div>
  );
}

/* -------------------- Summary card (one-page overview) -------------------- */

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
}) => {
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
      <Brand subtitle="Company Summary" />
      <CompanyHeader name={summary.company.name} generatedAt={generatedAt} />

      <div
        style={{
          marginTop: 18,
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
          label="Total Discount / Premium (USD)"
          value={fmtUSD(summary.dp_charges_usd)}
          valueColor={summary.dp_charges_usd < 0 ? DANGER : OK}
          emphasize
        />
      </div>

      <AvailableHighlight grams={summary.clean_remaining_grams} />

      <BrandFooter qr={qr} />
    </div>
  );
};

/* -------------------- Full transaction statement -------------------- */

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
  // ALL transactions sorted newest first — no filtering by kind
  const all = [...txs].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  return (
    <div
      ref={ref}
      style={{
        width: 880,
        background: BG,
        color: TEXT,
        fontFamily: baseFont,
        padding: "32px 36px 28px",
      }}
    >
      <Brand subtitle="Gold Discount Balance" />
      <CompanyHeader name={summary.company.name} generatedAt={generatedAt} />

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
          — All Transactions ({all.length}) —
        </div>

        {all.length === 0 ? (
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
            No transactions recorded for this company.
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
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                tableLayout: "fixed",
                fontVariantNumeric: "tabular-nums",
              }}
            >
              <colgroup>
                <col style={{ width: "20%" }} />
                <col style={{ width: "12%" }} />
                <col style={{ width: "15%" }} />
                <col style={{ width: "53%" }} />
              </colgroup>
              <thead>
                <tr style={{ background: CARD_2 }}>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 10, color: TEXT_MUTED, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Date</th>
                  <th style={{ textAlign: "left", padding: "12px 16px", fontSize: 10, color: TEXT_MUTED, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Type</th>
                  <th style={{ textAlign: "right", padding: "12px 16px", fontSize: 10, color: TEXT_MUTED, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Weight</th>
                  <th style={{ textAlign: "left", padding: "12px 18px", fontSize: 10, color: TEXT_MUTED, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: 700 }}>Notes</th>
                </tr>
              </thead>
              <tbody>
                {all.map((t) => (
                  <tr key={t.id} style={{ borderTop: `1px solid ${BORDER_SOFT}` }}>
                    <td style={{ padding: "12px 16px", verticalAlign: "middle", color: TEXT_SOFT, fontSize: 11, whiteSpace: "nowrap" }}>
                      {fmtDate(t.created_at)}
                    </td>
                    <td style={{ padding: "12px 16px", verticalAlign: "middle", fontSize: 10, fontWeight: 800, letterSpacing: "0.12em", color: TX_COLOR[t.kind], whiteSpace: "nowrap" }}>
                      {TX_LABEL[t.kind]}
                    </td>
                    <td style={{ padding: "12px 16px", verticalAlign: "middle", textAlign: "right", color: TEXT, fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
                      {fmtGNum(Number(t.grams))} g
                    </td>
                    <td style={{ padding: "12px 18px", verticalAlign: "middle", color: TEXT_SOFT, fontSize: 11, lineHeight: 1.55, wordBreak: "break-word", overflowWrap: "anywhere" }}>
                      {formatTxNote(t)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Total Discount / Premium */}
      <div
        style={{
          marginTop: 16,
          padding: "18px 22px",
          background: CARD,
          border: `1px solid ${BORDER}`,
          borderRadius: 10,
          textAlign: "center",
        }}
      >
        <div
          style={{
            fontSize: 11,
            color: TEXT_MUTED,
            letterSpacing: "0.18em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          Total Discount / Premium
        </div>
        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "center",
            alignItems: "baseline",
            gap: 28,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: TEXT,
              fontVariantNumeric: "tabular-nums",
              fontFamily: displayFont,
              letterSpacing: "-0.01em",
            }}
          >
            {fmtG(summary.dp_grams)}
          </div>
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              color: summary.dp_charges_usd < 0 ? DANGER : OK,
              fontVariantNumeric: "tabular-nums",
              fontFamily: displayFont,
              letterSpacing: "-0.01em",
            }}
          >
            {fmtUSD(summary.dp_charges_usd)}
          </div>
        </div>
      </div>

      {/* Final highlighted result */}
      <AvailableHighlight grams={summary.clean_remaining_grams} />

      <BrandFooter qr={qr} />
    </div>
  );
};

