import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/purity")({
  beforeLoad: () => {
    throw redirect({ to: "/purity/dashboard" });
  },
});
