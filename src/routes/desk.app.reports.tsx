import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/reports")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Reports" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <SwapDashboard tab="reports" />,
});
