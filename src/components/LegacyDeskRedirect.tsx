import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Legacy URL redirector for ATHER DESK.
 * - Logged in  → `signedInTo` (default `/desk/app/dashboard`)
 * - Logged out → `/desk/login`
 *
 * The component is registered directly as a route `component` in some legacy
 * route files (e.g. `/swap`, `/margin`, `/purity`), so it must work both
 * with and without props.
 */
export function LegacyDeskRedirect({
  signedInTo = "/desk/app/dashboard",
}: { signedInTo?: string } = {}) {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ to: signedInTo as any, replace: true });
      } else {
        navigate({ to: "/desk/login", replace: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate, signedInTo]);
  return (
    <main className="min-h-screen bg-background text-foreground flex items-center justify-center">
      <p className="text-sm text-muted-foreground tracking-[0.25em]">REDIRECTING…</p>
    </main>
  );
}
