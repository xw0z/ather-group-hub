import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/discount-premium")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Discount / Premium" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <SwapDashboard tab="premium" />,
});
