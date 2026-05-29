import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const usernameSchema = z.object({
  username: z.string().trim().min(1).max(64),
});

export const resolveUsernameToEmail = createServerFn({ method: "POST" })
  .inputValidator((d) => usernameSchema.parse(d))
  .handler(async ({ data }) => {
    const { data: profile, error } = await supabaseAdmin
      .from("purity_profiles")
      .select("id")
      .ilike("username", data.username)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!profile) throw new Error("Invalid username or password.");

    const { data: userRes, error: userErr } =
      await supabaseAdmin.auth.admin.getUserById(profile.id);
    if (userErr || !userRes?.user?.email) {
      throw new Error("Invalid username or password.");
    }
    return { email: userRes.user.email };
  });
