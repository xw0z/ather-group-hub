import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/swap")({
  beforeLoad: () => {
    throw redirect({ to: "/swap/dashboard", search: { tab: "clients" } });
  },
});
