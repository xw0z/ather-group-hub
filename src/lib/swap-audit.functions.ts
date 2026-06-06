import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordAudit } from "@/lib/swap-audit.server";

const MODULES = [
  "auth",
  "users",
  "clients",
  "financial",
  "margin",
  "swap",
  "premium",
  "reports",
  "security",
  "system",
] as const;

// Called from the client for events the backend can't see on its own —
// logout, report viewed/downloaded, unauthorized UI access, etc.
export const logClientAuditEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        module: z.enum(MODULES),
        action: z.string().min(1).max(80),
        status: z.enum(["success", "failure", "denied"]).optional(),
        entity_type: z.string().max(64).nullable().optional(),
        entity_id: z.string().uuid().nullable().optional(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await recordAudit({
      userId: context.userId,
      module: data.module,
      action: data.action,
      status: data.status,
      entity_type: data.entity_type ?? null,
      entity_id: data.entity_id ?? null,
      details: data.details ?? null,
    });
    return { ok: true };
  });

// Unauthenticated event (login failure, etc). No auth middleware on purpose.
export const logUnauthAuditEvent = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        action: z.enum([
          "login_failed",
          "login_succeeded",
          "unauthorized_access",
          "bootstrap_admin",
        ]),
        username: z.string().max(64).optional(),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    await recordAudit({
      userId: null,
      username: data.username ?? null,
      module: data.action === "unauthorized_access" ? "security" : "auth",
      action: data.action,
      status: data.action === "login_succeeded" ? "success" : "failure",
      details: data.details ?? null,
    });
    return { ok: true };
  });
