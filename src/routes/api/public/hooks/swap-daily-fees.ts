import { createFileRoute } from "@tanstack/react-router";
import { runDailyFeeJob } from "@/lib/swap-clients.functions";
import { recordAudit } from "@/lib/swap-audit.server";

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
        //   - Authorization: Bearer <CRON_SECRET> / x-cron-secret header (legacy/manual recovery)
        //   - apikey: <SUPABASE_PUBLISHABLE_KEY> (pg_cron pattern)
        const cronSecret = process.env.CRON_SECRET;
        const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY;
        const authz = request.headers.get("authorization") ?? "";
        const bearer = authz.toLowerCase().startsWith("bearer ")
          ? authz.slice(7).trim()
          : "";
        const headerSecret = request.headers.get("x-cron-secret") ?? "";
        const apiKey = request.headers.get("apikey") ?? "";

        const cronOk =
          (!!cronSecret &&
            ((bearer && timingSafeEqualStr(bearer, cronSecret)) ||
              (headerSecret && timingSafeEqualStr(headerSecret, cronSecret)))) ||
          (!!anonKey && apiKey && timingSafeEqualStr(apiKey, anonKey));

        if (!cronOk) {
          return new Response(
            JSON.stringify({ ok: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
          );
        }
        const startedAt = new Date().toISOString();
        try {
          const result = await runDailyFeeJob();
          await recordAudit({
            userId: null,
            username: "cron",
            module: "system",
            action: "daily_fees_cron",
            status: "success",
            details: { started_at: startedAt, ...result },
          });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Failed";
          await recordAudit({
            userId: null,
            username: "cron",
            module: "system",
            action: "daily_fees_cron",
            status: "failure",
            details: { started_at: startedAt, error: message },
          });
          return new Response(
            JSON.stringify({ ok: false, error: message }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }
      },
    },
  },
});
