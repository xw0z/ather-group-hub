import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/unauthorized")({
  head: () => ({
    meta: [
      { title: "Unauthorized — Ather" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: UnauthorizedPage,
});

function UnauthorizedPage() {
  const navigate = useNavigate();
  return (
    <main className="min-h-screen bg-background text-foreground grid place-items-center px-4">
      <div className="max-w-md w-full rounded-xl border border-border/60 bg-card p-6 text-center space-y-4">
        <div className="mx-auto h-12 w-12 rounded-full bg-destructive/15 grid place-items-center">
          <ShieldAlert className="h-6 w-6 text-destructive" />
        </div>
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Unauthorized</h1>
          <p className="text-sm text-muted-foreground">
            You don't have permission to access this module. Contact your administrator
            if you think this is a mistake.
          </p>
        </div>
        <div className="flex gap-2 justify-center">
          <Button variant="outline" size="sm" onClick={() => navigate({ to: "/swap/dashboard", search: { tab: "dashboard" } })}>
            Back to dashboard
          </Button>
          <Button size="sm" onClick={() => navigate({ to: "/" })}>
            Home
          </Button>
        </div>
      </div>
    </main>
  );
}
