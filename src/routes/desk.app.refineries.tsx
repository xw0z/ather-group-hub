import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

type RefTab = "dashboard" | "clients" | "transactions" | "buysell" | "stock" | "netposition" | "backup" | "profile" | "translations";

export const Route = createFileRoute("/desk/app/refineries")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Refineries" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  validateSearch: (s: Record<string, unknown>) => ({
    r: typeof s.r === "string" ? s.r : undefined,
    rtab: typeof s.rtab === "string" ? (s.rtab as RefTab) : ("dashboard" as RefTab),
    action:
      s.action === "new" || s.action === "edit"
        ? (s.action as "new" | "edit")
        : undefined,
    txId: typeof s.txId === "string" ? s.txId : undefined,
    clientId: typeof s.clientId === "string" ? s.clientId : undefined,
    filter: s.filter === "owing-gold" || s.filter === "owing-da" ? s.filter : undefined,
  }),
  component: () => <SwapDashboard tab="refineries" />,
});
