import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/settings")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Settings" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <SwapDashboard tab="settings" />,
});
