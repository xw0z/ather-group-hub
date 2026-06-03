import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Copy, Share2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSwapUser } from "@/lib/swap-users.functions";
import { getSwapClientHistory } from "@/lib/swap-clients.functions";
import { SwapFooter } from "@/components/SwapFooter";

export const Route = createFileRoute("/swap/clients/$clientId")({
  head: () => ({
    meta: [
      { title: "Swap — Client" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SwapClientDetail,
});

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function money(n: number, d = 2): string {
  return `${n < 0 ? "-" : ""}$${fmt(Math.abs(n), d)}`;
}

type History = Awaited<ReturnType<typeof getSwapClientHistory>>;

function fmtSnapshot(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZoneName: "short",
    });
  } catch {
    return iso;
  }
}

function buildMessage(
  code: string,
  _notes: string | null,
  feeDate: string,
  snapshotAt: string,
  balance: number,
  dailyFee: number,
  rate: number,
  xauusd: number | null,
  positionType: "long" | "short",
): string {
  const isShort = positionType === "short";
  const absFee = Math.abs(dailyFee);
  const amountLine = isShort
    ? `Swap benefit credited: *+$${fmt(absFee)}*`
    : `Swap fee: *-$${fmt(absFee)}*`;
  return (
    `Swap Statement — ${feeDate}\n` +
    `Client: ${code}\n` +
    `Position: ${isShort ? "Short / Sell" : "Long / Buy"}\n` +
    `Snapshot: ${fmtSnapshot(snapshotAt)}` +
    (xauusd !== null ? ` · XAUUSD $${fmt(xauusd)}` : "") +
    `\n\n` +
    `Balance: ${money(balance)}\n` +
    `Rate: ${fmt(rate)}% p.a.\n` +
    amountLine
  );
}

function SwapClientDetail() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<History | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const { data: sess } = await supabase.auth.getSession();
      if (!sess.session) {
        navigate({ to: "/swap", replace: true });
        return;
      }
      try {
        const me = await getCurrentSwapUser();
        if (cancelled) return;
        if (!me.isSwapUser) {
          await supabase.auth.signOut();
          navigate({ to: "/swap", replace: true });
          return;
        }
        const h = await getSwapClientHistory({ data: { id: clientId } });
        if (cancelled) return;
        setData(h);
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load.");
        setReady(true);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [clientId, navigate]);

  async function copyMsg(id: string, msg: string) {
    try {
      await navigator.clipboard.writeText(msg);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      alert("Copy failed");
    }
  }

  async function shareMsg(msg: string) {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await (navigator as Navigator & { share: (d: ShareData) => Promise<void> }).share({
          text: msg,
        });
        return;
      } catch {
        // fallthrough to WhatsApp
      }
    }
    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, "_blank", "noopener");
  }

  if (!ready) {
    return (
      <main className="min-h-screen bg-background text-foreground grid place-items-center">
        <p className="text-sm text-muted-foreground">Loading…</p>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="min-h-screen bg-background text-foreground p-6">
        <Button variant="ghost" size="sm" onClick={() => navigate({ to: "/swap/dashboard" })}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <p className="mt-4 text-sm text-destructive">{error ?? "Not found"}</p>
      </main>
    );
  }

  const c = data.client;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 bg-card/60 sticky top-0 z-10">
        <div className="mx-auto max-w-3xl px-4 py-3 flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/swap/dashboard" })}
          >
            <ArrowLeft className="h-4 w-4 mr-1" /> Back
          </Button>
          <div className="text-right min-w-0">
            <p className="text-sm font-semibold truncate flex items-center gap-2 justify-end">
              <span>{c.code}</span>
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded ${
                  c.position_type === "short"
                    ? "bg-red-500/15 text-red-600"
                    : "bg-green-500/15 text-green-600"
                }`}
              >
                {c.position_type === "short" ? "Short / Sell" : "Long / Buy"}
              </span>
              {c.notes ? (
                <span className="text-muted-foreground font-normal"> ({c.notes})</span>
              ) : null}
            </p>
            <p className="text-[11px] text-muted-foreground">
              ${fmt(c.usd_balance)} ·{" "}
              {fmt(
                c.position_type === "short" ? c.short_annual_rate : c.annual_rate,
              )}
              %/yr {c.position_type === "short" ? "(benefit)" : "(fee)"}
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5 space-y-4">
        <section className="rounded-xl border border-border/60 bg-card p-4">
          <h2 className="text-sm font-semibold mb-3">
            {c.position_type === "short" ? "Daily swap benefits" : "Daily swap fees"}
          </h2>
          {data.fees.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No daily snapshots yet. Run the nightly job or use “Run now” on Home.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.fees.map((f) => {
                const isShort = (f.position_type ?? "long") === "short";
                const msg = buildMessage(
                  c.code,
                  c.notes,
                  f.fee_date,
                  f.created_at,
                  f.usd_balance,
                  f.daily_fee,
                  f.annual_rate,
                  f.xauusd_price,
                  isShort ? "short" : "long",
                );
                return (
                  <li
                    key={f.id}
                    className="rounded-md border border-border/60 p-3 bg-background"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="font-medium flex items-center gap-2">
                          <span>{f.fee_date}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isShort
                                ? "bg-red-500/15 text-red-600"
                                : "bg-green-500/15 text-green-600"
                            }`}
                          >
                            {isShort ? "Short / Sell" : "Long / Buy"}
                          </span>
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Snapshot: {fmtSnapshot(f.created_at)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          Balance ${fmt(f.usd_balance)} · {fmt(f.annual_rate)}%/yr
                          {f.xauusd_price ? ` · XAUUSD $${fmt(f.xauusd_price)}` : ""}
                        </div>
                        <div className="text-sm mt-1">
                          {isShort ? "Benefit credited: " : "Fee charged: "}
                          <span
                            className={`font-semibold ${
                              isShort ? "text-red-600" : "text-green-600"
                            }`}
                          >
                            {isShort ? "+" : "-"}${fmt(f.daily_fee)}
                          </span>
                        </div>
                      </div>
                      <div className="flex flex-col gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => copyMsg(f.id, msg)}
                        >
                          {copiedId === f.id ? (
                            <Check className="h-4 w-4 mr-1" />
                          ) : (
                            <Copy className="h-4 w-4 mr-1" />
                          )}
                          {copiedId === f.id ? "Copied" : "Copy"}
                        </Button>
                        <Button size="sm" onClick={() => shareMsg(msg)}>
                          <Share2 className="h-4 w-4 mr-1" /> Share
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </main>
      <SwapFooter />
    </div>
  );
}
