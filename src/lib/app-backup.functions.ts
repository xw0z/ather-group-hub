import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
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

/**
 * Backup/restore is platform-admin only.
 * Managers, staff, and viewers cannot create or restore backups.
 */
async function assertPlatformAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin.rpc("is_platform_admin", { _uid: userId });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Only platform administrators can create or restore backups.");
}

async function getActor(userId: string): Promise<{ email: string | null }> {
  const { data } = await supabaseAdmin.auth.admin.getUserById(userId);
  return { email: data?.user?.email ?? null };
}

function clientMeta(): { ip: string | null; ua: string | null } {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    ip = getRequestHeader("x-forwarded-for") ?? getRequestHeader("cf-connecting-ip") ?? null;
    ua = getRequestHeader("user-agent") ?? null;
  } catch {
    // outside request context
  }
  return { ip, ua };
}

async function writeAudit(opts: {
  app: BackupScope;
  action: "backup_created" | "backup_downloaded" | "restore_started" | "restore_completed" | "restore_failed";
  userId: string;
  userEmail: string | null;
  fileName?: string | null;
  safetyBackupId?: string | null;
  tables?: readonly string[];
  details?: Record<string, unknown>;
}) {
  const { ip, ua } = clientMeta();
  await supabaseAdmin.from("app_backup_audit_log").insert({
    app: opts.app,
    action: opts.action,
    user_id: opts.userId,
    user_email: opts.userEmail,
    file_name: opts.fileName ?? null,
    safety_backup_id: opts.safetyBackupId ?? null,
    tables_affected: opts.tables ? [...opts.tables] : null,
    details: (opts.details ?? null) as never,
    ip,
    user_agent: ua,
  });
}

function backupFileName(app: BackupScope, ts: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${ts.getFullYear()}-${pad(ts.getMonth() + 1)}-${pad(ts.getDate())}-${pad(ts.getHours())}-${pad(ts.getMinutes())}`;
  return `ather-${app}-backup-${stamp}.json`;
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

async function createSafetyBackup(opts: {
  app: BackupScope;
  userId: string;
  userEmail: string | null;
}): Promise<{ id: string; file_name: string }> {
  const tables = tablesFor(opts.app);
  const dump = await dumpTables(tables);
  const fileName = backupFileName(opts.app, new Date()).replace(".json", "-safety.json");
  const payload = { app: opts.app, generatedAt: new Date().toISOString(), version: 1, tables: dump };
  const json = JSON.stringify(payload);
  const { data, error } = await supabaseAdmin
    .from("app_safety_backups")
    .insert({
      app: opts.app,
      file_name: fileName,
      file_size_bytes: Buffer.byteLength(json, "utf8"),
      schema_version: 1,
      payload: payload as never,
      created_by: opts.userId,
      created_by_email: opts.userEmail,
    })
    .select("id, file_name")
    .single();
  if (error) throw new Error(`Failed to create safety backup: ${error.message}`);
  return data as { id: string; file_name: string };
}

export const backupApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ app: z.enum(SCOPES) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    const { email } = await getActor(context.userId);
    const tables = tablesFor(data.app);
    const dump = await dumpTables(tables);
    const generatedAt = new Date().toISOString();
    const fileName = backupFileName(data.app, new Date());
    const payload = { app: data.app, generatedAt, version: 1, tables: dump };
    const json = JSON.stringify(payload);
    await writeAudit({
      app: data.app,
      action: "backup_created",
      userId: context.userId,
      userEmail: email,
      fileName,
      tables,
      details: { size_bytes: Buffer.byteLength(json, "utf8") },
    });
    return { app: data.app, generatedAt, fileName, json };
  });

export const restoreApp = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        app: z.enum(SCOPES),
        payload: z.string().min(2).max(50_000_000),
        sourceFileName: z.string().min(1).max(300),
        confirmText: z.string(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertPlatformAdmin(context.userId);
    if (data.confirmText !== "RESTORE") {
      throw new Error('Type "RESTORE" (all caps) to confirm.');
    }
    const { email } = await getActor(context.userId);

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

    const allowed = tablesFor(data.app);

    // Mandatory safety backup BEFORE any writes
    const safety = await createSafetyBackup({
      app: data.app,
      userId: context.userId,
      userEmail: email,
    });
    await writeAudit({
      app: data.app,
      action: "restore_started",
      userId: context.userId,
      userEmail: email,
      fileName: data.sourceFileName,
      safetyBackupId: safety.id,
      tables: allowed,
      details: { safety_file_name: safety.file_name },
    });

    const report: Record<string, { inserted: number; skipped?: string }> = {};

    try {
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
    } catch (err) {
      await writeAudit({
        app: data.app,
        action: "restore_failed",
        userId: context.userId,
        userEmail: email,
        fileName: data.sourceFileName,
        safetyBackupId: safety.id,
        tables: allowed,
        details: {
          error: err instanceof Error ? err.message : String(err),
          partial_report: report,
        },
      });
      throw err;
    }

    await writeAudit({
      app: data.app,
      action: "restore_completed",
      userId: context.userId,
      userEmail: email,
      fileName: data.sourceFileName,
      safetyBackupId: safety.id,
      tables: allowed,
      details: { report },
    });

    return {
      app: data.app,
      restoredAt: new Date().toISOString(),
      report,
      safetyBackupId: safety.id,
      safetyFileName: safety.file_name,
    };
  });
