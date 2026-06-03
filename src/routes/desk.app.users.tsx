import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/app/users")({
  beforeLoad: () => {
    throw redirect({ to: "/swap/dashboard", search: { tab: "users" } });
  },
});
