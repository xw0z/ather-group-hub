import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyPermissions } from "@/lib/permissions.functions";
import { can, MODULES, type AppModule, type CurrentUserPermissions } from "@/lib/permissions";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Ather Platform" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppRedirect,
});

// Where each module lives today.
const MODULE_ROUTES: Record<AppModule, { to: string; search?: Record<string, string> }> = {
  purity: { to: "/purity/dashboard" },
  swap: { to: "/swap/dashboard", search: { tab: "calc" } },
  margin: { to: "/swap/dashboard", search: { tab: "margin" } },
  premium: { to: "/swap/dashboard", search: { tab: "premium" } },
  reports: { to: "/swap/dashboard", search: { tab: "reports" } },
  audit: { to: "/swap/dashboard", search: { tab: "activity" } },
  users: { to: "/swap/dashboard", search: { tab: "users" } },
  settings: { to: "/swap/dashboard", search: { tab: "settings" } },
};

function AppRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/login", replace: true });
        return;
      }
      try {
        const perms = (await getMyPermissions()) as CurrentUserPermissions;
        if (cancelled) return;

        // Admins → purity dashboard by default (most-used module).
        if (perms.isAdmin) {
          navigate({ to: "/purity/dashboard", replace: true });
          return;
        }

        // Find first module the user can view.
        const first = MODULES.find((m) => can(perms, m, "view"));
        if (!first) {
          navigate({ to: "/unauthorized", replace: true });
          return;
        }
        const target = MODULE_ROUTES[first];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ to: target.to as any, search: target.search as any, replace: true });
      } catch {
        navigate({ to: "/login", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-sm text-muted-foreground">Loading your workspace…</p>
    </main>
  );
}
