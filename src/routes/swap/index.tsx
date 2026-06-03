import { createFileRoute, Navigate } from "@tanstack/react-router";

export const Route = createFileRoute("/swap/")({
  head: () => ({
    meta: [{ name: "robots", content: "noindex, nofollow" }],
  }),
  component: () => <Navigate to="/login" replace />,
});
