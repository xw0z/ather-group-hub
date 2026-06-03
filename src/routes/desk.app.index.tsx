import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/")({
  beforeLoad: () => {
    throw redirect({ to: "/desk/app/dashboard" });
  },
});
