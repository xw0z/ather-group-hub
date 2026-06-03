import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/discount-premium")({
  beforeLoad: () => {
    throw redirect({ to: "/swap/dashboard", search: { tab: "premium" } });
  },
});
