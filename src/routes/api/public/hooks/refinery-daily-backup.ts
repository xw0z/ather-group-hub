import { createFileRoute } from "@tanstack/react-router";
import { runScheduledBackups } from "@/lib/refineries.functions";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export const Route = createFileRoute("/api/public/hooks/refinery-daily-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Accept either CRON_SECRET (Bearer / x-cron-secret) or the project
        // publishable apikey header (pg_cron pattern).
        const cronSecret = process.env.CRON_SECRET;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const authz = request.headers.get("authorization") ?? "";
        const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7).trim() : "";
        const headerSecret = request.headers.get("x-cron-secret") ?? "";
        const apiKey = request.headers.get("apikey") ?? "";

        const cronOk =
          (!!cronSecret &&
            ((bearer && timingSafeEqualStr(bearer, cronSecret)) ||
              (headerSecret && timingSafeEqualStr(headerSecret, cronSecret)))) ||
          (!!anonKey && apiKey && timingSafeEqualStr(apiKey, anonKey));

        if (!cronOk) {
          return new Response(JSON.stringify({ ok: false, error: "Unauthorized" }), {
            status: 401, headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const result = await runScheduledBackups();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200, headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({ ok: false, error: err instanceof Error ? err.message : "Failed" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
