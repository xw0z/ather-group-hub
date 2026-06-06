import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAudit } from "@/lib/swap-audit.server";

async function logActivity(
  userId: string,
  action: string,
  details: unknown,
  module: "auth" | "users" = "users",
  oldValues?: unknown,
  newValues?: unknown,
) {
  await recordAudit({
    userId,
    module,
    action,
    entity_type: "profile",
    entity_id: userId,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
    details,
  });
}

export const updateSwapOwnPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ password: z.string().min(6).max(128) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "password_changed", null, "auth");
    return { ok: true };
  });

export const getSwapOwnProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id, username, email, phone, is_admin, created_at")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const { data: userRes } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    return {
      id: context.userId,
      username: prof?.username ?? null,
      email: prof?.email ?? null,
      phone: prof?.phone ?? null,
      isAdmin: Boolean(prof?.is_admin),
      createdAt: prof?.created_at ?? null,
      authEmail: userRes?.user?.email ?? null,
      lastSignInAt: userRes?.user?.last_sign_in_at ?? null,
    };
  });

const usernameRule = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only");

export const updateSwapOwnProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        username: usernameRule.optional(),
        email: z
          .string()
          .trim()
          .email()
          .max(255)
          .optional()
          .or(z.literal("")),
        phone: z
          .string()
          .trim()
          .max(32)
          .regex(/^[+0-9 ()-]*$/, "Digits, spaces, + ( ) - only")
          .optional()
          .or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { username?: string; email?: string | null; phone?: string | null } = {};

    if (data.username !== undefined) {
      const username = data.username.toLowerCase();
      const { data: existing } = await supabaseAdmin
        .from("swap_profiles")
        .select("id")
        .ilike("username", username)
        .neq("id", context.userId)
        .maybeSingle();
      if (existing) throw new Error("Username already taken.");
      patch.username = username;
    }
    if (data.email !== undefined) patch.email = data.email === "" ? null : data.email;
    if (data.phone !== undefined) patch.phone = data.phone === "" ? null : data.phone;

    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from("swap_profiles")
        .update(patch)
        .eq("id", context.userId);
      if (error) throw new Error(error.message);
    }

    if (data.email !== undefined && data.email !== "") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, {
        email: data.email,
      });
      if (error) throw new Error(error.message);
    }

    await logActivity(context.userId, "profile_updated", patch);
    return { ok: true };
  });

