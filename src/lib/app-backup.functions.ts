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

const MARGIN_TABLES = ["swap_margin_history"] as const;

const PREMIUM_TABLES = [
  "swap_premium_companies",
  "swap_premium_transactions",
] as const;

export const SCOPES = ["purity", "swap", "margin", "premium"] as const;
export type BackupScope = (typeof SCOPES)[number];

function tablesFor(scope: BackupScope): readonly string[] {
  switch (scope) {
    case "purity":
      return PURITY_TABLES;
    case "swap":
      return SWAP_TABLES;
    case "margin":
      return MARGIN_TABLES;
    case "premium":
      return PREMIUM_TABLES;
  }
}

async function canBackup(userId: string, _app: BackupScope): Promise<boolean> {
  // Platform admins and Managers (swap_profiles.is_manager) can back up/restore any app.
  const { data: swap } = await supabaseAdmin
    .from("swap_profiles")
    .select("is_admin, is_manager")
    .eq("id", userId)
    .maybeSingle();
  const s = swap as { is_admin?: boolean; is_manager?: boolean } | null;
  if (s?.is_admin || s?.is_manager) return true;
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
    const admin = await canBackup(context.userId, data.app);
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

export const restoreApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        app: z.enum(["purity", "swap"]),
        payload: z.string().min(2).max(50_000_000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const admin = await canBackup(context.userId, data.app);
    if (!admin) throw new Error("Only administrators can restore backups.");

    let parsed: {
      app?: string;
      tables?: Record<string, Array<Record<string, unknown>>>;
    };
    try {
      parsed = JSON.parse(data.payload);
    } catch {
      throw new Error("Invalid backup file: not valid JSON.");
    }
    if (!parsed?.tables || typeof parsed.tables !== "object") {
      throw new Error("Invalid backup file: missing 'tables'.");
    }
    if (parsed.app && parsed.app !== data.app) {
      throw new Error(
        `Backup is for '${parsed.app}', but you are restoring into '${data.app}'.`,
      );
    }

    const allowed = data.app === "purity" ? PURITY_TABLES : SWAP_TABLES;
    const report: Record<string, { inserted: number; skipped?: string }> = {};

    for (const table of allowed) {
      const rows = parsed.tables[table];
      if (!Array.isArray(rows) || rows.length === 0) {
        report[table] = { inserted: 0, skipped: "no rows" };
        continue;
      }
      const chunkSize = 500;
      let inserted = 0;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabaseAdmin.from(table as any) as any).upsert(
          chunk,
          { onConflict: "id" },
        );
        if (error)
          throw new Error(`Failed to restore ${table}: ${error.message}`);
        inserted += chunk.length;
      }
      report[table] = { inserted };
    }

    return { app: data.app, restoredAt: new Date().toISOString(), report };
  });



