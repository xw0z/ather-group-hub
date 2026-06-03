import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

// Resolve a swap username to its auth email so users can log in by username.
export const resolveSwapUsernameToEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ username: z.string().trim().min(1).max(64) }).parse(d))
  .handler(async ({ data }) => {
    const { data: profile, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id")
      .ilike("username", data.username)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Invalid username or password.");
    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (userErr || !userRes?.user?.email) throw new Error("Invalid username or password.");
    return { email: userRes.user.email };
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
    const authEmail = data.email && data.email !== "" ? data.email : `${username}@swap.local`;

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

    const authEmail = data.email && data.email !== "" ? data.email : `${username}@swap.local`;
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
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(profErr.message);
    }
    return { ok: true, username };
  });

export const deleteSwapUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);
    if (data.id === context.userId) throw new Error("You cannot delete yourself.");
    await supabaseAdmin.from("swap_profiles").delete().eq("id", data.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listSwapUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id, username, email, is_admin, created_at")
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
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);
    const patch: Record<string, unknown> = {};
    if (data.username !== undefined) patch.username = data.username.toLowerCase();
    if (data.email !== undefined) patch.email = data.email === "" ? null : data.email;
    if (data.is_admin !== undefined) patch.is_admin = data.is_admin;
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
    return { ok: true };
  });

export const getCurrentSwapUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("swap_profiles")
      .select("id, username, email, is_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return {
      id: context.userId,
      username: data?.username ?? null,
      email: data?.email ?? null,
      isAdmin: Boolean(data?.is_admin),
      isSwapUser: Boolean(data),
    };
  });
