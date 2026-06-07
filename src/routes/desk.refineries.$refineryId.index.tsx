import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/desk/refineries/$refineryId/")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/desk/refineries",
      search: { r: params.refineryId, tab: "dashboard" },
      replace: true,
    });
  },
});
