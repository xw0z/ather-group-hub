import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const LocaleSchema = z.enum(["en", "fr", "ar"]);

export type TranslationOverride = {
  id: string;
  key: string;
  locale: "en" | "fr" | "ar";
  value: string;
  updated_by: string | null;
  updated_at: string;
};

async function getAdmin() {
  const mod = await import("@/integrations/supabase/client.server");
  return mod.supabaseAdmin;
}

export const listTranslationOverrides = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<TranslationOverride[]> => {
    const supabaseAdmin = await getAdmin();
    const { data, error } = await supabaseAdmin
      .from("swap_translation_overrides")
      .select("id, key, locale, value, updated_by, updated_at")
      .order("key", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []) as TranslationOverride[];
  });

export const upsertTranslationOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        key: z.string().min(1).max(255),
        locale: LocaleSchema,
        value: z.string().min(1).max(2000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    // Enforce admin-only at the application layer too (RLS already restricts writes)
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof?.is_admin) throw new Error("Admin only.");

    const { error } = await supabaseAdmin
      .from("swap_translation_overrides")
      .upsert(
        {
          key: data.key,
          locale: data.locale,
          value: data.value,
          updated_by: context.userId,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key,locale" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteTranslationOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        key: z.string().min(1).max(255),
        locale: LocaleSchema,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof?.is_admin) throw new Error("Admin only.");

    const { error } = await supabaseAdmin
      .from("swap_translation_overrides")
      .delete()
      .eq("key", data.key)
      .eq("locale", data.locale);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const bulkImportTranslationOverrides = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        entries: z
          .array(
            z.object({
              key: z.string().min(1).max(255),
              locale: LocaleSchema,
              value: z.string().min(1).max(2000),
            }),
          )
          .max(5000),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await getAdmin();
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof?.is_admin) throw new Error("Admin only.");

    if (data.entries.length === 0) return { ok: true, count: 0 };

    const now = new Date().toISOString();
    const rows = data.entries.map((e) => ({
      key: e.key,
      locale: e.locale,
      value: e.value,
      updated_by: context.userId,
      updated_at: now,
    }));
    const { error } = await supabaseAdmin
      .from("swap_translation_overrides")
      .upsert(rows, { onConflict: "key,locale" });
    if (error) throw new Error(error.message);
    return { ok: true, count: rows.length };
  });
