import { createFileRoute } from "@tanstack/react-router";
import { runDailyFeeJob } from "@/lib/swap-clients.functions";

export const Route = createFileRoute("/api/public/hooks/swap-daily-fees")({
  server: {
    handlers: {
      POST: async () => {
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
