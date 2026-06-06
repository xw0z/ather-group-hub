import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { assertSwapUser } from "@/lib/swap-clients.functions";
import { recordAudit } from "@/lib/swap-audit.server";

const usernameRule = z
  .string()
  .trim()
  .min(2)
  .max(64)
  .regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only");

async function assertSwapAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("swap_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data?.is_admin) throw new Error("Only a Swap admin can manage users.");
}

// Server-side username sign-in: looks up the email internally and verifies
// the password against Supabase Auth, returning only session tokens.
// The email is never returned to the caller.
export const swapSignInWithUsername = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        username: z.string().trim().min(1).max(64),
        password: z.string().min(1).max(128),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const generic = "Invalid username or password.";
    const { data: profile, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id")
      .ilike("username", data.username)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) {
      await recordAudit({
        userId: null,
        username: data.username,
        module: "auth",
        action: "login_failed",
        status: "failure",
        details: { reason: "unknown_username" },
      });
      throw new Error(generic);
    }

    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (userErr || !userRes?.user?.email) {
      await recordAudit({
        userId: profile.id,
        username: data.username,
        module: "auth",
        action: "login_failed",
        status: "failure",
        details: { reason: "missing_auth_user" },
      });
      throw new Error(generic);
    }

    const anon = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { data: sess, error: signErr } = await anon.auth.signInWithPassword({
      email: userRes.user.email,
      password: data.password,
    });
    if (signErr || !sess.session) {
      await recordAudit({
        userId: profile.id,
        username: data.username,
        module: "auth",
        action: "login_failed",
        status: "failure",
        details: { reason: "bad_password" },
      });
      throw new Error(generic);
    }

    await recordAudit({
      userId: profile.id,
      username: data.username,
      module: "auth",
      action: "login_succeeded",
      status: "success",
    });

    return {
      access_token: sess.session.access_token,
      refresh_token: sess.session.refresh_token,
    };
  });

// First-time setup: create the first admin if no swap users exist yet.
export const bootstrapSwapAdmin = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        username: usernameRule,
        password: z.string().min(6).max(128),
        email: z.string().email().max(255).optional().or(z.literal("")),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { count, error: countErr } = await supabaseAdmin
      .from("swap_profiles")
      .select("id", { count: "exact", head: true });
    if (countErr) throw new Error(countErr.message);
    if ((count ?? 0) > 0) throw new Error("Swap is already initialized.");

    const username = data.username.toLowerCase();
    const authEmail = data.email && data.email !== "" ? data.email : `${username}@ather.group`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: data.password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user.");

    const { error: profErr } = await supabaseAdmin.from("swap_profiles").insert({
      id: created.user.id,
      username,
      email: data.email && data.email !== "" ? data.email : null,
      is_admin: true,
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(profErr.message);
    }
    await recordAudit({
      userId: created.user.id,
      username,
      module: "auth",
      action: "bootstrap_admin",
      entity_type: "user",
      entity_id: created.user.id,
      new_values: { username, is_admin: true },
    });
    return { ok: true, username };
  });

// Check whether the Swap section needs first-time setup.
export const swapNeedsBootstrap = createServerFn({ method: "GET" }).handler(async () => {
  const { count, error } = await supabaseAdmin
    .from("swap_profiles")
    .select("id", { count: "exact", head: true });
  if (error) throw new Error(error.message);
  return { needsBootstrap: (count ?? 0) === 0 };
});

export const createSwapUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        username: usernameRule,
        password: z.string().min(6).max(128),
        email: z.string().email().max(255).optional().or(z.literal("")),
        is_admin: z.boolean().optional(),
        is_manager: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);
    const username = data.username.toLowerCase();

    const { data: existing } = await supabaseAdmin
      .from("swap_profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) throw new Error("Username already taken.");

    const authEmail = data.email && data.email !== "" ? data.email : `${username}@ather.group`;
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: data.password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user.");

    const { error: profErr } = await supabaseAdmin.from("swap_profiles").insert({
      id: created.user.id,
      username,
      email: data.email && data.email !== "" ? data.email : null,
      is_admin: Boolean(data.is_admin),
      is_manager: Boolean(data.is_manager),
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(profErr.message);
    }
    await recordAudit({
      userId: context.userId,
      module: "users",
      action: "user_created",
      entity_type: "user",
      entity_id: created.user.id,
      new_values: {
        username,
        email: data.email || null,
        is_admin: Boolean(data.is_admin),
        is_manager: Boolean(data.is_manager),
      },
    });
    return { ok: true, username };
  });

export const deleteSwapUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);
    if (data.id === context.userId) throw new Error("You cannot delete yourself.");
    const { data: prev } = await supabaseAdmin
      .from("swap_profiles")
      .select("username, email, is_admin, is_manager")
      .eq("id", data.id)
      .maybeSingle();
    await supabaseAdmin.from("swap_profiles").delete().eq("id", data.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    await recordAudit({
      userId: context.userId,
      module: "users",
      action: "user_deleted",
      entity_type: "user",
      entity_id: data.id,
      old_values: prev ?? null,
    });
    return { ok: true };
  });

export const listSwapUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);
    const { data, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id, username, email, is_admin, is_manager, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const updateSwapUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        username: usernameRule.optional(),
        email: z.string().email().max(255).optional().or(z.literal("")),
        is_admin: z.boolean().optional(),
        is_manager: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);
    const { data: prev } = await supabaseAdmin
      .from("swap_profiles")
      .select("username, email, is_admin, is_manager")
      .eq("id", data.id)
      .maybeSingle();
    const patch: { username?: string; email?: string | null; is_admin?: boolean; is_manager?: boolean } = {};
    if (data.username !== undefined) patch.username = data.username.toLowerCase();
    if (data.email !== undefined) patch.email = data.email === "" ? null : data.email;
    if (data.is_admin !== undefined) patch.is_admin = data.is_admin;
    if (data.is_manager !== undefined) patch.is_manager = data.is_manager;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin
        .from("swap_profiles")
        .update(patch)
        .eq("id", data.id);
      if (error) throw new Error(error.message);
    }
    if (data.email !== undefined && data.email !== "") {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
        email: data.email,
      });
      if (error) throw new Error(error.message);
    }
    await recordAudit({
      userId: context.userId,
      module: "users",
      action: "user_updated",
      entity_type: "user",
      entity_id: data.id,
      old_values: prev ?? null,
      new_values: patch,
    });
    return { ok: true };
  });

export const resetSwapUserPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), password: z.string().min(6).max(128) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.id, {
      password: data.password,
    });
    if (error) throw new Error(error.message);
    await recordAudit({
      userId: context.userId,
      module: "auth",
      action: "password_reset",
      entity_type: "user",
      entity_id: data.id,
    });
    return { ok: true };
  });

export const getCurrentSwapUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id, username, email, is_admin, is_manager")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const row = data as { username?: string; email?: string | null; is_admin?: boolean; is_manager?: boolean } | null;
    return {
      id: context.userId,
      username: row?.username ?? null,
      email: row?.email ?? null,
      isAdmin: Boolean(row?.is_admin),
      isManager: Boolean(row?.is_manager),
      canBackup: Boolean(row?.is_admin || row?.is_manager),
      isSwapUser: Boolean(row),
    };
  });
