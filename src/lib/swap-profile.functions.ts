import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

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
    await supabaseAdmin.from("swap_activity_log").insert({
      user_id: context.userId,
      username: (
        await supabaseAdmin
          .from("swap_profiles")
          .select("username")
          .eq("id", context.userId)
          .maybeSingle()
      ).data?.username ?? "unknown",
      action: "password_changed",
      entity_type: "profile",
      entity_id: context.userId,
      details: null,
    });
    return { ok: true };
  });
