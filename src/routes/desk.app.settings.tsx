import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/settings")({
  beforeLoad: () => {
    throw redirect({ to: "/swap/dashboard", search: { tab: "settings" } });
  },
});
