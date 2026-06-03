import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/margin")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Margin" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <SwapDashboard tab="margin" />,
});
