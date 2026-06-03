import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/margin")({
  beforeLoad: () => {
    throw redirect({ to: "/swap/dashboard", search: { tab: "margin" } });
  },
});
