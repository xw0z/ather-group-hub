import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getMyPermissions } from "@/lib/permissions.functions";
import { can, MODULES, type AppModule, type CurrentUserPermissions } from "@/lib/permissions";

export const Route = createFileRoute("/desk/app/dashboard")({
  head: () => ({
    meta: [
      { title: "ATHER DESK" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DeskDashboardRedirect,
});

// Each module maps to its current implementation location.
const MODULE_ROUTES: Record<AppModule, { to: string; search?: Record<string, string> }> = {
  purity: { to: "/purity/dashboard" },
  swap: { to: "/swap/dashboard", search: { tab: "clients" } },
  margin: { to: "/swap/dashboard", search: { tab: "margin" } },
  premium: { to: "/swap/dashboard", search: { tab: "premium" } },
  reports: { to: "/swap/dashboard", search: { tab: "reports" } },
  audit: { to: "/swap/dashboard", search: { tab: "audit" } },
  users: { to: "/swap/dashboard", search: { tab: "users" } },
  settings: { to: "/swap/dashboard", search: { tab: "settings" } },
};

function DeskDashboardRedirect() {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        navigate({ to: "/desk/login", replace: true });
        return;
      }
      try {
        const perms = (await getMyPermissions()) as CurrentUserPermissions;
        if (cancelled) return;

        if (perms.isAdmin) {
          navigate({ to: "/swap/dashboard", search: { tab: "dashboard" }, replace: true });
          return;
        }

        const first = MODULES.find((m) => can(perms, m, "view"));
        if (!first) {
          navigate({ to: "/unauthorized", replace: true });
          return;
        }
        const target = MODULE_ROUTES[first];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ to: target.to as any, search: target.search as any, replace: true });
      } catch {
        navigate({ to: "/desk/login", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-sm text-muted-foreground tracking-[0.25em]">LOADING ATHER DESK…</p>
    </main>
  );
}
