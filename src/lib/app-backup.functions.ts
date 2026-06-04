import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const PURITY_TABLES = [
  "purity_clients",
  "purity_trips",
  "purity_pieces",
  "purity_profiles",
  "purity_activity_log",
] as const;

const SWAP_TABLES = [
  "swap_clients",
  "swap_entries",
  "swap_daily_fees",
  "swap_margin_history",
  "swap_premium_companies",
  "swap_premium_transactions",
  "swap_report_history",
  "swap_settings",
  "swap_xau_snapshots",
  "swap_profiles",
  "swap_activity_log",
  "user_module_permissions",
] as const;

async function isAdmin(userId: string, _app: "purity" | "swap"): Promise<boolean> {
  // Platform admin (swap_profiles.is_admin) can back up any app.
  const { data: swap } = await supabaseAdmin
    .from("swap_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if ((swap as { is_admin?: boolean } | null)?.is_admin) return true;
  const { data: purity } = await supabaseAdmin
    .from("purity_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return Boolean((purity as { is_admin?: boolean } | null)?.is_admin);
}

async function dumpTables(tables: readonly string[]) {
  const out: Record<string, Array<Record<string, unknown>>> = {};
  for (const t of tables) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabaseAdmin.from(t as any) as any)
      .select("*")
      .limit(100000);
    if (error) throw new Error(`Failed to read ${t}: ${error.message}`);
    out[t] = (data ?? []) as Array<Record<string, unknown>>;
  }
  return out;
}

export const backupApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ app: z.enum(["purity", "swap"]) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await isAdmin(context.userId, data.app);
    if (!admin) throw new Error("Only administrators can create backups.");
    const tables = data.app === "purity" ? PURITY_TABLES : SWAP_TABLES;
    const dump = await dumpTables(tables);
    // Return as a JSON string to bypass serialization validation of dynamic table rows.
    return {
      app: data.app,
      generatedAt: new Date().toISOString(),
      json: JSON.stringify({
        app: data.app,
        generatedAt: new Date().toISOString(),
        version: 1,
        tables: dump,
      }),
    };
  });


