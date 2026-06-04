import { createFileRoute, useNavigate, useSearch, redirect } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import html2canvas from "html2canvas-pro";
import {
  DollarSign,
  Plus,
  Trash2,
  Pencil,
  Check,
  X,
  LogOut,
  UserPlus,
  ShieldCheck,
  Home,
  Users as UsersIcon,
  ScrollText,
  UserCircle,
  RefreshCw,
  Share2,
  TrendingUp,
  FileText,
  Settings as SettingsIcon,
  Menu,
  Scale,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import {
  createSwapUser,
  deleteSwapUser,
  getCurrentSwapUser,
  listSwapUsers,
} from "@/lib/swap-users.functions";
import {
  computeMargin,
  createSwapClient,
  deleteSwapClient,
  getLiveXauPrice,
  listSwapActivityLog,
  listSwapClients,
  listSwapMarginHistory,
  listTodaySwapFees,
  setManualXauPrice,
  updateSwapClient,
} from "@/lib/swap-clients.functions";
import { updateSwapOwnPassword } from "@/lib/swap-profile.functions";
import { cached, invalidate, CK } from "@/lib/swap-cache";
import { SwapFooter } from "@/components/SwapFooter";
import { SettingsPanel } from "@/components/swap/SettingsPanel";
import { ReportsCenter } from "@/components/swap/ReportsCenter";
import { AuditLogPanel } from "@/components/swap/AuditLogPanel";
import { UsersPanel } from "@/components/swap/UsersPanel";
import { PremiumPanel } from "@/components/swap/PremiumPanel";
import { PurityDashboard } from "@/routes/purity/dashboard";
import type { AppModule } from "@/lib/permissions";
import { can } from "@/lib/permissions";
import { useMyPermissions } from "@/hooks/use-my-permissions";
import { useLang } from "@/lib/purity-i18n";


const TAB_VALUES = [
  "dashboard",
  "purity",
  "clients",
  "swap-fees",
  "margin",
  "premium",
  "reports",
  "audit",
  "users",
  "settings",
  "profile",
] as const;
type Tab = (typeof TAB_VALUES)[number];

// Map each tab to its canonical /desk/app/* URL.
export const TAB_TO_DESK_PATH: Record<Tab, string> = {
  dashboard: "/desk/app/dashboard",
  purity: "/desk/app/purity",
  clients: "/desk/app/swap",
  "swap-fees": "/desk/app/swap",
  margin: "/desk/app/margin",
  premium: "/desk/app/discount-premium",
  reports: "/desk/app/reports",
  audit: "/desk/app/audit",
  users: "/desk/app/users",
  settings: "/desk/app/settings",
  profile: "/desk/app/profile",
};

// Legacy /swap/dashboard?tab=... → redirect to the new /desk/app/* URL.
export const Route = createFileRoute("/swap/dashboard")({
  validateSearch: (search: Record<string, unknown>): { tab: Tab } => {
    const t = String(search.tab ?? "dashboard") as Tab;
    return { tab: TAB_VALUES.includes(t) ? t : "dashboard" };
  },
  beforeLoad: ({ search }) => {
    const path = TAB_TO_DESK_PATH[search.tab] ?? "/desk/app/dashboard";
    const sub = search.tab === "swap-fees" ? { view: "fees" as const } : undefined;
    throw redirect({ to: path as never, search: sub as never, replace: true });
  },
});

type SwapUser = {
  id: string;
  username: string;
  email: string | null;
  is_admin: boolean;
  created_at: string;
};

type SwapClient = {
  id: string;
  code: string;
  usd_balance: number;
  gold_kg: number;
  xauusd_price: number | null;
  margin_requirement_pct: number;
  annual_rate: number;
  short_annual_rate: number;
  position_type: "long" | "short";
  notes: string | null;
  created_at: string;
};

type MarginHistoryRow = {
  id: string;
  client_id: string;
  username: string;
  changed_field: string;
  old_usd_balance: number | null;
  new_usd_balance: number | null;
  old_gold_kg: number | null;
  new_gold_kg: number | null;
  old_xauusd_price: number | null;
  new_xauusd_price: number | null;
  old_margin_pct: number | null;
  new_margin_pct: number | null;
  old_required_margin: number | null;
  new_required_margin: number | null;
  old_available_margin: number | null;
  new_available_margin: number | null;
  old_status: string | null;
  new_status: string | null;
  created_at: string;
};

type ActivityRow = {
  id: string;
  user_id: string;
  username: string;
  action: string;
  entity_type: string | null;
  entity_id: string | null;
  details: unknown;
  created_at: string;
};

function fmt(n: number, d = 2): string {
  return Number(n).toLocaleString(undefined, {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}
function fmtMoney(n: number, d = 2): string {
  const v = Number(n);
  return `${v < 0 ? "-" : ""}$${fmt(Math.abs(v), d)}`;
}

function snapshotStamp(d = new Date()): string {
  return d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  });
}

const TROY_OZ_PER_KG_LOCAL = 32.1507466;

type ReportClient = {
  code: string;
  name?: string | null;
  usd_balance: number;
  gold_kg: number;
  margin_requirement_pct: number;
  position_type: "long" | "short";
};

function reportSnapshot(d = new Date()): string {
  const date = d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
  });
  const time = d.toLocaleString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZoneName: "short",
  });
  return `${date} ${time}`;
}

async function shareClientMarginReport(
  client: ReportClient,
  xauPrice: number,
): Promise<void> {
  const usd = Number(client.usd_balance);
  const goldKg = Number(client.gold_kg);
  const goldGrams = goldKg * 1000;
  const goldValue = goldKg * TROY_OZ_PER_KG_LOCAL * xauPrice;
  const equity = usd + goldValue;
  const reqPct = Number(client.margin_requirement_pct);
  const requiredMargin = (goldValue * reqPct) / 100;
  const marginLevelPct = requiredMargin > 0 ? (equity / requiredMargin) * 100 : 0;
  const diff = equity - requiredMargin;

  let tier: "safe" | "warning" | "needed" | "critical";
  if (requiredMargin <= 0) tier = equity < 0 ? "critical" : "safe";
  else if (equity < 0) tier = "critical";
  else if (marginLevelPct >= 120) tier = "safe";
  else if (marginLevelPct >= 100) tier = "warning";
  else tier = "needed";

  const statusLabel =
    tier === "safe"
      ? "✓ Safe"
      : tier === "warning"
        ? "⚠ Warning"
        : tier === "critical"
          ? "✕ Critical Margin"
          : "⚠ Margin Needed";
  const statusColor =
    tier === "safe"
      ? "#22c55e"
      : tier === "warning"
        ? "#f59e0b"
        : "#ef4444";

  const money = (n: number) =>
    `${n < 0 ? "-" : ""}$${Math.abs(n).toLocaleString(undefined, {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  const num = (n: number, d = 2) =>
    n.toLocaleString(undefined, {
      minimumFractionDigits: d,
      maximumFractionDigits: d,
    });

  const action = tier === "safe"
    ? { label: "Extra Available", value: money(Math.max(0, diff)), color: "#22c55e" }
    : { label: "Amount To Add", value: money(Math.abs(diff)), color: "#ef4444" };

  const positionLabel =
    client.position_type === "short" ? "Short / Sell" : "Long / Buy";

  const row = (label: string, value: string, valueColor?: string) => `
    <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0;border-bottom:1px solid #2a2a2a">
      <span style="font-size:13px;color:#9a9a9a;letter-spacing:0.02em">${label}</span>
      <span style="font-size:15px;color:${valueColor ?? "#f4f1ec"};font-weight:600;font-variant-numeric:tabular-nums">${value}</span>
    </div>
  `;

  const stage = document.createElement("div");
  stage.style.position = "fixed";
  stage.style.left = "-10000px";
  stage.style.top = "0";
  stage.style.width = "600px";
  stage.style.padding = "32px";
  stage.style.background = "#1a1a1a";
  stage.style.color = "#f4f1ec";
  stage.style.fontFamily =
    'Epilogue, Inter, system-ui, -apple-system, "Segoe UI", sans-serif';
  stage.style.zIndex = "-1";

  stage.innerHTML = `
    <div style="display:flex;align-items:center;gap:12px;margin-bottom:6px">
      <div style="width:38px;height:38px;border-radius:8px;background:linear-gradient(135deg,#e85d3a,#c64a2d);display:flex;align-items:center;justify-content:center;font-weight:800;color:#1a1a1a;font-size:18px;font-family:Urbanist,sans-serif">A</div>
      <div>
        <div style="font-family:Urbanist,sans-serif;font-weight:800;letter-spacing:-0.02em;font-size:18px;line-height:1">ATHER GROUP</div>
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.14em;text-transform:uppercase;margin-top:3px">Margin Report</div>
      </div>
    </div>

    <div style="margin-top:22px;display:flex;justify-content:space-between;gap:16px">
      <div>
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.08em;text-transform:uppercase">Client Code</div>
        <div style="font-size:22px;font-weight:700;margin-top:2px;letter-spacing:-0.01em">${client.code}</div>
      </div>
      <div style="text-align:right">
        <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.08em;text-transform:uppercase">Snapshot</div>
        <div style="font-size:13px;color:#d9d4cc;margin-top:4px">${reportSnapshot()}</div>
      </div>
    </div>

    <div style="margin-top:20px;padding:4px 16px;background:#222;border:1px solid #2f2f2f;border-radius:10px">
      ${row("Position", positionLabel)}
      ${row("Live XAUUSD", `${money(xauPrice)} / oz`)}
      ${row("USD Balance", money(usd), usd < 0 ? "#ef4444" : undefined)}
      ${row("Gold Balance", `${num(goldGrams, 0)} g`)}
      ${row("Gold Value", money(goldValue))}
      ${row("Equity (USD + Gold)", money(equity), equity < 0 ? "#ef4444" : undefined)}
      ${row("Margin Requirement", `${num(reqPct)}%`)}
      ${row("Required Margin", money(requiredMargin))}
      <div style="display:flex;justify-content:space-between;align-items:baseline;padding:10px 0">
        <span style="font-size:13px;color:#9a9a9a;letter-spacing:0.02em">Margin Level</span>
        <span style="font-size:20px;color:${statusColor};font-weight:700;font-variant-numeric:tabular-nums">${num(marginLevelPct)}%</span>
      </div>
    </div>

    <div style="margin-top:16px;padding:14px 16px;background:${statusColor}1f;border:1px solid ${statusColor}55;border-radius:10px;text-align:center">
      <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.12em;text-transform:uppercase">Status</div>
      <div style="font-size:20px;font-weight:800;color:${statusColor};margin-top:4px;letter-spacing:0.01em">${statusLabel}</div>
    </div>

    <div style="margin-top:14px;padding:18px 16px;background:#222;border:1px solid #2f2f2f;border-radius:10px;text-align:center">
      <div style="font-size:11px;color:#9a9a9a;letter-spacing:0.12em;text-transform:uppercase">${action.label}</div>
      <div style="font-size:30px;font-weight:800;color:${action.color};margin-top:6px;font-variant-numeric:tabular-nums;letter-spacing:-0.01em">${action.value}</div>
    </div>

    <div style="margin-top:22px;padding-top:14px;border-top:1px solid #2a2a2a;text-align:center">
      <div style="font-size:10px;color:#7a7a7a;font-style:italic">Generated using live XAUUSD market price at report time.</div>
      <div style="margin-top:10px;font-family:Urbanist,sans-serif;font-weight:800;letter-spacing:0.04em;font-size:12px;color:#d9d4cc">ATHER GROUP</div>
      <div style="font-size:10px;color:#7a7a7a;letter-spacing:0.1em;text-transform:uppercase;margin-top:2px">Confidential Client Report</div>
    </div>
  `;

  document.body.appendChild(stage);

  try {
    const canvas = await html2canvas(stage, {
      backgroundColor: "#1a1a1a",
      scale: Math.max(4, Math.min(6, (window.devicePixelRatio || 1) * 3)),
      useCORS: true,
      logging: false,
    });
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), "image/png"),
    );
    if (!blob) throw new Error("Failed to render image");

    const date = new Date().toISOString().slice(0, 10);
    const filename = `margin-report-${client.code}-${date}.png`;
    const file = new File([blob], filename, { type: "image/png" });

    const nav = navigator as Navigator & {
      canShare?: (data: ShareData) => boolean;
      share?: (data: ShareData) => Promise<void>;
    };
    if (nav.canShare && nav.canShare({ files: [file] }) && nav.share) {
      try {
        await nav.share({
          files: [file],
          title: `Margin report — ${client.code}`,
          text: `Margin report for ${client.code}`,
        });
        return;
      } catch {
        // fall through to download
      }
    }

    try {
      if (
        typeof ClipboardItem !== "undefined" &&
        navigator.clipboard &&
        "write" in navigator.clipboard
      ) {
        await navigator.clipboard.write([
          new ClipboardItem({ "image/png": blob }),
        ]);
      }
    } catch {
      /* ignore */
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } finally {
    stage.remove();
  }
}

type LiveXau = Awaited<ReturnType<typeof getLiveXauPrice>>;




type NavItem = {
  key: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  module?: AppModule; // when set, requires `view` permission on this module
  adminOnly?: boolean;
  external?: string; // external link (e.g. /purity/dashboard)
};

const NAV_ITEMS: NavItem[] = [
  { key: "dashboard", label: "nav.dashboard", icon: Home },
  { key: "clients", label: "nav.clients", icon: UsersIcon, module: "swap" },
  { key: "purity", label: "nav.purity", icon: Scale, module: "purity" },
  { key: "swap-fees", label: "nav.swapFees", icon: DollarSign, module: "swap" },
  { key: "margin", label: "nav.margin", icon: ShieldCheck, module: "margin" },
  { key: "premium", label: "nav.premium", icon: TrendingUp, module: "premium" },
  { key: "reports", label: "nav.reports", icon: FileText, module: "reports" },
  { key: "audit", label: "nav.audit", icon: ScrollText, module: "audit", adminOnly: true },
  { key: "users", label: "nav.users", icon: UserPlus, module: "users", adminOnly: true },
  { key: "settings", label: "nav.settings", icon: SettingsIcon, module: "settings" },
  { key: "profile", label: "Profile", icon: UserCircle },
];



export function SwapDashboard({
  tab: tabProp,
  swapView,
  purityTripId,
}: {
  tab?: Tab;
  swapView?: "clients" | "fees";
  purityTripId?: string;
} = {}) {
  const navigate = useNavigate();
  // Tab can come from prop (new /desk/app/* routes) or legacy ?tab= search.
  let searchTab: Tab | undefined;
  try {
    const s = useSearch({ strict: false }) as { tab?: string; view?: string };
    if (s.tab && (TAB_VALUES as readonly string[]).includes(s.tab)) {
      searchTab = s.tab as Tab;
    }
    if (!swapView && s.view === "fees") {
      swapView = "fees";
    }
  } catch {
    /* no search context */
  }
  const baseTab: Tab = tabProp ?? searchTab ?? "dashboard";
  // /desk/app/swap with ?view=fees renders the swap-fees panel.
  const tab: Tab = baseTab === "clients" && swapView === "fees" ? "swap-fees" : baseTab;

  const [ready, setReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [livePrice, setLivePrice] = useState<LiveXau | null>(null);
  const [livePriceLoading, setLivePriceLoading] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const { perms } = useMyPermissions();
  const { t } = useLang();


  const setTab = (next: Tab) => {
    setNavOpen(false);
    const path = TAB_TO_DESK_PATH[next];
    const search = next === "swap-fees" ? { view: "fees" } : undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate({ to: path as any, search: search as any, replace: false });
  };

  const refreshPrice = async () => {
    setLivePriceLoading(true);
    try {
      const r = await getLiveXauPrice();
      setLivePrice(r);
    } catch (e) {
      console.error("Failed to fetch live XAU", e);
    } finally {
      setLivePriceLoading(false);
    }
  };

  useEffect(() => {
    if (!ready) return;
    refreshPrice();
    const id = setInterval(refreshPrice, 2 * 60 * 1000);
    return () => clearInterval(id);
  }, [ready]);

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/desk/login", replace: true });
        return;
      }
      try {
        const me = await getCurrentSwapUser();
        if (cancelled) return;
        if (!me.isSwapUser) {
          await supabase.auth.signOut();
          navigate({ to: "/desk/login", replace: true });
          return;
        }
        setIsAdmin(me.isAdmin);
        setUsername(me.username ?? "");
        setReady(true);
      } catch {
        navigate({ to: "/desk/login", replace: true });
      }
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/desk/login", replace: true });
  };

  if (!ready) {
    return (
      <main className="min-h-screen bg-background text-foreground grid place-items-center">
        <p className="text-sm text-muted-foreground">{t("common.loading")}</p>

      </main>
    );
  }

  const visibleNav = NAV_ITEMS.filter((n) => {
    if (n.adminOnly && !isAdmin) return false;
    if (!n.module) return true; // dashboard always visible
    return can(perms, n.module, "view");
  });
  const currentLabel = t(NAV_ITEMS.find((n) => n.key === tab)?.label ?? "nav.dashboard");

  // Permission gate: if the user can't view the requested tab, fall back to dashboard
  const requested = NAV_ITEMS.find((n) => n.key === tab);
  const tabAllowed =
    !requested ||
    !requested.module ||
    (requested.adminOnly ? isAdmin : true) && can(perms, requested.module, "view");
  const effectiveTab: Tab = tabAllowed ? tab : "dashboard";


  return (
    <div className="min-h-screen bg-background text-foreground flex">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-60 border-r border-border/60 bg-card/40 sticky top-0 h-screen">
        <div className="px-4 py-4 border-b border-border/60">
          <div className="flex items-center gap-2">
            <div className="h-9 w-9 rounded-md bg-primary/15 border border-primary/40 grid place-items-center">
              <DollarSign className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">
                ATHER
              </p>
              <p className="text-[11px] text-muted-foreground leading-tight">
                Desk
              </p>
            </div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {visibleNav.map((n) => (
            <NavBtn key={n.key} item={n} active={effectiveTab === n.key} onClick={() => setTab(n.key)} />
          ))}
        </nav>
        <div className="p-3 border-t border-border/60">
          <p className="text-[11px] text-muted-foreground truncate">
            {username}
            {isAdmin && " · admin"}
          </p>
          <Button variant="ghost" size="sm" className="w-full justify-start mt-1" onClick={signOut}>
            <LogOut className="h-4 w-4 mr-2" /> Sign out
          </Button>
        </div>
      </aside>

      {/* Mobile drawer */}
      {navOpen && (
        <div className="md:hidden fixed inset-0 z-40 bg-black/50" onClick={() => setNavOpen(false)}>
          <aside
            className="absolute left-0 top-0 bottom-0 w-64 bg-card border-r border-border/60 p-3 flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold">ATHER Desk</p>
              <Button variant="ghost" size="icon" onClick={() => setNavOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <nav className="flex-1 overflow-y-auto space-y-0.5">
              {visibleNav.map((n) => (
                <NavBtn key={n.key} item={n} active={effectiveTab === n.key} onClick={() => setTab(n.key)} />
              ))}
            </nav>
            <div className="pt-3 border-t border-border/60 mt-3">
              <p className="text-[11px] text-muted-foreground truncate">
                {username}
                {isAdmin && " · admin"}
              </p>
              <Button variant="ghost" size="sm" className="w-full justify-start mt-1" onClick={signOut}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </Button>
            </div>
          </aside>
        </div>
      )}

      <div className="flex-1 min-w-0 flex flex-col">
        <header className="md:hidden border-b border-border/60 bg-card/60 sticky top-0 z-10">
          <div className="px-3 py-3 flex items-center justify-between gap-2">
            <Button variant="ghost" size="icon" onClick={() => setNavOpen(true)}>
              <Menu className="h-5 w-5" />
            </Button>
            <p className="text-sm font-semibold truncate">{currentLabel}</p>
            <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </header>

        <main className="mx-auto w-full max-w-3xl px-4 py-5 space-y-5 flex-1">
          {effectiveTab === "dashboard" && (
            <>
              {can(perms, "swap", "view") && (
                <HomeTab
                  isAdmin={isAdmin}
                  livePrice={livePrice}
                  livePriceLoading={livePriceLoading}
                  onRefreshPrice={refreshPrice}
                  onPriceChanged={setLivePrice}
                />
              )}
              {can(perms, "margin", "view") && (
                <MarginTab livePrice={livePrice} showLiveCard={false} />
              )}
              {!can(perms, "swap", "view") && !can(perms, "margin", "view") && (
                <section className="rounded-xl border border-border/60 bg-card p-6 text-center text-sm text-muted-foreground">
                  Select a module from the sidebar to get started.
                </section>
              )}
            </>
          )}
          {effectiveTab === "purity" && can(perms, "purity", "view") && <PurityDashboard inShell tripId={purityTripId} />}
          {effectiveTab === "clients" && can(perms, "swap", "view") && <ClientsTab livePrice={livePrice} />}
          {effectiveTab === "swap-fees" && can(perms, "swap", "view") && (
            <HomeTab
              isAdmin={isAdmin}
              livePrice={livePrice}
              livePriceLoading={livePriceLoading}
              onRefreshPrice={refreshPrice}
              onPriceChanged={setLivePrice}
            />
          )}
          {effectiveTab === "margin" && can(perms, "margin", "view") && (
            <MarginTab
              livePrice={livePrice}
              showLiveCard
              isAdmin={isAdmin}
              livePriceLoading={livePriceLoading}
              onRefreshPrice={refreshPrice}
              onPriceChanged={setLivePrice}
            />
          )}
          {effectiveTab === "premium" && can(perms, "premium", "view") && <PremiumPanel />}
          {effectiveTab === "reports" && can(perms, "reports", "view") && <ReportsTab />}
          {effectiveTab === "audit" && isAdmin && <AuditLogTab />}
          {effectiveTab === "users" && isAdmin && (
            <UsersPanel currentUsername={username} />
          )}
          {effectiveTab === "settings" && can(perms, "settings", "view") && <SettingsTab />}
          {effectiveTab === "profile" && <ProfileTab username={username} />}
        </main>
        <SwapFooter />
      </div>
    </div>
  );
}

function NavBtn({
  item,
  active,
  onClick,
}: {
  item: NavItem;
  active: boolean;
  onClick: () => void;
}) {
  const Icon = item.icon;
  const { t } = useLang();
  return (
    <button
      onClick={onClick}
      className={`w-full inline-flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
        active
          ? "bg-green-500/15 text-green-600 font-medium"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
      }`}
    >
      <Icon className="h-4 w-4 mr-2.5" />
      {t(item.label)}
    </button>
  );
}


function ReportsTab() {
  return <ReportsCenter />;
}


function SettingsTab() {
  return <SettingsPanel />;
}


function AuditLogTab() {
  return <AuditLogPanel />;
}

/* ----------------------------- HOME ----------------------------- */


function HomeTab({
  isAdmin,
  livePrice,
  livePriceLoading,
  onRefreshPrice,
  onPriceChanged,
}: {
  isAdmin: boolean;
  livePrice: LiveXau | null;
  livePriceLoading: boolean;
  onRefreshPrice: () => void;
  onPriceChanged: (p: LiveXau) => void;
}) {
  const navigate = useNavigate();
  const [data, setData] = useState<Awaited<ReturnType<typeof listTodaySwapFees>> | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const r = await cached(CK.todayFees, () => listTodaySwapFees(), 30_000);
      setData(r);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const totalLive = useMemo(
    () => data?.rows.reduce((s, r) => s + r.base_daily_fee, 0) ?? 0,
    [data],
  );
  const totalToday = useMemo(
    () => data?.rows.reduce((s, r) => s + (r.today_fee ?? 0), 0) ?? 0,
    [data],
  );

  return (
    <div className="space-y-4">
      <LiveXauCard
        isAdmin={isAdmin}
        livePrice={livePrice}
        loading={livePriceLoading}
        onRefresh={onRefreshPrice}
        onPriceChanged={onPriceChanged}
      />

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div>
          <h2 className="text-sm font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4 text-primary" /> Daily swap fees
          </h2>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {data?.lastXauPrice
              ? `XAUUSD ${fmt(data.lastXauPrice)} · last snapshot ${data.lastXauDate}`
              : "No gold price snapshot yet."}
          </p>
        </div>


        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total today (snapshot)</div>
            <div className="font-semibold">${fmt(totalToday)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total live (current balances)</div>
            <div className="font-semibold">${fmt(totalLive)}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Per-client daily fees</h3>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !data || data.rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No clients yet — add one in the Clients tab.
          </p>
        ) : (
          <ul className="space-y-2">
            {data.rows.map((r) => {
              const isShort = r.position_type === "short";
              const amountLabel = isShort ? "Benefit today" : "Fee today";
              const snapPrefix = isShort ? "today benefit" : "today fee";
              const lastPrefix = isShort ? "last benefit" : "last fee";
              return (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() =>
                      navigate({ to: "/swap/clients/$clientId", params: { clientId: r.id } })
                    }
                    className="w-full text-left rounded-md border border-border/60 p-3 bg-background hover:bg-muted/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          <span>{r.code}</span>
                          <span
                            className={`text-[10px] px-1.5 py-0.5 rounded ${
                              isShort
                                ? "bg-red-500/15 text-red-600"
                                : "bg-green-500/15 text-green-600"
                            }`}
                          >
                            {isShort ? "Short / Sell" : "Long / Buy"}
                          </span>
                          {r.notes ? (
                            <span className="text-muted-foreground font-normal truncate">
                              ({r.notes})
                            </span>
                          ) : null}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          ${fmt(r.usd_balance)} · {fmt(r.effective_annual_rate)}%/yr{" "}
                          {isShort ? "(benefit)" : "(fee)"}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`font-semibold ${
                            isShort ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {isShort ? "+" : "-"}${fmt(r.base_daily_fee)}
                        </div>
                        <div className="text-[11px] text-muted-foreground">
                          {amountLabel}:{" "}
                          {r.today_fee !== null
                            ? `${snapPrefix} $${fmt(r.today_fee)}`
                            : r.last_fee !== null
                              ? `${lastPrefix} ${r.last_fee_date} $${fmt(r.last_fee)}`
                              : "no snapshot yet"}
                        </div>
                      </div>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>

        )}
        <p className="text-[11px] text-muted-foreground mt-3">
          Formula: USD balance × annual rate% ÷ 365 × day multiplier. Long positions are
          charged a fee using the long annual rate; Short positions receive a benefit credit
          using the short annual benefit rate. Mon/Tue/Thu/Fri = 1 day, Wednesday = 3 days
          (covers the weekend in advance), Sat/Sun = 0. No additional swap is charged or
          credited on Saturday or Sunday.
          {data ? (
            <>
              {" "}Today&apos;s multiplier: <span className="font-medium">{data.todayMultiplier}×</span>.
            </>
          ) : null}
        </p>
      </section>
    </div>
  );
}

/* ---------------------------- CLIENTS ---------------------------- */

type MarginLogFilter = "all" | "enough" | "needed";

function ClientsTab({ livePrice }: { livePrice: LiveXau | null }) {
  const [clients, setClients] = useState<SwapClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<MarginLogFilter>("all");

  const [code, setCode] = useState("");
  const [balance, setBalance] = useState("");
  const [goldAmount, setGoldAmount] = useState("0");
  const [xau, setXau] = useState("");
  const [marginPct, setMarginPct] = useState("20");
  const [rate, setRate] = useState("5.4");
  const [shortRate, setShortRate] = useState("2.5");
  const [positionType, setPositionType] = useState<"long" | "short">("long");
  const [notes, setNotes] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editCode, setEditCode] = useState("");
  const [editBalance, setEditBalance] = useState("");
  const [editGoldAmount, setEditGoldAmount] = useState("0");
  const [editXau, setEditXau] = useState("");
  const [editMarginPct, setEditMarginPct] = useState("20");
  const [editRate, setEditRate] = useState("");
  const [editShortRate, setEditShortRate] = useState("");
  const [editPositionType, setEditPositionType] = useState<"long" | "short">("long");
  const cardRefs = useRef<Map<string, HTMLLIElement>>(new Map());
  const [sharingId, setSharingId] = useState<string | null>(null);

  async function share(c: SwapClient) {
    setSharingId(c.id);
    try {
      const xau =
        livePrice && livePrice.price > 0
          ? livePrice.price
          : Number(c.xauusd_price ?? 0);
      if (!xau) throw new Error("No XAU price available");
      await shareClientMarginReport(
        {
          code: c.code,
          name: c.notes ?? null,
          usd_balance: Number(c.usd_balance),
          gold_kg: Number(c.gold_kg ?? 0),
          margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
          position_type: c.position_type,
        },
        xau,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share.");
    } finally {
      setSharingId(null);
    }
  }

  async function load(force = false) {
    setLoading(true);
    try {
      if (force) invalidate(CK.clients);
      const data = await cached(CK.clients, () => listSwapClients(), 60_000);
      setClients(data as SwapClient[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load.");
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createSwapClient({
        data: {
          code: code.trim(),
          usd_balance: parseFloat(balance) || 0,
          gold_kg: (parseFloat(goldAmount) || 0) / 1000,
          xauusd_price: xau.trim() === "" ? null : parseFloat(xau) || 0,
          margin_requirement_pct: parseFloat(marginPct) || 20,
          annual_rate: parseFloat(rate) || 5.4,
          short_annual_rate: parseFloat(shortRate) || 2.5,
          position_type: positionType,
          notes: notes.trim() || null,
        },
      });
      setCode("");
      setBalance("");
      setGoldAmount("0");
      
      setXau("");
      setMarginPct("20");
      setRate("5.4");
      setShortRate("2.5");
      setPositionType("long");
      setNotes("");
      setShowForm(false);
      invalidate(CK.todayFees, CK.margin, CK.activity);
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create.");
    }
  }

  function startEdit(c: SwapClient) {
    setEditingId(c.id);
    setEditCode(c.code);
    setEditBalance(String(c.usd_balance));
    setEditGoldAmount(String((c.gold_kg ?? 0) * 1000));
    setEditXau(c.xauusd_price !== null ? String(c.xauusd_price) : "");
    setEditMarginPct(String(c.margin_requirement_pct ?? 20));
    setEditRate(String(c.annual_rate));
    setEditShortRate(String(c.short_annual_rate ?? 2.5));
    setEditPositionType((c.position_type ?? "long") as "long" | "short");
  }

  async function saveEdit(id: string) {
    try {
      await updateSwapClient({
        data: {
          id,
          code: editCode.trim(),
          usd_balance: parseFloat(editBalance) || 0,
          gold_kg: (parseFloat(editGoldAmount) || 0) / 1000,
          xauusd_price: editXau.trim() === "" ? null : parseFloat(editXau) || 0,
          margin_requirement_pct: parseFloat(editMarginPct) || 20,
          annual_rate: parseFloat(editRate) || 5.4,
          short_annual_rate: parseFloat(editShortRate) || 2.5,
          position_type: editPositionType,
        },
      });
      setEditingId(null);
      invalidate(CK.todayFees, CK.margin, CK.activity);
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    }
  }

  async function remove(id: string, codeStr: string) {
    if (!confirm(`Delete client ${codeStr}?`)) return;
    try {
      await deleteSwapClient({ data: { id } });
      invalidate(CK.todayFees, CK.margin, CK.activity);
      load(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete.");
    }
  }

  // Live XAU price overrides any per-client saved price for margin math.
  const effectiveXau = (c: SwapClient): number | null => {
    if (livePrice && livePrice.price > 0) return livePrice.price;
    return c.xauusd_price !== null ? Number(c.xauusd_price) : null;
  };

  // Aggregate margin totals
  const totals = useMemo(() => {
    let required = 0;
    let available = 0;
    let shortage = 0;
    let needingCount = 0;
    for (const c of clients) {
      const m = computeMargin({
        usd_balance: Number(c.usd_balance),
        gold_kg: Number(c.gold_kg ?? 0),
        xauusd_price: effectiveXau(c),
        margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
      });
      required += m.requiredMargin;
      available += m.availableMargin;
      if (m.status === "needed") {
        shortage += Math.abs(m.difference);
        needingCount += 1;
      }
    }
    return { required, available, shortage, needingCount };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, livePrice]);

  const filteredClients = useMemo(() => {
    if (filter === "all") return clients;
    return clients.filter((c) => {
      const m = computeMargin({
        usd_balance: Number(c.usd_balance),
        gold_kg: Number(c.gold_kg ?? 0),
        xauusd_price: effectiveXau(c),
        margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
      });
      return filter === "enough" ? m.status === "enough" : m.status === "needed";
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, filter, livePrice]);

  return (
    <div className="space-y-4">
      {/* Margin totals */}
      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-primary" /> Margin overview
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total required</div>
            <div className="font-semibold">${fmt(totals.required)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total available</div>
            <div className="font-semibold">${fmt(totals.available)}</div>
          </div>
          <div
            className={`rounded-md px-3 py-2 ${
              totals.shortage > 0
                ? "bg-red-500/15 text-red-600"
                : "bg-green-500/15 text-green-600"
            }`}
          >
            <div className="text-[11px] opacity-80">Total shortage</div>
            <div className="font-semibold">${fmt(totals.shortage)}</div>
          </div>
          <div
            className={`rounded-md px-3 py-2 ${
              totals.needingCount > 0
                ? "bg-red-500/15 text-red-600"
                : "bg-green-500/15 text-green-600"
            }`}
          >
            <div className="text-[11px] opacity-80">Clients needing margin</div>
            <div className="font-semibold">{totals.needingCount}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold">Clients</h2>
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "New client"}
          </Button>
        </div>

        {/* Filters */}
        <div className="flex gap-1 mb-3 flex-wrap">
          {(["all", "enough", "needed"] as MarginLogFilter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-md border transition-colors ${
                filter === f
                  ? f === "needed"
                    ? "border-red-500 bg-red-500/15 text-red-600 font-medium"
                    : f === "enough"
                      ? "border-green-500 bg-green-500/15 text-green-600 font-medium"
                      : "border-primary bg-primary/15 text-foreground font-medium"
                  : "border-border/60 text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all"
                ? `All (${clients.length})`
                : f === "enough"
                  ? `Enough margin (${clients.length - totals.needingCount})`
                  : `Margin needed (${totals.needingCount})`}
            </button>
          ))}
        </div>

        {showForm && (
          <form onSubmit={add} className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-md bg-muted/30">
            <div className="col-span-2">
              <Label className="text-xs">Client code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value)} required />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Position type</Label>
              <div className="grid grid-cols-2 gap-2 mt-1">
                <button
                  type="button"
                  onClick={() => setPositionType("long")}
                  className={`text-xs rounded-md border px-3 py-2 ${
                    positionType === "long"
                      ? "border-primary bg-green-500/15 text-green-600 font-medium"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  Long / Buy (fee)
                </button>
                <button
                  type="button"
                  onClick={() => setPositionType("short")}
                  className={`text-xs rounded-md border px-3 py-2 ${
                    positionType === "short"
                      ? "border-red-500 bg-red-500/10 text-red-600 font-medium"
                      : "border-border/60 text-muted-foreground"
                  }`}
                >
                  Short / Sell (benefit)
                </button>
              </div>
            </div>
            <div>
              <Label className="text-xs">USD balance</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                placeholder="0.00"
                required
              />
            </div>
            <div>
              <Label className="text-xs">
                {positionType === "short" ? "Short benefit %/yr" : "Long fee %/yr"}
              </Label>
              <Input
                type="number"
                inputMode="decimal"
                value={positionType === "short" ? shortRate : rate}
                onChange={(e) =>
                  positionType === "short"
                    ? setShortRate(e.target.value)
                    : setRate(e.target.value)
                }
              />
            </div>
            <div>
              <Label className="text-xs">Gold balance (grams)</Label>
              <div className="flex items-center gap-1">
                <Input
                  type="number"
                  inputMode="decimal"
                  value={goldAmount}
                  onChange={(e) => setGoldAmount(e.target.value)}
                  placeholder="0"
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground px-2">g</span>
              </div>
              {(parseFloat(goldAmount) || 0) > 100000 && (
                <p className="text-[11px] text-amber-600 mt-1">
                  ⚠ Over 100,000 g (100 kg). Please verify.
                </p>
              )}
            </div>
            <div>
              <Label className="text-xs">XAUUSD price ($/oz)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={xau}
                onChange={(e) => setXau(e.target.value)}
                placeholder="auto"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Margin requirement (%)</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={marginPct}
                onChange={(e) => setMarginPct(e.target.value)}
                placeholder="20"
              />
            </div>
            <div className="col-span-2">
              <Label className="text-xs">Name</Label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            <div className="col-span-2">
              <Button type="submit" className="w-full">
                Save client
              </Button>
            </div>
          </form>
        )}

        {error && (
          <p className="text-sm text-destructive mb-2" role="alert">
            {error}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : filteredClients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients to show.</p>
        ) : (
          <ul className="space-y-2">
            {filteredClients.map((c) => {
              const isEditing = editingId === c.id;
              const xauForCalc = effectiveXau(c);
              const margin = computeMargin({
                usd_balance: Number(c.usd_balance),
                gold_kg: Number(c.gold_kg ?? 0),
                xauusd_price: xauForCalc,
                margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
              });
              const needsMargin = margin.status === "needed";
              return (
                <li
                  key={c.id}
                  ref={(el) => {
                    if (el) cardRefs.current.set(c.id, el);
                    else cardRefs.current.delete(c.id);
                  }}
                  className="rounded-md border border-border/60 p-3 bg-background"
                >
                  <div className="flex items-start justify-between gap-2">
                    {isEditing ? (
                      <Input
                        value={editCode}
                        onChange={(e) => setEditCode(e.target.value)}
                        className="max-w-[160px]"
                      />
                    ) : (
                      <div className="font-medium flex items-center gap-2 flex-wrap">
                        <span>{c.code}</span>
                        {needsMargin && (
                          <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 font-semibold">
                            ⚠ Margin needed
                          </span>
                        )}
                      </div>
                    )}
                    <div className="flex gap-1" data-share-hide>
                      {isEditing ? (
                        <>
                          <Button size="icon" variant="ghost" onClick={() => saveEdit(c.id)}>
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => setEditingId(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => share(c)}
                            disabled={sharingId === c.id}
                            title="Share margin report"
                          >
                            <Share2 className="h-4 w-4 text-primary" />
                          </Button>
                          <Button size="icon" variant="ghost" onClick={() => startEdit(c)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => remove(c.id, c.code)}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>


                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="col-span-2">
                        <Label className="text-xs">Position type</Label>
                        <div className="grid grid-cols-2 gap-2 mt-1">
                          <button
                            type="button"
                            onClick={() => setEditPositionType("long")}
                            className={`text-xs rounded-md border px-3 py-2 ${
                              editPositionType === "long"
                                ? "border-primary bg-green-500/15 text-green-600 font-medium"
                                : "border-border/60 text-muted-foreground"
                            }`}
                          >
                            Long / Buy
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditPositionType("short")}
                            className={`text-xs rounded-md border px-3 py-2 ${
                              editPositionType === "short"
                                ? "border-red-500 bg-red-500/10 text-red-600 font-medium"
                                : "border-border/60 text-muted-foreground"
                            }`}
                          >
                            Short / Sell
                          </button>
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">USD balance</Label>
                        <Input
                          type="number"
                          value={editBalance}
                          onChange={(e) => setEditBalance(e.target.value)}
                        />
                      </div>
                      <div>
                        <Label className="text-xs">
                          {editPositionType === "short" ? "Short benefit %" : "Long fee %"}
                        </Label>
                        <Input
                          type="number"
                          value={editPositionType === "short" ? editShortRate : editRate}
                          onChange={(e) =>
                            editPositionType === "short"
                              ? setEditShortRate(e.target.value)
                              : setEditRate(e.target.value)
                          }
                        />
                      </div>
                      <div>
                        <Label className="text-xs">Gold balance (grams)</Label>
                        <div className="flex items-center gap-1">
                          <Input
                            type="number"
                            value={editGoldAmount}
                            onChange={(e) => setEditGoldAmount(e.target.value)}
                            className="flex-1"
                          />
                          <span className="text-sm text-muted-foreground px-2">g</span>
                        </div>
                        {(parseFloat(editGoldAmount) || 0) > 100000 && (
                          <p className="text-[11px] text-amber-600 mt-1">
                            ⚠ Over 100,000 g (100 kg). Please verify.
                          </p>
                        )}
                      </div>
                      <div>
                        <Label className="text-xs">XAUUSD ($/oz)</Label>
                        <Input
                          type="number"
                          value={editXau}
                          onChange={(e) => setEditXau(e.target.value)}
                        />
                      </div>
                      <div className="col-span-2">
                        <Label className="text-xs">Margin requirement (%)</Label>
                        <Input
                          type="number"
                          value={editMarginPct}
                          onChange={(e) => setEditMarginPct(e.target.value)}
                        />
                      </div>
                    </div>
                  ) : (() => {
                    const isShort = (c.position_type ?? "long") === "short";
                    const effRate = isShort
                      ? Number(c.short_annual_rate ?? 0)
                      : Number(c.annual_rate);
                    const daily = (Number(c.usd_balance) * effRate) / 100 / 365;
                    return (
                      <>
                        <div className="mt-2">
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
                        <div className="grid grid-cols-3 gap-2 mt-2 text-xs">
                          <Stat
                            label="USD balance"
                            value={fmtMoney(Number(c.usd_balance))}
                          />
                          <Stat
                            label={isShort ? "Benefit rate" : "Fee rate"}
                            value={`${fmt(effRate)}%`}
                          />
                          <Stat
                            label={isShort ? "Daily benefit" : "Daily fee"}
                            value={`${isShort ? "+" : "-"}$${fmt(daily)}`}
                            tone={isShort ? "positive" : "negative"}
                          />
                        </div>

                        {/* Margin Details */}
                        <MarginDetails
                          goldKg={Number(c.gold_kg ?? 0)}
                          xau={xauForCalc}
                          marginPct={Number(c.margin_requirement_pct ?? 20)}
                          margin={margin}
                        />
                      </>
                    );
                  })()}
                  {c.notes && (
                    <div className="text-[11px] text-muted-foreground mt-2">{c.notes}</div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

/* ---------------------------- MARGIN ---------------------------- */

function MarginTab({
  livePrice,
  showLiveCard,
  isAdmin,
  livePriceLoading,
  onRefreshPrice,
  onPriceChanged,
}: {
  livePrice: LiveXau | null;
  showLiveCard: boolean;
  isAdmin?: boolean;
  livePriceLoading?: boolean;
  onRefreshPrice?: () => void;
  onPriceChanged?: (p: LiveXau) => void;
}) {
  const [clients, setClients] = useState<SwapClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editBalance, setEditBalance] = useState("");
  const [editGoldGrams, setEditGoldGrams] = useState("");
  const [editXau, setEditXau] = useState("");
  const [editMarginPct, setEditMarginPct] = useState("");
  const [editPositionType, setEditPositionType] = useState<"long" | "short">("long");
  const [savingId, setSavingId] = useState<string | null>(null);

  function startEdit(c: SwapClient) {
    setEditingId(c.id);
    setEditBalance(String(c.usd_balance));
    setEditGoldGrams(String((Number(c.gold_kg ?? 0)) * 1000));
    setEditXau(c.xauusd_price !== null ? String(c.xauusd_price) : "");
    setEditMarginPct(String(c.margin_requirement_pct ?? 20));
    setEditPositionType((c.position_type ?? "long") as "long" | "short");
    setError(null);
  }

  function cancelEdit() {
    setEditingId(null);
  }

  async function saveEdit(c: SwapClient) {
    setSavingId(c.id);
    setError(null);
    try {
      await updateSwapClient({
        data: {
          id: c.id,
          code: c.code,
          usd_balance: parseFloat(editBalance) || 0,
          gold_kg: (parseFloat(editGoldGrams) || 0) / 1000,
          xauusd_price: editXau.trim() === "" ? null : parseFloat(editXau) || 0,
          margin_requirement_pct: parseFloat(editMarginPct) || 20,
          annual_rate: Number(c.annual_rate),
          short_annual_rate: Number(c.short_annual_rate ?? 2.5),
          position_type: editPositionType,
        },
      });
      invalidate(CK.todayFees, CK.margin, CK.activity, CK.clients);
      const data = await listSwapClients();
      setClients(data as SwapClient[]);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setSavingId(null);
    }
  }

  async function shareMargin(c: SwapClient) {
    setSharingId(c.id);
    try {
      const xau =
        livePrice && livePrice.price > 0
          ? livePrice.price
          : Number(c.xauusd_price ?? 0);
      if (!xau) throw new Error("No XAU price available");
      await shareClientMarginReport(
        {
          code: c.code,
          name: c.notes ?? null,
          usd_balance: Number(c.usd_balance),
          gold_kg: Number(c.gold_kg ?? 0),
          margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
          position_type: c.position_type,
        },
        xau,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to share.");
    } finally {
      setSharingId(null);
    }
  }

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const data = await cached(CK.clients, () => listSwapClients(), 60_000);
        setClients(data as SwapClient[]);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const effectiveXau = (c: SwapClient): number | null => {
    if (livePrice && livePrice.price > 0) return livePrice.price;
    return c.xauusd_price !== null ? Number(c.xauusd_price) : null;
  };

  const totals = useMemo(() => {
    let required = 0;
    let available = 0;
    let shortage = 0;
    let needingCount = 0;
    let totalUsd = 0;
    let totalGoldKg = 0;
    let totalGoldValue = 0;
    let totalEquity = 0;
    for (const c of clients) {
      const m = computeMargin({
        usd_balance: Number(c.usd_balance),
        gold_kg: Number(c.gold_kg ?? 0),
        xauusd_price: effectiveXau(c),
        margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
      });
      required += m.requiredMargin;
      available += m.availableMargin;
      totalUsd += Number(c.usd_balance);
      totalGoldKg += Number(c.gold_kg ?? 0);
      totalGoldValue += m.goldValue;
      totalEquity += m.equity;
      if (m.status === "needed") {
        shortage += Math.abs(m.difference);
        needingCount += 1;
      }
    }
    return {
      required,
      available,
      shortage,
      needingCount,
      totalUsd,
      totalGoldKg,
      totalGoldValue,
      totalEquity,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clients, livePrice]);

  return (
    <div className="space-y-4">
      {showLiveCard && onRefreshPrice && onPriceChanged && (
        <LiveXauCard
          isAdmin={!!isAdmin}
          livePrice={livePrice}
          loading={!!livePriceLoading}
          onRefresh={onRefreshPrice}
          onPriceChanged={onPriceChanged}
        />
      )}

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h2 className="text-sm font-semibold flex items-center gap-2 mb-3">
          <ShieldCheck className="h-4 w-4 text-primary" /> Margin overview
        </h2>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total USD balance</div>
            <div className="font-semibold">${fmt(totals.totalUsd)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total gold balance</div>
            <div className="font-semibold">{fmt(totals.totalGoldKg * 1000, 0)} g</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Gold valuation</div>
            <div className="font-semibold">${fmt(totals.totalGoldValue)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total equity</div>
            <div className="font-semibold">${fmt(totals.totalEquity)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total required</div>
            <div className="font-semibold">${fmt(totals.required)}</div>
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2">
            <div className="text-[11px] text-muted-foreground">Total available</div>
            <div className="font-semibold">${fmt(totals.available)}</div>
          </div>
          <div
            className={`rounded-md px-3 py-2 ${
              totals.shortage > 0
                ? "bg-red-500/15 text-red-600"
                : "bg-green-500/15 text-green-600"
            }`}
          >
            <div className="text-[11px] opacity-80">Total shortage</div>
            <div className="font-semibold">${fmt(totals.shortage)}</div>
          </div>
          <div
            className={`rounded-md px-3 py-2 ${
              totals.needingCount > 0
                ? "bg-red-500/15 text-red-600"
                : "bg-green-500/15 text-green-600"
            }`}
          >
            <div className="text-[11px] opacity-80">Clients needing margin</div>
            <div className="font-semibold">{totals.needingCount}</div>
          </div>
        </div>
      </section>

      <section className="rounded-xl border border-border/60 bg-card p-4">
        <h3 className="text-sm font-semibold mb-3">Per-client margin</h3>
        {error && (
          <p className="text-sm text-destructive mb-2" role="alert">
            {error}
          </p>
        )}
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : clients.length === 0 ? (
          <p className="text-sm text-muted-foreground">No clients yet.</p>
        ) : (
          <ul className="space-y-2">
            {clients.map((c) => {
              const xauForCalc = effectiveXau(c);
              const margin = computeMargin({
                usd_balance: Number(c.usd_balance),
                gold_kg: Number(c.gold_kg ?? 0),
                xauusd_price: xauForCalc,
                margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
              });
              const needsMargin = margin.status === "needed";
              return (
                <li
                  key={c.id}
                  className="rounded-md border border-border/60 p-3 bg-background"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-medium flex items-center gap-2 flex-wrap min-w-0">
                      <span>{c.code}</span>
                      {needsMargin && (
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-red-500/15 text-red-600 font-semibold">
                          ⚠ Margin needed
                        </span>
                      )}
                      {c.notes ? (
                        <span className="text-muted-foreground font-normal text-xs">
                          ({c.notes})
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() =>
                          editingId === c.id ? cancelEdit() : startEdit(c)
                        }
                      >
                        <Pencil className="h-4 w-4 mr-1 text-primary" />
                        {editingId === c.id ? "Cancel" : "Edit"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => shareMargin(c)}
                        disabled={sharingId === c.id}
                      >
                        <Share2 className="h-4 w-4 mr-1 text-primary" />
                        {sharingId === c.id ? "Sharing…" : "Share"}
                      </Button>
                    </div>
                  </div>
                  {editingId === c.id ? (
                    <div className="mt-3 rounded-md border border-primary/40 bg-primary/5 p-3 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">USD balance</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editBalance}
                            onChange={(e) => setEditBalance(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Gold (g)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editGoldGrams}
                            onChange={(e) => setEditGoldGrams(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Margin %</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={editMarginPct}
                            onChange={(e) => setEditMarginPct(e.target.value)}
                          />
                        </div>
                        <div>
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">XAUUSD override</Label>
                          <Input
                            type="number"
                            step="0.01"
                            placeholder="Use live price"
                            value={editXau}
                            onChange={(e) => setEditXau(e.target.value)}
                          />
                        </div>
                        <div className="col-span-2">
                          <Label className="text-[10px] uppercase tracking-wide text-muted-foreground">Position</Label>
                          <div className="flex gap-2 mt-1">
                            <Button
                              type="button"
                              size="sm"
                              variant={editPositionType === "long" ? "default" : "outline"}
                              onClick={() => setEditPositionType("long")}
                            >
                              Long
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant={editPositionType === "short" ? "default" : "outline"}
                              onClick={() => setEditPositionType("short")}
                            >
                              Short
                            </Button>
                          </div>
                        </div>
                      </div>
                      <div className="flex justify-end gap-2 pt-1">
                        <Button size="sm" variant="ghost" onClick={cancelEdit}>
                          <X className="h-4 w-4 mr-1" />Cancel
                        </Button>
                        <Button size="sm" onClick={() => saveEdit(c)} disabled={savingId === c.id}>
                          <Check className="h-4 w-4 mr-1" />
                          {savingId === c.id ? "Saving…" : "Save"}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <MarginDetails
                      goldKg={Number(c.gold_kg ?? 0)}
                      xau={xauForCalc}
                      marginPct={Number(c.margin_requirement_pct ?? 20)}
                      margin={margin}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function MarginDetails({
  goldKg,
  xau,
  marginPct,
  margin,
}: {
  goldKg: number;
  xau: number | null;
  marginPct: number;
  margin: ReturnType<typeof computeMargin>;
}) {
  const tier = margin.tier;
  const tierBorder =
    tier === "safe"
      ? "border-green-500/40 bg-green-500/5"
      : tier === "warning"
        ? "border-amber-500/40 bg-amber-500/5"
        : tier === "critical"
          ? "border-red-600/60 bg-red-600/10"
          : "border-red-500/40 bg-red-500/5";
  const tierBadge =
    tier === "safe"
      ? "bg-green-500/20 text-green-600"
      : tier === "warning"
        ? "bg-amber-500/20 text-amber-600"
        : tier === "critical"
          ? "bg-red-600/25 text-red-700"
          : "bg-red-500/20 text-red-600";
  const tierLabel =
    tier === "safe"
      ? "✓ Safe"
      : tier === "warning"
        ? "⚠ Warning"
        : tier === "critical"
          ? "⛔ Critical margin needed"
          : "⚠ Margin needed";
  const diffAccent: "green" | "amber" | "red" =
    tier === "safe" ? "green" : tier === "warning" ? "amber" : "red";
  return (
    <div className={`mt-3 rounded-md border p-3 ${tierBorder}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
          Margin details
        </div>
        <span className={`text-[11px] px-2 py-0.5 rounded font-semibold ${tierBadge}`}>
          {tierLabel} · {fmt(margin.marginLevelPct)}%
        </span>
      </div>
      <div className="grid grid-cols-2 gap-1.5 text-xs">
        <Row
          label="Gold balance"
          value={`${fmt(goldKg * 1000, 0)} g`}
        />
        {goldKg > 100 && (
          <div className="col-span-2 text-[11px] text-amber-600 px-2">
            ⚠ Please verify gold unit. Did you mean grams?
          </div>
        )}
        <Row
          label="Gold value (USD)"
          value={xau !== null ? `$${fmt(margin.goldValue)}` : "—"}
        />
        <Row label="XAUUSD price" value={xau !== null ? `$${fmt(xau)}/oz` : "not set"} />
        <Row label="Margin %" value={`${fmt(marginPct)}%`} />
        <Row label="Total exposure" value={`$${fmt(margin.totalExposure)}`} />
        <Row label="Required margin" value={`$${fmt(margin.requiredMargin)}`} />
        <Row
          label="Equity (USD + Gold)"
          value={fmtMoney(margin.equity)}
          accent={margin.equity < 0 ? "red" : undefined}
        />
        <Row
          label="Available margin"
          value={fmtMoney(margin.availableMargin)}
          accent={margin.availableMargin < 0 ? "red" : undefined}
        />
        <Row label="Margin level" value={`${fmt(margin.marginLevelPct)}%`} accent={diffAccent} />
        <Row
          label={margin.difference >= 0 ? "Extra available" : "Needs to add"}
          value={`$${fmt(Math.abs(margin.difference))}`}
          accent={diffAccent}
        />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "red" | "amber";
}) {
  return (
    <div
      className={`flex items-center justify-between rounded px-2 py-1 ${
        accent === "green"
          ? "bg-green-500/15 text-green-600 font-semibold"
          : accent === "red"
            ? "bg-red-500/15 text-red-600 font-semibold"
            : accent === "amber"
              ? "bg-amber-500/15 text-amber-600 font-semibold"
              : "bg-muted/40"
      }`}
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span className="font-medium">{value}</span>
    </div>
  );
}

/* -------------------------- LIVE XAUUSD -------------------------- */

function LiveXauCard({
  isAdmin,
  livePrice,
  loading,
  onRefresh,
  onPriceChanged,
}: {
  isAdmin: boolean;
  livePrice: LiveXau | null;
  loading: boolean;
  onRefresh: () => void;
  onPriceChanged: (p: LiveXau) => void;
}) {
  const [showOverride, setShowOverride] = useState(false);
  const [override, setOverride] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function saveOverride(e: FormEvent) {
    e.preventDefault();
    setErr(null);
    const price = parseFloat(override);
    if (!Number.isFinite(price) || price <= 0) {
      setErr("Enter a valid price.");
      return;
    }
    setSaving(true);
    try {
      const r = await setManualXauPrice({ data: { price } });
      onPriceChanged(r);
      setOverride("");
      setShowOverride(false);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save.");
    } finally {
      setSaving(false);
    }
  }

  const updatedAt = livePrice?.updated_at
    ? new Date(livePrice.updated_at).toLocaleString()
    : "—";

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-muted-foreground font-semibold">
            Live XAUUSD
          </div>
          <div className="mt-1 text-2xl font-bold tabular-nums">
            ${livePrice ? fmt(livePrice.price) : "—"}{" "}
            <span className="text-xs font-normal text-muted-foreground">/ oz</span>
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">
            Last updated: {updatedAt}
            {livePrice?.source ? ` · ${livePrice.source}` : ""}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button size="sm" variant="outline" onClick={onRefresh} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${loading ? "animate-spin" : ""}`} /> Refresh
          </Button>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setShowOverride((v) => !v)}
              className="text-[11px] text-muted-foreground hover:text-foreground underline"
            >
              {showOverride ? "Cancel override" : "Admin override"}
            </button>
          )}
        </div>
      </div>

      {livePrice?.warning && (
        <div className="mt-3 text-xs px-3 py-2 rounded-md bg-amber-500/15 text-amber-700">
          ⚠ {livePrice.warning}
        </div>
      )}

      {isAdmin && showOverride && (
        <form onSubmit={saveOverride} className="mt-3 flex gap-2 items-end">
          <div className="flex-1">
            <Label className="text-xs">Manual XAUUSD ($/oz)</Label>
            <Input
              type="number"
              inputMode="decimal"
              value={override}
              onChange={(e) => setOverride(e.target.value)}
              placeholder="e.g. 2350"
            />
          </div>
          <Button type="submit" size="sm" disabled={saving}>
            {saving ? "Saving…" : "Save override"}
          </Button>
        </form>
      )}
      {err && <p className="mt-2 text-xs text-destructive">{err}</p>}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Auto-refreshes every 2 minutes. Used for all margin calculations.
      </p>
    </section>
  );
}

/* -------------------------- MARGIN LOG -------------------------- */

type FieldChange = {
  key: "status" | "gold" | "margin_pct" | "balance" | "price" | "level" | "required";
  label: string;
  oldText: string;
  newText: string;
  tone?: "status" | "default";
  oldStatus?: string | null;
  newStatus?: string | null;
};

type LogFilter = "all" | "status" | "gold" | "margin" | "balance";

function statusLabel(s: string | null): string {
  if (!s) return "—";
  if (s === "enough" || s === "safe") return "Safe";
  if (s === "warning") return "Warning";
  if (s === "critical") return "Critical";
  return "Margin Needed";
}

function buildChanges(r: MarginHistoryRow): FieldChange[] {
  const out: FieldChange[] = [];

  const oldUsd = Number(r.old_usd_balance ?? 0);
  const newUsd = Number(r.new_usd_balance ?? 0);
  if (oldUsd !== newUsd) {
    out.push({
      key: "balance",
      label: "USD Balance",
      oldText: fmtMoney(oldUsd),
      newText: fmtMoney(newUsd),
    });
  }

  const oldKg = Number(r.old_gold_kg ?? 0);
  const newKg = Number(r.new_gold_kg ?? 0);
  if (oldKg !== newKg) {
    out.push({
      key: "gold",
      label: "Gold Balance",
      oldText: `${fmt(oldKg * 1000, 0)} g`,
      newText: `${fmt(newKg * 1000, 0)} g`,
    });
  }

  const oldXau = Number(r.old_xauusd_price ?? 0);
  const newXau = Number(r.new_xauusd_price ?? 0);
  if (oldXau !== newXau && (oldXau > 0 || newXau > 0)) {
    out.push({
      key: "price",
      label: "Gold Price",
      oldText: oldXau > 0 ? `${fmtMoney(oldXau)} / oz` : "—",
      newText: newXau > 0 ? `${fmtMoney(newXau)} / oz` : "—",
    });
  }

  const oldPct = Number(r.old_margin_pct ?? 0);
  const newPct = Number(r.new_margin_pct ?? 0);
  if (oldPct !== newPct) {
    out.push({
      key: "margin_pct",
      label: "Margin Requirement",
      oldText: `${fmt(oldPct)}%`,
      newText: `${fmt(newPct)}%`,
    });
  }

  const oldReq = Number(r.old_required_margin ?? 0);
  const newReq = Number(r.new_required_margin ?? 0);
  if (oldReq !== newReq && (oldReq > 0 || newReq > 0)) {
    out.push({
      key: "required",
      label: "Required Margin",
      oldText: fmtMoney(oldReq),
      newText: fmtMoney(newReq),
    });
  }

  const oldAvail = Number(r.old_available_margin ?? 0);
  const newAvail = Number(r.new_available_margin ?? 0);
  const oldLevel = oldReq > 0 ? (oldAvail / oldReq) * 100 : null;
  const newLevel = newReq > 0 ? (newAvail / newReq) * 100 : null;
  if (
    oldLevel !== null &&
    newLevel !== null &&
    Math.abs(oldLevel - newLevel) >= 0.01
  ) {
    out.push({
      key: "level",
      label: "Margin Level",
      oldText: `${fmt(oldLevel)}%`,
      newText: `${fmt(newLevel)}%`,
    });
  }

  if (r.old_status !== r.new_status) {
    out.push({
      key: "status",
      label: "Status",
      oldText: statusLabel(r.old_status),
      newText: statusLabel(r.new_status),
      tone: "status",
      oldStatus: r.old_status,
      newStatus: r.new_status,
    });
  }

  return out;
}

function MarginLogTab() {
  const [rows, setRows] = useState<MarginHistoryRow[]>([]);
  const [clients, setClients] = useState<SwapClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<LogFilter>("all");
  const [search, setSearch] = useState("");

  async function load() {
    setLoading(true);
    try {
      const [h, c] = await Promise.all([
        cached(CK.margin, () => listSwapMarginHistory({ data: {} }), 30_000),
        cached(CK.clients, () => listSwapClients(), 60_000),
      ]);
      setRows(h as MarginHistoryRow[]);
      setClients(c as SwapClient[]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  const clientById = useMemo(() => {
    const m = new Map<string, SwapClient>();
    for (const c of clients) m.set(c.id, c);
    return m;
  }, [clients]);

  const enriched = useMemo(() => {
    return rows
      .map((r) => ({ r, changes: buildChanges(r) }))
      .filter((x) => x.changes.length > 0)
      .sort(
        (a, b) =>
          new Date(b.r.created_at).getTime() -
          new Date(a.r.created_at).getTime(),
      );
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return enriched.filter(({ r, changes }) => {
      if (filter !== "all") {
        const has = (k: FieldChange["key"][]) =>
          changes.some((c) => k.includes(c.key));
        if (filter === "status" && !has(["status"])) return false;
        if (filter === "gold" && !has(["gold"])) return false;
        if (filter === "margin" && !has(["margin_pct", "required", "level"]))
          return false;
        if (filter === "balance" && !has(["balance"])) return false;
      }
      if (q) {
        const c = clientById.get(r.client_id);
        const code = (c?.code ?? "").toLowerCase();
        const name = (c?.notes ?? "").toLowerCase();
        if (!code.includes(q) && !name.includes(q)) return false;
      }
      return true;
    });
  }, [enriched, filter, search, clientById]);


  const filters: { key: LogFilter; label: string }[] = [
    { key: "all", label: "All Changes" },
    { key: "status", label: "Status" },
    { key: "gold", label: "Gold" },
    { key: "margin", label: "Margin" },
    { key: "balance", label: "Balance" },
  ];

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold flex items-center gap-2">
          <ScrollText className="h-4 w-4 text-primary" /> Margin audit trail
        </h2>
        <Button size="sm" variant="outline" onClick={load}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>

      <div className="space-y-2 mb-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by client code or name…"
          className="h-9"
        />
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`text-xs px-2.5 py-1 rounded-md border transition-colors ${
                filter === f.key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border/60 text-muted-foreground hover:text-foreground hover:border-border"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>



      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {enriched.length === 0
            ? "No margin changes recorded yet."
            : "No changes match your filters."}
        </p>
      ) : (
        <ul className="space-y-2">
          {filtered.map(({ r, changes }) => {
            const c = clientById.get(r.client_id);
            const code = c?.code ?? r.client_id.slice(0, 8);
            const name = c?.notes ?? null;
            return (
              <li
                key={r.id}
                className="rounded-lg border border-border/60 p-3 bg-background"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-sm leading-tight">
                      {code}
                      {name && (
                        <span className="ml-2 font-normal text-muted-foreground">
                          {name}
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {new Date(r.created_at).toLocaleString()} · by{" "}
                      <span className="text-foreground/80">{r.username}</span>
                    </div>
                  </div>
                </div>

                <ul className="mt-3 space-y-1.5">
                  {changes.map((ch, i) => (
                    <li
                      key={i}
                      className="rounded-md bg-muted/30 px-2.5 py-1.5"
                    >
                      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {ch.label}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-sm flex-wrap">
                        {ch.tone === "status" ? (
                          <>
                            <StatusPill status={ch.oldStatus ?? null} />
                            <span className="text-muted-foreground">→</span>
                            <StatusPill status={ch.newStatus ?? null} />
                          </>
                        ) : (
                          <>
                            <span className="font-medium text-muted-foreground tabular-nums">
                              {ch.oldText}
                            </span>
                            <span className="text-muted-foreground">→</span>
                            <span className="font-semibold tabular-nums">
                              {ch.newText}
                            </span>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function StatusPill({ status }: { status: string | null }) {
  if (!status) return <span className="text-muted-foreground text-[11px]">—</span>;
  const enough = status === "enough";
  return (
    <span
      className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${
        enough ? "bg-green-500/15 text-green-600" : "bg-red-500/15 text-red-600"
      }`}
    >
      {enough ? "Enough" : "Needed"}
    </span>
  );
}

function Stat({ label, value, accent, tone }: { label: string; value: string; accent?: boolean; tone?: "positive" | "negative" }) {
  const cls =
    tone === "negative"
      ? "bg-red-500/15 text-red-600"
      : tone === "positive" || accent
        ? "bg-green-500/15 text-green-600"
        : "bg-muted/40";
  return (
    <div className={`rounded-md px-2 py-1.5 ${cls}`}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="font-semibold">{value}</div>
    </div>
  );
}

/* ---------------------------- PROFILE ---------------------------- */

function ProfileTab({ username }: { username: string }) {
  const [pwd, setPwd] = useState("");
  const [pwd2, setPwd2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function save(e: FormEvent) {
    e.preventDefault();
    setMsg(null);
    setErr(null);
    if (pwd.length < 6) return setErr("Password must be at least 6 characters.");
    if (pwd !== pwd2) return setErr("Passwords don't match.");
    setSaving(true);
    try {
      await updateSwapOwnPassword({ data: { password: pwd } });
      setPwd("");
      setPwd2("");
      setMsg("Password updated.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4 space-y-4">
      <div>
        <h2 className="text-sm font-semibold">Profile</h2>
        <p className="text-[11px] text-muted-foreground">
          Signed in as <span className="font-mono">{username}</span>
        </p>
      </div>

      <form onSubmit={save} className="space-y-3 max-w-sm">
        <div>
          <Label className="text-xs">New password</Label>
          <Input
            type="password"
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div>
          <Label className="text-xs">Confirm new password</Label>
          <Input
            type="password"
            value={pwd2}
            onChange={(e) => setPwd2(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        {err && <p className="text-sm text-destructive">{err}</p>}
        {msg && <p className="text-sm text-primary">{msg}</p>}
        <Button type="submit" disabled={saving}>
          {saving ? "Saving…" : "Change password"}
        </Button>
      </form>
    </section>
  );
}

/* ----------------------------- USERS ----------------------------- */

function UsersTab() {
  const [users, setUsers] = useState<SwapUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");

  async function load() {
    setLoading(true);
    try {
      const data = await cached(CK.users, () => listSwapUsers(), 60_000);
      setUsers(data as SwapUser[]);
      const { data: auth } = await supabase.auth.getUser();
      setCurrentUserId(auth.user?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load users.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function add(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createSwapUser({
        data: { username, password, email, is_admin: makeAdmin },
      });
      setUsername("");
      setPassword("");
      setEmail("");
      setMakeAdmin(false);
      setShowForm(false);
      invalidate(CK.users, CK.activity);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create user.");
    }
  }

  async function remove(id: string, name: string) {
    if (!confirm(`Delete user ${name}?`)) return;
    try {
      await deleteSwapUser({ data: { id } });
      invalidate(CK.users, CK.activity);
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete user.");
    }
  }

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Swap users</h2>
        <Button size="sm" onClick={() => setShowForm((v) => !v)}>
          <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "Add user"}
        </Button>
      </div>

      {showForm && (
        <form
          onSubmit={add}
          className="grid grid-cols-2 gap-2 mb-4 p-3 rounded-md bg-muted/30"
        >
          <div>
            <Label className="text-xs">Username</Label>
            <Input value={username} onChange={(e) => setUsername(e.target.value)} required />
          </div>
          <div>
            <Label className="text-xs">Password</Label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Email (optional)</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <label className="col-span-2 flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={makeAdmin}
              onChange={(e) => setMakeAdmin(e.target.checked)}
            />
            Make admin
          </label>
          <div className="col-span-2">
            <Button type="submit" className="w-full">
              Create user
            </Button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-sm text-destructive mb-2" role="alert">
          {error}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <ul className="space-y-2">
          {users.map((u) => (
            <li
              key={u.id}
              className="flex items-center justify-between rounded-md border border-border/60 p-3 bg-background"
            >
              <div className="min-w-0">
                <div className="font-medium flex items-center gap-2">
                  {u.username}
                  {u.is_admin && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-green-500/15 text-green-600">
                      <ShieldCheck className="h-3 w-3" /> admin
                    </span>
                  )}
                </div>
                {u.email && (
                  <div className="text-[11px] text-muted-foreground">{u.email}</div>
                )}
              </div>
              {u.id !== currentUserId && (
                <Button
                  size="icon"
                  variant="ghost"
                  onClick={() => remove(u.id, u.username)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------ LOGS ------------------------------ */

function LogsTab() {
  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  async function load(force = false) {
    setLoading(true);
    try {
      if (force) invalidate(CK.activity);
      const data = await cached(CK.activity, () => listSwapActivityLog(), 30_000);
      setRows(data as ActivityRow[]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  return (
    <section className="rounded-xl border border-border/60 bg-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-sm font-semibold">Activity log</h2>
        <Button size="sm" variant="outline" onClick={() => load(true)}>
          <RefreshCw className="h-4 w-4 mr-1" /> Refresh
        </Button>
      </div>
      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No activity yet.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li
              key={r.id}
              className="rounded-md border border-border/60 p-3 bg-background text-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium">{r.username}</span>{" "}
                  <span className="text-muted-foreground">{r.action}</span>
                  {r.entity_type && (
                    <span className="text-muted-foreground"> · {r.entity_type}</span>
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground whitespace-nowrap">
                  {new Date(r.created_at).toLocaleString()}
                </div>
              </div>
              {r.details ? (
                <pre className="text-[11px] text-muted-foreground mt-1 whitespace-pre-wrap break-all">
                  {JSON.stringify(r.details)}
                </pre>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
