import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/dashboard")({
  head: () => ({
    meta: [
      { title: "ATHER DESK" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <SwapDashboard tab="dashboard" />,
});
