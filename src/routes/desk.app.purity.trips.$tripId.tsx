import { createFileRoute } from "@tanstack/react-router";
import { SwapDashboard } from "./swap/dashboard";

export const Route = createFileRoute("/desk/app/purity/trips/$tripId")({
  head: () => ({
    meta: [
      { title: "ATHER DESK — Purity Trip" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: TripRoute,
});

function TripRoute() {
  const { tripId } = Route.useParams();
  return <SwapDashboard tab="purity" purityTripId={tripId} />;
}
