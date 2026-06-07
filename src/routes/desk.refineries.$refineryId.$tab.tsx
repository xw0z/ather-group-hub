import { createFileRoute, redirect } from "@tanstack/react-router";

const VALID_TABS = ["dashboard", "clients", "transactions", "stock", "profile"] as const;
type RefTab = (typeof VALID_TABS)[number];

export const Route = createFileRoute("/desk/refineries/$refineryId/$tab")({
  beforeLoad: ({ params }) => {
    const tab = (VALID_TABS as readonly string[]).includes(params.tab)
      ? (params.tab as RefTab)
      : ("dashboard" as RefTab);
    throw redirect({
      to: "/desk/refineries",
      search: { r: params.refineryId, tab },
      replace: true,
    });
  },
});
