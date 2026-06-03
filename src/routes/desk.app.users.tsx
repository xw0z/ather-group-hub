import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/users")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Users" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => <SwapDashboard tab="users" />,
});
