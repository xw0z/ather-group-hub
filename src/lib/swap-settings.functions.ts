import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAudit } from "@/lib/swap-audit.server";

export type SwapSettings = {
  default_long_annual_rate: number;
  default_short_annual_rate: number;
  wednesday_multiplier: number;
  skip_saturday: boolean;
  skip_sunday: boolean;
  default_margin_requirement_pct: number;
  default_additional_exposure_pct: number;
  safe_threshold_pct: number;
  warning_threshold_pct: number;
  xau_api_provider: string | null;
  xau_api_key: string | null;
  xau_auto_refresh_seconds: number;
  xau_manual_fallback_price: number | null;
  company_name: string;
  report_footer_text: string | null;
  confidentiality_text: string;
  show_logo_on_reports: boolean;
  default_report_format: "PNG" | "PDF";
  language: "en" | "ar" | "fr";
  updated_at: string;
};

async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("swap_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  return !!data?.is_admin;
}


const SETTINGS_COLS =
  "default_long_annual_rate, default_short_annual_rate, wednesday_multiplier, skip_saturday, skip_sunday, default_margin_requirement_pct, default_additional_exposure_pct, safe_threshold_pct, warning_threshold_pct, xau_api_provider, xau_api_key, xau_auto_refresh_seconds, xau_manual_fallback_price, company_name, report_footer_text, confidentiality_text, show_logo_on_reports, default_report_format, language, updated_at";

async function assertSwapUser(userId: string) {
  const { data } = await supabaseAdmin
    .from("swap_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (!data) throw new Error("Forbidden");
}

export const getSwapSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    await assertSwapUser(userId);
    const admin = await isAdmin(userId);
    const { data, error } = await supabaseAdmin
      .from("swap_settings")
      .select(SETTINGS_COLS)
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("Settings not initialised");
    const s = data as unknown as SwapSettings;
    if (!admin) {
      s.xau_api_key = s.xau_api_key ? "••••••••" : null;
    }
    return { settings: s, isAdmin: admin };
  });

// Narrow, cross-module endpoint that returns only the platform language.
// Used by purity-i18n to keep all desk modules in sync without exposing
// swap-specific configuration.
export const getPlatformLanguage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("swap_settings")
      .select("language")
      .eq("id", "global")
      .maybeSingle();
    if (error) throw new Error(error.message);
    return { language: (data?.language ?? "en") as "en" | "ar" | "fr" };
  });

const patchSchema = z
  .object({
    default_long_annual_rate: z.number().finite().min(0).max(100),
    default_short_annual_rate: z.number().finite().min(0).max(100),
    wednesday_multiplier: z.number().finite().min(0).max(10),
    skip_saturday: z.boolean(),
    skip_sunday: z.boolean(),
    default_margin_requirement_pct: z.number().finite().min(0).max(100),
    default_additional_exposure_pct: z.number().finite().min(0).max(100),
    safe_threshold_pct: z.number().finite().min(0).max(1000),
    warning_threshold_pct: z.number().finite().min(0).max(1000),
    xau_api_provider: z.string().trim().max(64).nullable(),
    xau_api_key: z.string().trim().max(512).nullable(),
    xau_auto_refresh_seconds: z.number().int().min(5).max(86400),
    xau_manual_fallback_price: z.number().finite().min(0).max(1_000_000).nullable(),
    company_name: z.string().trim().min(1).max(120),
    report_footer_text: z.string().trim().max(500).nullable(),
    confidentiality_text: z.string().trim().min(1).max(200),
    show_logo_on_reports: z.boolean(),
    default_report_format: z.enum(["PNG", "PDF"]),
    language: z.enum(["en", "ar", "fr"]),
  })
  .partial();

export const updateSwapSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        patch: patchSchema,
        applyToExistingClients: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { userId } = context;
    if (!(await isAdmin(userId))) {
      throw new Error("Only admins can change settings.");
    }
    const { data: prev } = await supabaseAdmin
      .from("swap_settings")
      .select(SETTINGS_COLS)
      .eq("id", "global")
      .maybeSingle();
    const patch = { ...data.patch, updated_at: new Date().toISOString(), updated_by: userId };

    if (patch.xau_api_key === "••••••••") delete patch.xau_api_key;

    const { data: updated, error } = await supabaseAdmin
      .from("swap_settings")
      .update(patch)
      .eq("id", "global")
      .select(SETTINGS_COLS)
      .single();
    if (error) throw new Error(error.message);

    const changedFields = Object.keys(data.patch);
    const oldSubset: Record<string, unknown> = {};
    const newSubset: Record<string, unknown> = {};
    for (const k of changedFields) {
      if (k === "xau_api_key") continue;
      if (prev && k in (prev as object))
        oldSubset[k] = (prev as Record<string, unknown>)[k];
      newSubset[k] = (data.patch as Record<string, unknown>)[k];
    }
    await recordAudit({
      userId,
      module: "system",
      action: "settings_updated",
      entity_type: "settings",
      entity_id: null,
      old_values: oldSubset,
      new_values: newSubset,
      details: {
        fields: changedFields,
        applyToExistingClients: !!data.applyToExistingClients,
      },
    });

    if (data.applyToExistingClients) {
      const clientPatch: {
        annual_rate?: number;
        short_annual_rate?: number;
        margin_requirement_pct?: number;
        additional_exposure_pct?: number;
      } = {};
      if (data.patch.default_long_annual_rate !== undefined)
        clientPatch.annual_rate = data.patch.default_long_annual_rate;
      if (data.patch.default_short_annual_rate !== undefined)
        clientPatch.short_annual_rate = data.patch.default_short_annual_rate;
      if (data.patch.default_margin_requirement_pct !== undefined)
        clientPatch.margin_requirement_pct = data.patch.default_margin_requirement_pct;
      if (data.patch.default_additional_exposure_pct !== undefined)
        clientPatch.additional_exposure_pct = data.patch.default_additional_exposure_pct;
      if (Object.keys(clientPatch).length > 0) {
        const { error: cErr } = await supabaseAdmin
          .from("swap_clients")
          .update(clientPatch)
          .not("id", "is", null);
        if (cErr) throw new Error(cErr.message);
        await recordAudit({
          userId,
          module: "system",
          action: "settings_applied_to_existing_clients",
          details: { fields: Object.keys(clientPatch) },
          new_values: clientPatch,
        });
      }
    }

    return { settings: updated as unknown as SwapSettings };
  });
