import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/reports")({
  beforeLoad: () => {
    throw redirect({ to: "/swap/dashboard", search: { tab: "reports" } });
  },
});
