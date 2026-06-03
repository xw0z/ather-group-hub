import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/margin")({
  beforeLoad: () => {
    throw redirect({ to: "/swap/dashboard", search: { tab: "margin" } });
  },
});
