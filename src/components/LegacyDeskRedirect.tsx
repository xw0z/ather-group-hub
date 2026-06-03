import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Legacy URL redirector for ATHER DESK.
 * - Logged in (any session) → /desk/app/dashboard
 * - Logged out              → /desk/login
 */
export function LegacyDeskRedirect() {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        navigate({ to: "/desk/app/dashboard", replace: true });
      } else {
        navigate({ to: "/desk/login", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-sm text-muted-foreground tracking-[0.25em]">REDIRECTING…</p>
    </main>
  );
}
