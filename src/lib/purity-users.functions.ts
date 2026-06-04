import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const ADMIN_USERNAME = "admin";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("purity_profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.username?.toLowerCase() !== ADMIN_USERNAME) {
    throw new Error("Only the admin can manage users.");
  }
}

const createSchema = z.object({
  username: z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only"),
  email: z.string().trim().email().max(255).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  password: z.string().min(6).max(128),
});

export const createPurityUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const username = data.username.toLowerCase();

    const { data: existing } = await supabaseAdmin
      .from("purity_profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) throw new Error("Username already taken.");

    const authEmail = data.email ?? `${username}@ather.group`;

    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: authEmail,
      password: data.password,
      email_confirm: true,
    });
    if (createErr || !created.user) throw new Error(createErr?.message ?? "Failed to create user.");

    const { error: profErr } = await supabaseAdmin.from("purity_profiles").insert({
      id: created.user.id,
      username,
      email: data.email ?? null,
    });
    if (profErr) {
      await supabaseAdmin.auth.admin.deleteUser(created.user.id);
      throw new Error(profErr.message);
    }

    return { ok: true, username };
  });

export const deletePurityUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.id === context.userId) throw new Error("You cannot delete yourself.");

    const { data: target } = await supabaseAdmin
      .from("purity_profiles")
      .select("username")
      .eq("id", data.id)
      .maybeSingle();
    if (target?.username?.toLowerCase() === ADMIN_USERNAME) {
      throw new Error("The admin account cannot be deleted.");
    }

    await supabaseAdmin.from("purity_profiles").delete().eq("id", data.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPurityUsers = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("purity_profiles")
      .select("id, username, email, created_at")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getCurrentPurityUser = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await supabaseAdmin
      .from("purity_profiles")
      .select("id, username, email")
      .eq("id", context.userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    const username = data?.username ?? null;
    return {
      id: context.userId,
      username,
      email: data?.email ?? null,
      isAdmin: username?.toLowerCase() === ADMIN_USERNAME,
    };
  });

const updateProfileSchema = z.object({
  username: z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only").optional(),
  email: z.string().trim().email().max(255).optional().or(z.literal("")),
});

export const updatePurityProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => updateProfileSchema.parse(d))
  .handler(async ({ data, context }) => {
    const updates: { username?: string; email?: string | null } = {};

    if (data.username !== undefined) {
      const username = data.username.toLowerCase();
      const { data: existing } = await supabaseAdmin
        .from("purity_profiles")
        .select("id")
        .ilike("username", username)
        .neq("id", context.userId)
        .maybeSingle();
      if (existing) throw new Error("Username already taken.");
      updates.username = username;
    }

    if (data.email !== undefined) {
      const email = data.email === "" ? null : data.email;
      updates.email = email;
      if (email) {
        const { error: authErr } = await supabaseAdmin.auth.admin.updateUserById(
          context.userId,
          { email, email_confirm: true },
        );
        if (authErr) throw new Error(authErr.message);
      }
    }

    if (Object.keys(updates).length > 0) {
      const { error } = await supabaseAdmin
        .from("purity_profiles")
        .update(updates)
        .eq("id", context.userId);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });

