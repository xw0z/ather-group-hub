import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SwapSettings = {
  default_long_annual_rate: number;
  default_short_annual_rate: number;
  wednesday_multiplier: number;
  skip_saturday: boolean;
  skip_sunday: boolean;
  default_margin_requirement_pct: number;
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

async function getUsername(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("swap_profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return data?.username ?? "unknown";
}

const SETTINGS_COLS =
  "default_long_annual_rate, default_short_annual_rate, wednesday_multiplier, skip_saturday, skip_sunday, default_margin_requirement_pct, safe_threshold_pct, warning_threshold_pct, xau_api_provider, xau_api_key, xau_auto_refresh_seconds, xau_manual_fallback_price, company_name, report_footer_text, confidentiality_text, show_logo_on_reports, default_report_format, updated_at";

export const getSwapSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
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

const patchSchema = z
  .object({
    default_long_annual_rate: z.number().finite().min(0).max(100),
    default_short_annual_rate: z.number().finite().min(0).max(100),
    wednesday_multiplier: z.number().finite().min(0).max(10),
    skip_saturday: z.boolean(),
    skip_sunday: z.boolean(),
    default_margin_requirement_pct: z.number().finite().min(0).max(100),
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
    const username = await getUsername(userId);
    const patch = { ...data.patch, updated_at: new Date().toISOString(), updated_by: userId };
    
    if (patch.xau_api_key === "••••••••") delete patch.xau_api_key;

    const { data: updated, error } = await supabaseAdmin
      .from("swap_settings")
      .update(patch)
      .eq("id", "global")
      .select(SETTINGS_COLS)
      .single();
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("swap_activity_log").insert({
      user_id: userId,
      username,
      action: "settings_updated",
      details: {
        fields: Object.keys(data.patch),
        applyToExistingClients: !!data.applyToExistingClients,
      },
    });

    if (data.applyToExistingClients) {
      const clientPatch: {
        annual_rate?: number;
        short_annual_rate?: number;
        margin_requirement_pct?: number;
      } = {};
      if (data.patch.default_long_annual_rate !== undefined)
        clientPatch.annual_rate = data.patch.default_long_annual_rate;
      if (data.patch.default_short_annual_rate !== undefined)
        clientPatch.short_annual_rate = data.patch.default_short_annual_rate;
      if (data.patch.default_margin_requirement_pct !== undefined)
        clientPatch.margin_requirement_pct = data.patch.default_margin_requirement_pct;
      if (Object.keys(clientPatch).length > 0) {
        const { error: cErr } = await supabaseAdmin
          .from("swap_clients")
          .update(clientPatch)
          .not("id", "is", null);
        if (cErr) throw new Error(cErr.message);
        await supabaseAdmin.from("swap_activity_log").insert({
          user_id: userId,
          username,
          action: "settings_applied_to_existing_clients",
          details: { fields: Object.keys(clientPatch) },
        });
      }
    }

    return { settings: updated as unknown as SwapSettings };
  });
