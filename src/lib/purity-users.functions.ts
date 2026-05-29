import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const createSchema = z.object({
  username: z.string().trim().min(2).max(64).regex(/^[a-zA-Z0-9_.-]+$/, "Letters, numbers, . _ - only"),
  email: z.string().trim().email().max(255).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  password: z.string().min(6).max(128),
});

export const createPurityUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => createSchema.parse(d))
  .handler(async ({ data }) => {
    const username = data.username.toLowerCase();

    const { data: existing } = await supabaseAdmin
      .from("purity_profiles")
      .select("id")
      .ilike("username", username)
      .maybeSingle();
    if (existing) throw new Error("Username already taken.");

    const authEmail = data.email ?? `${username}@purity.local`;

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
