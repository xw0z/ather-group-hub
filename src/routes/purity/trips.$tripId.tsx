import { createFileRoute } from "@tanstack/react-router";
import { LegacyDeskRedirect } from "@/components/LegacyDeskRedirect";

export const Route = createFileRoute("/purity/trips/$tripId")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: LegacyTripRedirect,
});

function LegacyTripRedirect() {
  const { tripId } = Route.useParams();
  return <LegacyDeskRedirect signedInTo={`/desk/app/purity/trips/${tripId}`} />;
}
