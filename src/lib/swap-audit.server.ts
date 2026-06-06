// Server-only audit logging helper. Never import from client code.
// All audit events flow through recordAudit() so we keep one consistent
// schema (module, status, IP, user agent, old/new values, details).
import { getRequestHeader } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type AuditModule =
  | "auth"
  | "users"
  | "clients"
  | "financial"
  | "margin"
  | "swap"
  | "premium"
  | "reports"
  | "security"
  | "system";

export type AuditStatus = "success" | "failure" | "denied";

export type AuditOpts = {
  userId: string | null;
  username?: string | null;
  module: AuditModule;
  action: string;
  status?: AuditStatus;
  entity_type?: string | null;
  entity_id?: string | null;
  old_values?: unknown;
  new_values?: unknown;
  details?: unknown;
};

const ANON_USER_ID = "00000000-0000-0000-0000-000000000000";

function safeHeader(name: string): string | null {
  try {
    const v = getRequestHeader(name);
    return v ? String(v) : null;
  } catch {
    return null;
  }
}

function clientIp(): string | null {
  const xff = safeHeader("x-forwarded-for");
  if (xff) return xff.split(",")[0]?.trim() || null;
  return safeHeader("cf-connecting-ip") ?? safeHeader("x-real-ip");
}

async function resolveUsername(
  userId: string | null,
  given?: string | null,
): Promise<string> {
  if (given) return given;
  if (!userId) return "anonymous";
  try {
    const { data } = await supabaseAdmin
      .from("swap_profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    return data?.username ?? "unknown";
  } catch {
    return "unknown";
  }
}

export async function recordAudit(opts: AuditOpts): Promise<void> {
  try {
    const username = await resolveUsername(opts.userId, opts.username);
    const row = {
      user_id: opts.userId ?? ANON_USER_ID,
      username,
      action: opts.action,
      module: opts.module,
      status: opts.status ?? "success",
      entity_type: opts.entity_type ?? null,
      entity_id: opts.entity_id ?? null,
      old_values: (opts.old_values ?? null) as never,
      new_values: (opts.new_values ?? null) as never,
      details: (opts.details ?? null) as never,
      ip_address: clientIp(),
      user_agent: safeHeader("user-agent"),
    };
    const { error } = await supabaseAdmin.from("swap_activity_log").insert(row);
    if (error) console.error("[audit] insert failed", error.message);
  } catch (e) {
    console.error("[audit] recordAudit threw", e);
  }
}
