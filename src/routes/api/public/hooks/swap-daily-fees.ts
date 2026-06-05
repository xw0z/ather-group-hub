import { createFileRoute } from "@tanstack/react-router";
import { runDailyFeeJob } from "@/lib/swap-clients.functions";

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export const Route = createFileRoute("/api/public/hooks/swap-daily-fees")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // Accept either:
        //   (a) Authorization: Bearer <CRON_SECRET>  or  x-cron-secret: <CRON_SECRET>
        //   (b) apikey: <SUPABASE_PUBLISHABLE_KEY>   (documented pg_cron pattern)
        const cronSecret = process.env.CRON_SECRET;
        const publishable =
          process.env.SUPABASE_PUBLISHABLE_KEY ??
          process.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
          "";
        const authz = request.headers.get("authorization") ?? "";
        const bearer = authz.toLowerCase().startsWith("bearer ")
          ? authz.slice(7).trim()
          : "";
        const headerSecret = request.headers.get("x-cron-secret") ?? "";
        const apikey = request.headers.get("apikey") ?? "";

        const cronOk =
          !!cronSecret &&
          ((bearer && timingSafeEqualStr(bearer, cronSecret)) ||
            (headerSecret && timingSafeEqualStr(headerSecret, cronSecret)));
        const apikeyOk =
          !!publishable && !!apikey && timingSafeEqualStr(apikey, publishable);

        if (!cronOk && !apikeyOk) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        try {
          const result = await runDailyFeeJob();
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          return new Response(
            JSON.stringify({
              ok: false,
              error: err instanceof Error ? err.message : "Failed",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
