import { createFileRoute } from "@tanstack/react-router";
import { LegacyDeskRedirect } from "@/components/LegacyDeskRedirect";

export const Route = createFileRoute("/swap/")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: LegacyDeskRedirect,
});
