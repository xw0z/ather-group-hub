import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/swap")({
  validateSearch: (search: Record<string, unknown>): { view?: "fees" } => {
    return search.view === "fees" ? { view: "fees" } : {};
  },
  head: () => ({
    meta: [
      { title: "ATHER DESK — Swap" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SwapPage,
});

function SwapPage() {
  const { view } = Route.useSearch();
  return <SwapDashboard tab="clients" swapView={view === "fees" ? "fees" : "clients"} />;
}
