import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { recordAudit, type AuditModule } from "@/lib/swap-audit.server";
import { assertPermission } from "@/lib/permissions.functions";


const codeRule = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.\- ]+$/, "Letters, numbers, . _ - space only");
const positionTypeRule = z.enum(["long", "short"]);

// 1 kg gold = 32.1507466 troy ounces
export const TROY_OZ_PER_KG = 32.1507466;

/**
 * Margin calculation — business rules
 * ------------------------------------
 * Inputs:
 *   - usd_balance:              Client's USD balance. POSITIVE = credit the client holds
 *                               at the company. NEGATIVE = client debt to the company.
 *   - gold_kg:                  Gold position held FOR the client (treated as client asset).
 *   - xauusd_price:             Current XAU/USD spot price (per troy ounce).
 *   - margin_requirement_pct:   Margin requirement on the gold exposure (e.g. 20 = 20%).
 *
 * Formulas:
 *   Gold Value       = gold_kg × 32.1507466 (oz/kg) × XAU/USD
 *   Equity           = USD Balance + Gold Value           (negative USD = client debt)
 *   Total Exposure   = Gold Value                         (gold position is the exposure)
 *   Required Margin  = Gold Value × Margin %
 *   Available Margin = Equity                             (gold counted as client asset)
 *   Difference       = Equity − Required Margin
 *   Margin Level %   = (Equity ÷ Required Margin) × 100
 *
 * Status tiers:
 *   - critical:  Equity < 0 (client is underwater — debt exceeds gold value)
 *   - needed:    Equity < Required Margin (margin call needed)
 *   - warning:   Margin Level between 100% and 120%
 *   - safe:      Margin Level ≥ 120%, or no gold exposure with non-negative equity
 */
export function computeMargin(input: {
  usd_balance: number;
  gold_kg: number;
  xauusd_price: number | null;
  margin_requirement_pct: number;
}) {
  const xau = Number(input.xauusd_price ?? 0);
  const usdBalance = Number(input.usd_balance); // negative = client debt to company
  const goldValue = Number(input.gold_kg) * TROY_OZ_PER_KG * xau;
  // Equity = USD Balance + Gold Value (gold treated as client asset)
  const equity = usdBalance + goldValue;
  // Total exposure is the gold position value only
  const totalExposure = goldValue;
  // Required Margin = Gold Value × Margin %
  const requiredMargin = (totalExposure * Number(input.margin_requirement_pct)) / 100;
  // Available Margin = Equity (USD + Gold), NOT raw USD balance
  const availableMargin = equity;
  // Difference = Equity − Required Margin (positive = surplus, negative = shortfall)
  const difference = availableMargin - requiredMargin;
  const marginLevelPct = requiredMargin > 0 ? (equity / requiredMargin) * 100 : 0;
  let tier: "safe" | "warning" | "needed" | "critical";
  if (requiredMargin <= 0) tier = equity < 0 ? "critical" : "safe";
  else if (equity < 0) tier = "critical";
  else if (marginLevelPct >= 120) tier = "safe";
  else if (marginLevelPct >= 100) tier = "warning";
  else tier = "needed";
  // status is derived from tier — keeps the two fields in lockstep.
  const status: "enough" | "needed" =
    tier === "needed" || tier === "critical" ? "needed" : "enough";
  return {
    goldValue,
    equity,
    totalExposure,
    requiredMargin,
    availableMargin,
    difference,
    marginLevelPct,
    status,
    tier,
  };
}

async function getUsername(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("swap_profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return data?.username ?? "unknown";
}

// Membership gate: ensure caller is a Swap section user (since we use
// supabaseAdmin and bypass RLS, this server-side check is required).
export async function assertSwapUser(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("swap_profiles")
    .select("id")
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: not a Swap user.");
}

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

// Forex/CFD swap rollover multipliers by weekday.
// Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
// Wednesday charges 3 days to cover the weekend; Sat/Sun = 0 by default.
// Business timezone is Asia/Dubai (UTC+4, no DST) so weekday boundaries
// align with the Dubai trading day, not UTC.
const SWAP_DAY_MULTIPLIERS = [0, 1, 1, 3, 1, 1, 0] as const;

// Day-of-week (0=Sun..6=Sat) in Asia/Dubai. Dubai has no DST, fixed UTC+4,
// so we can compute this with a fixed offset without Intl.
export function dubaiWeekday(date: Date = new Date()): number {
  const dubai = new Date(date.getTime() + 4 * 60 * 60 * 1000);
  return dubai.getUTCDay();
}

export function swapDayMultiplier(date: Date = new Date()): number {
  return SWAP_DAY_MULTIPLIERS[dubaiWeekday(date)];
}

// Settings-aware multiplier. Honours admin settings:
//   wednesday_multiplier (default 3), skip_saturday (default true), skip_sunday (default true).
export function swapDayMultiplierFromSettings(
  date: Date,
  settings: {
    wednesday_multiplier?: number | null;
    skip_saturday?: boolean | null;
    skip_sunday?: boolean | null;
  } | null | undefined,
): number {
  const wd = dubaiWeekday(date);
  const wedMult = Number(settings?.wednesday_multiplier ?? 3);
  const skipSat = settings?.skip_saturday ?? true;
  const skipSun = settings?.skip_sunday ?? true;
  if (wd === 0) return skipSun ? 0 : 1; // Sunday
  if (wd === 6) return skipSat ? 0 : 1; // Saturday
  if (wd === 3) return wedMult;          // Wednesday
  return 1;
}


// Effective annual rate for a client given their position type.
function effectiveAnnualRate(c: {
  position_type: string | null;
  annual_rate: number | string;
  short_annual_rate: number | string | null;
}): number {
  return (c.position_type ?? "long") === "short"
    ? Number(c.short_annual_rate ?? 0)
    : Number(c.annual_rate);
}

// Effective balance applies Additional Exposure (%) on top of USD balance.
// effective = usd * (1 + additional_exposure_pct / 100). Default exposure 5%.
export function effectiveBalance(
  usdBalance: number,
  additionalExposurePct: number | string | null | undefined,
): number {
  const pct = Number(additionalExposurePct ?? 5);
  return Number(usdBalance) * (1 + pct / 100);
}

const ACTION_MODULE: Record<string, AuditModule> = {
  client_created: "clients",
  client_updated: "clients",
  client_deleted: "clients",
  fees_computed_manual: "swap",
  fees_backfilled: "swap",
  fee_date_locked: "swap",
  fee_date_unlocked: "swap",
  xau_price_override: "margin",
};

// Returns the set of fee_dates (YYYY-MM-DD) that are currently locked.
async function loadLockedDates(dates: string[]): Promise<Set<string>> {
  if (dates.length === 0) return new Set();
  const { data } = await supabaseAdmin
    .from("swap_fee_locks")
    .select("fee_date")
    .in("fee_date", dates);
  return new Set((data ?? []).map((r) => r.fee_date as string));
}

function deriveModule(
  action: string,
  details: Record<string, Json> | null,
): AuditModule {
  if (ACTION_MODULE[action]) return ACTION_MODULE[action];
  if (action === "client_updated" && details) {
    if ("usd_balance" in details || "gold_kg" in details) return "financial";
    if ("margin_requirement_pct" in details) return "margin";
    if (
      "annual_rate" in details ||
      "short_annual_rate" in details ||
      "additional_exposure_pct" in details
    )
      return "swap";
  }
  return "clients";
}

async function logActivity(
  userId: string,
  action: string,
  entity_type: string | null,
  entity_id: string | null,
  details: Record<string, Json> | null,
  oldValues?: Record<string, Json> | null,
  newValues?: Record<string, Json> | null,
) {
  await recordAudit({
    userId,
    module: deriveModule(action, details),
    action,
    entity_type,
    entity_id,
    old_values: oldValues ?? null,
    new_values: newValues ?? null,
    details: details ?? null,
  });
}

export const listSwapClients = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);
    const { data, error } = await supabaseAdmin
      .from("swap_clients")
      .select(
        "id, code, usd_balance, gold_kg, xauusd_price, margin_requirement_pct, annual_rate, short_annual_rate, additional_exposure_pct, position_type, notes, created_by, created_at, updated_at",
      )
      .order("code", { ascending: true });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const createSwapClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        code: codeRule,
        usd_balance: z.number().finite().min(-1e12).max(1e12),
        gold_kg: z.number().finite().min(0).max(1e6).optional(),
        xauusd_price: z.number().finite().min(0).max(1e6).optional().nullable(),
        margin_requirement_pct: z.number().finite().min(0).max(100).optional(),
        annual_rate: z.number().finite().min(0).max(100).optional(),
        short_annual_rate: z.number().finite().min(0).max(100).optional(),
        additional_exposure_pct: z.number().finite().min(0).max(100).optional(),
        position_type: positionTypeRule.optional(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);
    await assertPermission(context.userId, "swap", "create");

    const { data: row, error } = await supabaseAdmin
      .from("swap_clients")
      .insert({
        code: data.code.trim(),
        usd_balance: data.usd_balance,
        gold_kg: data.gold_kg ?? 0,
        xauusd_price: data.xauusd_price ?? null,
        margin_requirement_pct: data.margin_requirement_pct ?? 20,
        annual_rate: data.annual_rate ?? 5.4,
        short_annual_rate: data.short_annual_rate ?? 2.5,
        additional_exposure_pct: data.additional_exposure_pct ?? 5,
        position_type: data.position_type ?? "long",
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "client_created", "client", row.id, {
      code: row.code,
      usd_balance: row.usd_balance,
      gold_kg: row.gold_kg,
      xauusd_price: row.xauusd_price,
      margin_requirement_pct: row.margin_requirement_pct,
      annual_rate: row.annual_rate,
      short_annual_rate: row.short_annual_rate,
      additional_exposure_pct: row.additional_exposure_pct,
      position_type: row.position_type,
    });
    return row;
  });

export const updateSwapClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid(),
        code: codeRule.optional(),
        usd_balance: z.number().finite().min(-1e12).max(1e12).optional(),
        gold_kg: z.number().finite().min(0).max(1e6).optional(),
        xauusd_price: z.number().finite().min(0).max(1e6).optional().nullable(),
        margin_requirement_pct: z.number().finite().min(0).max(100).optional(),
        annual_rate: z.number().finite().min(0).max(100).optional(),
        short_annual_rate: z.number().finite().min(0).max(100).optional(),
        additional_exposure_pct: z.number().finite().min(0).max(100).optional(),
        position_type: positionTypeRule.optional(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);
    await assertPermission(context.userId, "swap", "edit");

    const patch: {
      code?: string;
      usd_balance?: number;
      gold_kg?: number;
      xauusd_price?: number | null;
      margin_requirement_pct?: number;
      annual_rate?: number;
      short_annual_rate?: number;
      additional_exposure_pct?: number;
      position_type?: "long" | "short";
      notes?: string | null;
    } = {};
    if (data.code !== undefined) patch.code = data.code.trim();
    if (data.usd_balance !== undefined) patch.usd_balance = data.usd_balance;
    if (data.gold_kg !== undefined) patch.gold_kg = data.gold_kg;
    if (data.xauusd_price !== undefined) patch.xauusd_price = data.xauusd_price;
    if (data.margin_requirement_pct !== undefined)
      patch.margin_requirement_pct = data.margin_requirement_pct;
    if (data.annual_rate !== undefined) patch.annual_rate = data.annual_rate;
    if (data.short_annual_rate !== undefined) patch.short_annual_rate = data.short_annual_rate;
    if (data.additional_exposure_pct !== undefined)
      patch.additional_exposure_pct = data.additional_exposure_pct;
    if (data.position_type !== undefined) patch.position_type = data.position_type;
    if (data.notes !== undefined) patch.notes = data.notes;

    // Fetch existing for margin history comparison
    const { data: existing } = await supabaseAdmin
      .from("swap_clients")
      .select("usd_balance, gold_kg, xauusd_price, margin_requirement_pct")
      .eq("id", data.id)
      .maybeSingle();

    const { data: row, error } = await supabaseAdmin
      .from("swap_clients")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Log margin change history when relevant fields changed
    if (existing) {
      const changedFields: string[] = [];
      if (data.usd_balance !== undefined && Number(existing.usd_balance) !== data.usd_balance)
        changedFields.push("usd_balance");
      if (data.gold_kg !== undefined && Number(existing.gold_kg ?? 0) !== data.gold_kg)
        changedFields.push("gold_kg");
      if (
        data.xauusd_price !== undefined &&
        Number(existing.xauusd_price ?? 0) !== Number(data.xauusd_price ?? 0)
      )
        changedFields.push("xauusd_price");
      if (
        data.margin_requirement_pct !== undefined &&
        Number(existing.margin_requirement_pct ?? 0) !== data.margin_requirement_pct
      )
        changedFields.push("margin_requirement_pct");

      if (changedFields.length > 0) {
        const oldM = computeMargin({
          usd_balance: Number(existing.usd_balance),
          gold_kg: Number(existing.gold_kg ?? 0),
          xauusd_price: existing.xauusd_price !== null ? Number(existing.xauusd_price) : null,
          margin_requirement_pct: Number(existing.margin_requirement_pct ?? 20),
        });
        const newM = computeMargin({
          usd_balance: Number(row.usd_balance),
          gold_kg: Number(row.gold_kg ?? 0),
          xauusd_price: row.xauusd_price !== null ? Number(row.xauusd_price) : null,
          margin_requirement_pct: Number(row.margin_requirement_pct ?? 20),
        });
        const username = await getUsername(context.userId);
        await supabaseAdmin.from("swap_margin_history").insert({
          client_id: row.id,
          user_id: context.userId,
          username,
          changed_field: changedFields.join(","),
          old_usd_balance: existing.usd_balance,
          new_usd_balance: row.usd_balance,
          old_gold_kg: existing.gold_kg,
          new_gold_kg: row.gold_kg,
          old_xauusd_price: existing.xauusd_price,
          new_xauusd_price: row.xauusd_price,
          old_margin_pct: existing.margin_requirement_pct,
          new_margin_pct: row.margin_requirement_pct,
          old_required_margin: oldM.requiredMargin,
          new_required_margin: newM.requiredMargin,
          old_available_margin: oldM.availableMargin,
          new_available_margin: newM.availableMargin,
          old_status: oldM.status,
          new_status: newM.status,
        });
      }
    }

    await logActivity(
      context.userId,
      "client_updated",
      "client",
      row.id,
      patch as Record<string, Json>,
      (existing ?? null) as Record<string, Json> | null,
      {
        usd_balance: row.usd_balance,
        gold_kg: row.gold_kg,
        xauusd_price: row.xauusd_price,
        margin_requirement_pct: row.margin_requirement_pct,
        annual_rate: row.annual_rate,
        short_annual_rate: row.short_annual_rate,
        additional_exposure_pct: row.additional_exposure_pct,
        position_type: row.position_type,
        code: row.code,
        notes: row.notes,
      } as Record<string, Json>,
    );
    return row;
  });




export const deleteSwapClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);
    await assertPermission(context.userId, "swap", "delete");

    const { data: row } = await supabaseAdmin
      .from("swap_clients")
      .select("code")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabaseAdmin.from("swap_clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "client_deleted", "client", data.id, {
      code: row?.code ?? null,
    });
    return { ok: true };
  });

export const listSwapActivityLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);
    await assertPermission(context.userId, "audit", "view");
    const { data, error } = await supabaseAdmin
      .from("swap_activity_log")
      .select(
        "id, user_id, username, action, module, status, entity_type, entity_id, details, old_values, new_values, ip_address, user_agent, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listTodaySwapFees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);
    const today = new Date().toISOString().slice(0, 10);
    const { data: clients, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select("id, code, usd_balance, annual_rate, short_annual_rate, additional_exposure_pct, position_type, notes")
      .order("code");
    if (cErr) throw new Error(cErr.message);

    const { data: fees, error: fErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select(
        "client_id, fee_date, xauusd_price, daily_fee, usd_balance, annual_rate, position_type, additional_exposure_pct, effective_balance, day_multiplier",
      )
      .order("fee_date", { ascending: false });
    if (fErr) throw new Error(fErr.message);

    const latestByClient = new Map<string, (typeof fees)[number]>();
    const todayByClient = new Map<string, (typeof fees)[number]>();
    for (const f of fees ?? []) {
      if (!latestByClient.has(f.client_id)) latestByClient.set(f.client_id, f);
      if (f.fee_date === today && !todayByClient.has(f.client_id))
        todayByClient.set(f.client_id, f);
    }

    let lastXauPrice: number | null = null;
    let lastXauDate: string | null = null;
    for (const f of fees ?? []) {
      if (f.xauusd_price !== null && f.xauusd_price !== undefined) {
        lastXauPrice = Number(f.xauusd_price);
        lastXauDate = f.fee_date;
        break;
      }
    }

    const { data: feeSettings } = await supabaseAdmin
      .from("swap_settings")
      .select("wednesday_multiplier, skip_saturday, skip_sunday")
      .eq("id", "global")
      .maybeSingle();
    const todayMultiplier = swapDayMultiplierFromSettings(new Date(), feeSettings);
    return {
      today,
      todayMultiplier,
      lastXauPrice,
      lastXauDate,
      rows: (clients ?? []).map((c) => {
        const t = todayByClient.get(c.id);
        const l = latestByClient.get(c.id);
        const positionType = (c.position_type ?? "long") as "long" | "short";
        const effRate = effectiveAnnualRate(c);
        const addExp = Number(c.additional_exposure_pct ?? 5);
        const effBal = effectiveBalance(Number(c.usd_balance), addExp);
        // Fee magnitude is based on ABS(effective_balance). A negative USD
        // balance means the client owes money and must still be charged the
        // financing fee. Sign of charge/credit is conveyed by position_type
        // in the UI (long = charge, short = benefit).
        const baseDaily = (Math.abs(effBal) * effRate) / 100 / 365;
        const baseDailyClamped = baseDaily;
        const liveDaily = baseDailyClamped * todayMultiplier;


        return {
          id: c.id,
          code: c.code,
          notes: c.notes ?? null,
          position_type: positionType,
          usd_balance: Number(c.usd_balance),
          annual_rate: Number(c.annual_rate),
          short_annual_rate: Number(c.short_annual_rate ?? 0),
          additional_exposure_pct: addExp,
          effective_balance: effBal,
          effective_annual_rate: effRate,
          today_fee: t ? Number(t.daily_fee) : null,
          today_xauusd: t?.xauusd_price ? Number(t.xauusd_price) : null,
          today_multiplier: t?.day_multiplier ?? todayMultiplier,
          last_fee: l ? Number(l.daily_fee) : null,
          last_fee_date: l?.fee_date ?? null,
          base_daily_fee: baseDaily,
          live_daily_fee: liveDaily,
        };
      }),
    };
  });


export const getSwapClientHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);
    const { data: client, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select(
        "id, code, usd_balance, annual_rate, short_annual_rate, additional_exposure_pct, position_type, notes, created_at",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: fees, error: fErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select(
        "id, fee_date, xauusd_price, daily_fee, usd_balance, annual_rate, position_type, additional_exposure_pct, effective_balance, day_multiplier, created_at",
      )
      .eq("client_id", data.id)
      .order("fee_date", { ascending: false })
      .limit(365);
    if (fErr) throw new Error(fErr.message);

    return {
      client: {
        id: client.id,
        code: client.code,
        notes: client.notes ?? null,
        position_type: (client.position_type ?? "long") as "long" | "short",
        usd_balance: Number(client.usd_balance),
        annual_rate: Number(client.annual_rate),
        short_annual_rate: Number(client.short_annual_rate ?? 0),
        additional_exposure_pct: Number(client.additional_exposure_pct ?? 5),
      },
      fees: (fees ?? []).map((f) => ({
        id: f.id,
        fee_date: f.fee_date,
        xauusd_price: f.xauusd_price !== null ? Number(f.xauusd_price) : null,
        daily_fee: Number(f.daily_fee),
        usd_balance: Number(f.usd_balance),
        annual_rate: Number(f.annual_rate),
        additional_exposure_pct: Number(f.additional_exposure_pct ?? 5),
        effective_balance:
          f.effective_balance !== null && f.effective_balance !== undefined
            ? Number(f.effective_balance)
            : Number(f.usd_balance) *
              (1 + Number(f.additional_exposure_pct ?? 5) / 100),
        day_multiplier:
          f.day_multiplier ??
          swapDayMultiplier(new Date(`${f.fee_date}T00:00:00Z`)),
        position_type: (f.position_type ?? "long") as "long" | "short",
        created_at: f.created_at,
      })),
    };
  });


// Manual trigger for admins to compute today's fees on demand.
export const computeSwapFeesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof?.is_admin) throw new Error("Only admins can run this.");
    const result = await runDailyFeeJob();
    await logActivity(context.userId, "fees_computed_manual", null, null, result);
    return result;
  });

// Status for the automatic daily-fee snapshot job (cron at 22:00 UTC).
// Reads the most recent cron run from the audit log + the latest snapshot date.
export const getDailyFeeJobStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { data: runs } = await supabaseAdmin
      .from("swap_activity_log")
      .select("created_at, status, details")
      .eq("module", "system")
      .eq("action", "daily_fees_cron")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastRun = runs?.[0] ?? null;

    const { data: lastSuccessRun } = await supabaseAdmin
      .from("swap_activity_log")
      .select("created_at")
      .eq("module", "system")
      .eq("action", "daily_fees_cron")
      .eq("status", "success")
      .order("created_at", { ascending: false })
      .limit(1);

    const { data: lastFee } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("fee_date, created_at")
      .order("fee_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1);

    // Next scheduled run = next 22:00 UTC after now.
    const now = new Date();
    const next = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate(),
        22,
        0,
        0,
      ),
    );
    if (next.getTime() <= now.getTime()) {
      next.setUTCDate(next.getUTCDate() + 1);
    }

    return {
      lastRunAt: lastRun?.created_at ?? null,
      lastRunStatus: (lastRun?.status as string | null) ?? null,
      lastSuccessAt: lastSuccessRun?.[0]?.created_at ?? null,
      lastSnapshotDate: lastFee?.[0]?.fee_date ?? null,
      nextRunAt: next.toISOString(),
      healthy: lastRun ? lastRun.status === "success" : false,
    };
  });

// Shared core used by cron + manual trigger.
export async function runDailyFeeJob() {
  let xauusd: number | null = null;
  try {
    const r = await fetch("https://api.gold-api.com/price/XAU", {
      headers: { Accept: "application/json" },
    });
    if (r.ok) {
      const j = (await r.json()) as { price?: number };
      if (typeof j.price === "number") xauusd = j.price;
    }
  } catch {
    xauusd = null;
  }

  // Load fee settings once. wednesday_multiplier / skip_saturday / skip_sunday
  // control day-of-week behavior so admin settings actually drive calculation.
  const { data: feeSettings } = await supabaseAdmin
    .from("swap_settings")
    .select("wednesday_multiplier, skip_saturday, skip_sunday")
    .eq("id", "global")
    .maybeSingle();

  const today = new Date().toISOString().slice(0, 10);
  const { data: clients, error } = await supabaseAdmin
    .from("swap_clients")
    .select("id, usd_balance, annual_rate, short_annual_rate, additional_exposure_pct, position_type");
  if (error) throw new Error(error.message);

  const nowIso = new Date().toISOString();

  // Determine which dates to write. Default: just today.
  // Backfill: for each client, fill any missing weekdays since their last
  // snapshot up to today. Weekend skipping driven by settings.
  // Look back at most 14 days to bound the work.
  const MAX_BACKFILL_DAYS = 14;
  const { data: lastByClient } = await supabaseAdmin
    .from("swap_daily_fees")
    .select("client_id, fee_date")
    .gte(
      "fee_date",
      new Date(Date.now() - MAX_BACKFILL_DAYS * 86400_000)
        .toISOString()
        .slice(0, 10),
    )
    .order("fee_date", { ascending: false });
  const lastDateByClient = new Map<string, string>();
  for (const r of lastByClient ?? []) {
    if (!lastDateByClient.has(r.client_id))
      lastDateByClient.set(r.client_id, r.fee_date);
  }

  function datesBetween(fromExclusive: string | null, toInclusive: string): string[] {
    const out: string[] = [];
    const end = new Date(`${toInclusive}T00:00:00Z`);
    const start = fromExclusive
      ? new Date(`${fromExclusive}T00:00:00Z`)
      : new Date(end.getTime() - MAX_BACKFILL_DAYS * 86400_000);
    const cursor = new Date(start.getTime() + 86400_000);
    while (cursor.getTime() <= end.getTime()) {
      out.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return out;
  }

  const rows: Array<{
    client_id: string;
    fee_date: string;
    xauusd_price: number | null;
    usd_balance: number;
    annual_rate: number;
    additional_exposure_pct: number;
    effective_balance: number;
    day_multiplier: number;
    position_type: "long" | "short";
    daily_fee: number;
    created_at: string;
  }> = [];

  for (const c of clients ?? []) {
    const positionType = (c.position_type ?? "long") as "long" | "short";
    const effRate = effectiveAnnualRate(c);
    const addExp = Number(c.additional_exposure_pct ?? 5);
    const effBal = effectiveBalance(Number(c.usd_balance), addExp);
    const last = lastDateByClient.get(c.id) ?? null;
    const dates = last === today ? [today] : datesBetween(last, today);
    for (const d of dates) {
      const mult = swapDayMultiplierFromSettings(
        new Date(`${d}T00:00:00Z`),
        feeSettings,
      );
      // Fee magnitude uses ABS(effective_balance): clients with a negative
      // USD balance still owe daily financing fees. Position type drives the
      // displayed sign (charge vs benefit).
      const baseDaily = (Math.abs(effBal) * effRate) / 100 / 365;
      const baseDailyClamped = baseDaily;
      rows.push({
        client_id: c.id,
        fee_date: d,
        // Only stamp live XAU on today's snapshot; backfilled rows leave it null.
        xauusd_price: d === today ? xauusd : null,
        usd_balance: Number(c.usd_balance),
        annual_rate: effRate,
        additional_exposure_pct: addExp,
        effective_balance: effBal,
        day_multiplier: mult,
        position_type: positionType,
        daily_fee: baseDailyClamped * mult,
        created_at: nowIso,
      });
    }
  }


  // Drop any rows for locked fee_dates — locked snapshots are immutable.
  const lockedDates = await loadLockedDates([...new Set(rows.map((r) => r.fee_date))]);
  const writableRows = rows.filter((r) => !lockedDates.has(r.fee_date));

  if (writableRows.length > 0) {
    // M1: idempotent insert — never overwrite a fee that has already been
    // committed for (client_id, fee_date). Cron retries are safe.
    const { error: upErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .upsert(writableRows, { onConflict: "client_id,fee_date", ignoreDuplicates: true });
    if (upErr) throw new Error(upErr.message);
  }


  let whatsapp: { sent: number; failed: number; skipped?: string } = { sent: 0, failed: 0 };
  try {
    whatsapp = await sendDailyWhatsAppStatements(today);
  } catch (e) {
    whatsapp = {
      sent: 0,
      failed: 0,
      skipped: e instanceof Error ? e.message : "whatsapp send failed",
    };
  }

  return { date: today, xauusd, count: rows.length, whatsapp };
}

function fmtNum(n: number, d = 2): string {
  return Number(n).toLocaleString("en-US", {
    minimumFractionDigits: d,
    maximumFractionDigits: d,
  });
}

async function sendDailyWhatsAppStatements(
  feeDate: string,
): Promise<{ sent: number; failed: number; skipped?: string }> {
  const lovableKey = process.env.LOVABLE_API_KEY;
  const twilioKey = process.env.TWILIO_API_KEY;
  const fromRaw = process.env.TWILIO_WHATSAPP_FROM;
  const toRaw = process.env.ADMIN_WHATSAPP_TO;
  if (!lovableKey || !twilioKey || !fromRaw || !toRaw) {
    return { sent: 0, failed: 0, skipped: "missing twilio/whatsapp env vars" };
  }
  const normalize = (raw: string) => {
    const trimmed = raw.trim().replace(/^whatsapp:/i, "");
    const cleaned = trimmed.replace(/[^\d+]/g, "");
    return `whatsapp:${cleaned}`;
  };
  const from = normalize(fromRaw);
  const to = normalize(toRaw);

  const { data: clients, error } = await supabaseAdmin
    .from("swap_clients")
    .select("id, code, notes")
    .order("code", { ascending: true });
  if (error) throw new Error(error.message);

  const { data: fees, error: fErr } = await supabaseAdmin
    .from("swap_daily_fees")
    .select(
      "client_id, xauusd_price, daily_fee, usd_balance, annual_rate, position_type, created_at, additional_exposure_pct, effective_balance, day_multiplier",
    )
    .eq("fee_date", feeDate);
  if (fErr) throw new Error(fErr.message);
  const byClient = new Map<string, (typeof fees)[number]>();
  for (const f of fees ?? []) byClient.set(f.client_id, f);

  const snapshot = new Date().toUTCString();
  let sent = 0;
  let failed = 0;
  for (const c of clients ?? []) {
    const f = byClient.get(c.id);
    if (!f) continue;
    const xau =
      f.xauusd_price !== null && f.xauusd_price !== undefined ? Number(f.xauusd_price) : null;
    const isShort = (f.position_type ?? "long") === "short";
    const amountLabel = isShort ? "Swap Benefit Credited" : "Swap Fee Charged";
    const absFee = Math.abs(Number(f.daily_fee));
    const sign = isShort ? "+" : "-";
    const bal = Number(f.usd_balance);
    const balStr = `${bal < 0 ? "-" : ""}$${fmtNum(Math.abs(bal))}`;
    const addExp = Number(f.additional_exposure_pct ?? 5);
    const effBal = Math.abs(Number(f.effective_balance ?? bal * (1 + addExp / 100)));
    const mult = Number(f.day_multiplier ?? 1);
    const exposureFactorPct = 100 + addExp;
    const divider = "------------------------------";
    const body =
      `Swap Statement\n` +
      `Client: ${c.code}\n` +
      `Position: ${isShort ? "Short / Sell" : "Long / Buy"}\n` +
      `Snapshot: ${snapshot}\n` +
      `XAUUSD: ${xau !== null ? `$${fmtNum(xau)}` : "—"}\n` +
      `\n${divider}\n\n` +
      `USD Balance: ${balStr}\n` +
      `Additional Exposure: ${fmtNum(addExp)}%\n` +
      `Effective Balance: $${fmtNum(effBal)}\n` +
      `Calculation: $${fmtNum(Math.abs(bal))} × ${fmtNum(exposureFactorPct, 0)}% = $${fmtNum(effBal)}\n` +
      `\n${divider}\n\n` +
      `Annual Rate: ${fmtNum(Number(f.annual_rate))}% p.a.\n` +
      `Day Multiplier: ${mult}×\n` +
      `${amountLabel}: *${sign}$${fmtNum(absFee)}*\n` +
      `\n${divider}\n` +
      `ATHER Desk · Generated automatically`;

    try {
      const res = await fetch("https://connector-gateway.lovable.dev/twilio/Messages.json", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${lovableKey}`,
          "X-Connection-Api-Key": twilioKey,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({ To: to, From: from, Body: body }),
      });
      if (res.ok) sent++;
      else {
        failed++;
        console.error(
          `Twilio send failed for ${c.code}: ${res.status} ${await res.text().catch(() => "")}`,
        );
      }
    } catch (e) {
      failed++;
      console.error(`Twilio send error for ${c.code}:`, e);
    }
  }
  return { sent, failed };
}

export const listSwapMarginHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ client_id: z.string().uuid().optional() }).parse(d ?? {}),
  )
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);
    await assertPermission(context.userId, "audit", "view");
    let q = supabaseAdmin
      .from("swap_margin_history")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.client_id) q = q.eq("client_id", data.client_id);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/* ---------------------- Live XAUUSD price ---------------------- */

async function fetchLiveXau(): Promise<number | null> {
  try {
    const r = await fetch("https://api.gold-api.com/price/XAU", {
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as { price?: number };
    return typeof j.price === "number" ? j.price : null;
  } catch {
    return null;
  }
}

async function lastSnapshot() {
  const { data } = await supabaseAdmin
    .from("swap_xau_snapshots")
    .select("price, source, username, created_at")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

// Returns the current XAU price to use everywhere. Fetches live, saves snapshot,
// falls back to last saved if the API fails.
export const getLiveXauPrice = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);
    const last = await lastSnapshot();
    // If the last snapshot is a manual override less than 30 min old, prefer it.
    if (last && last.source === "manual") {
      const ageMs = Date.now() - new Date(last.created_at).getTime();
      if (ageMs < 30 * 60 * 1000) {
        return {
          price: Number(last.price),
          source: "manual" as const,
          updated_at: last.created_at,
          stale: false,
          warning: null as string | null,
        };
      }
    }
    const live = await fetchLiveXau();
    if (live !== null) {
      const username = await getUsername(context.userId);
      const { data: inserted } = await supabaseAdmin
        .from("swap_xau_snapshots")
        .insert({ price: live, source: "live", created_by: context.userId, username })
        .select("created_at")
        .single();
      return {
        price: live,
        source: "live" as const,
        updated_at: inserted?.created_at ?? new Date().toISOString(),
        stale: false,
        warning: null,
      };
    }
    if (last) {
      return {
        price: Number(last.price),
        source: (last.source as "live" | "manual" | "fallback") ?? "fallback",
        updated_at: last.created_at,
        stale: true,
        warning: "Live price unavailable, using last saved price.",
      };
    }
    return {
      price: 0,
      source: "fallback" as const,
      updated_at: null,
      stale: true,
      warning: "Live price unavailable and no saved price yet.",
    };
  });

export const setManualXauPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ price: z.number().finite().min(0).max(1e6) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles")
      .select("is_admin")
      .eq("id", context.userId)
      .maybeSingle();
    if (!prof?.is_admin) throw new Error("Only admins can override the gold price.");
    const username = await getUsername(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("swap_xau_snapshots")
      .insert({ price: data.price, source: "manual", created_by: context.userId, username })
      .select("price, source, created_at")
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "xau_price_override", null, null, { price: data.price });
    return {
      price: Number(row.price),
      source: "manual" as const,
      updated_at: row.created_at,
      stale: false,
      warning: null as string | null,
    };
  });


// =============================================================================
// Swap Control Center — aggregated stats for the operations dashboard.
// Phase 1: today/MTD totals, charged vs skipped counts, missing-day detection,
// backfill detection, automation + Twilio health.
// =============================================================================
export const getSwapControlCenterStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);

    // All client codes (for missing detection + counts).
    const { data: clients, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select("id, code, position_type, usd_balance");
    if (cErr) throw new Error(cErr.message);
    const totalClients = clients?.length ?? 0;
    const longCount = clients?.filter((c) => (c.position_type ?? "long") === "long").length ?? 0;
    const shortCount = clients?.filter((c) => c.position_type === "short").length ?? 0;

    // Fees since month start.
    const { data: feesMtd, error: fErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("client_id, fee_date, daily_fee, day_multiplier, created_at, position_type")
      .gte("fee_date", monthStart)
      .order("fee_date", { ascending: false });
    if (fErr) throw new Error(fErr.message);

    let mtdTotal = 0;
    let todayTotal = 0;
    let chargedTodayCount = 0;
    let skippedTodayCount = 0;
    let backfilledMtdCount = 0;
    const todayClientIds = new Set<string>();
    let biggestTodayFee = 0;
    let biggestTodayClientId: string | null = null;

    for (const f of feesMtd ?? []) {
      const fee = Number(f.daily_fee);
      mtdTotal += Math.abs(fee);
      // Backfill heuristic: row written more than 1 day after its fee_date.
      const created = new Date(f.created_at);
      const feeDay = new Date(`${f.fee_date}T00:00:00Z`);
      const lagDays = (created.getTime() - feeDay.getTime()) / 86400_000;
      if (lagDays > 1.5) backfilledMtdCount += 1;

      if (f.fee_date === today) {
        todayTotal += Math.abs(fee);
        todayClientIds.add(f.client_id);
        if (fee !== 0) chargedTodayCount += 1;
        else skippedTodayCount += 1;
        if (Math.abs(fee) > biggestTodayFee) {
          biggestTodayFee = Math.abs(fee);
          biggestTodayClientId = f.client_id;
        }
      }
    }
    // Clients with no row today at all = also "skipped/missing" today.
    const missingTodayCount = totalClients - todayClientIds.size;

    // Missing-day warnings: look back 14 days, find weekdays where no
    // snapshot rows exist for any client. (Weekend skip respects settings.)
    const { data: feeSettings } = await supabaseAdmin
      .from("swap_settings")
      .select("wednesday_multiplier, skip_saturday, skip_sunday")
      .eq("id", "global")
      .maybeSingle();
    const past14: { date: string; expected: boolean; rowCount: number }[] = [];
    for (let i = 1; i <= 14; i++) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      const iso = d.toISOString().slice(0, 10);
      const mult = swapDayMultiplierFromSettings(d, feeSettings);
      past14.push({ date: iso, expected: mult > 0, rowCount: 0 });
    }
    const { data: past14Fees } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("fee_date")
      .gte("fee_date", past14[past14.length - 1].date)
      .lte("fee_date", past14[0].date);
    for (const f of past14Fees ?? []) {
      const slot = past14.find((p) => p.date === f.fee_date);
      if (slot) slot.rowCount += 1;
    }
    const missingDays = past14
      .filter((p) => p.expected && p.rowCount === 0)
      .map((p) => p.date);

    // Automation status (reuse existing logic).
    const { data: runs } = await supabaseAdmin
      .from("swap_activity_log")
      .select("created_at, status")
      .eq("module", "system")
      .eq("action", "daily_fees_cron")
      .order("created_at", { ascending: false })
      .limit(1);
    const lastRun = runs?.[0] ?? null;
    const next = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 22, 0, 0),
    );
    if (next.getTime() <= now.getTime()) next.setUTCDate(next.getUTCDate() + 1);

    const biggestClient = biggestTodayClientId
      ? clients?.find((c) => c.id === biggestTodayClientId) ?? null
      : null;

    return {
      today,
      monthStart,
      todayTotal,
      mtdTotal,
      totalClients,
      longCount,
      shortCount,
      chargedTodayCount,
      skippedTodayCount,
      missingTodayCount,
      backfilledMtdCount,
      missingDays,
      biggestTodayFee,
      biggestTodayClient: biggestClient
        ? { id: biggestClient.id, code: biggestClient.code }
        : null,
      automation: {
        lastRunAt: lastRun?.created_at ?? null,
        lastRunStatus: (lastRun?.status as string | null) ?? null,
        nextRunAt: next.toISOString(),
        healthy: lastRun ? lastRun.status === "success" : false,
      },
      twilio: {
        configured: !!process.env.TWILIO_API_KEY && !!process.env.TWILIO_WHATSAPP_FROM,
      },
    };
  });


// ============================================================
// Monthly Client Statement
// ============================================================
const monthRule = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM");

export const getSwapClientMonthlyStatement = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ id: z.string().uuid(), month: monthRule }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);

    const [year, mon] = data.month.split("-").map(Number);
    const monthStart = `${data.month}-01`;
    const nextMonthDate = new Date(Date.UTC(year, mon, 1));
    const monthEnd = nextMonthDate.toISOString().slice(0, 10); // exclusive

    const { data: client, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select(
        "id, code, usd_balance, annual_rate, short_annual_rate, additional_exposure_pct, position_type, notes",
      )
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: monthRows, error: mErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select(
        "id, fee_date, xauusd_price, daily_fee, usd_balance, annual_rate, position_type, additional_exposure_pct, effective_balance, day_multiplier, created_at",
      )
      .eq("client_id", data.id)
      .gte("fee_date", monthStart)
      .lt("fee_date", monthEnd)
      .order("fee_date", { ascending: true });
    if (mErr) throw new Error(mErr.message);

    // Opening balance = usd_balance of the most recent row BEFORE this month
    const { data: priorRow } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("usd_balance")
      .eq("client_id", data.id)
      .lt("fee_date", monthStart)
      .order("fee_date", { ascending: false })
      .limit(1)
      .maybeSingle();

    const firstInMonth = monthRows?.[0];
    const lastInMonth = monthRows?.[monthRows.length - 1];
    const opening_balance = priorRow
      ? Number(priorRow.usd_balance)
      : firstInMonth
        ? Number(firstInMonth.usd_balance)
        : Number(client.usd_balance);
    const closing_balance = lastInMonth
      ? Number(lastInMonth.usd_balance)
      : Number(client.usd_balance);

    let total_fee = 0;
    let charged_days = 0;
    let skipped_days = 0;
    let weekend_days = 0;
    let backfilled_days = 0;
    const manual_days = 0; // Phase 4 will track this explicitly

    const rows = (monthRows ?? []).map((f) => {
      const fee = Number(f.daily_fee);
      const mult = Number(f.day_multiplier ?? 1);
      const created = new Date(f.created_at);
      const feeDay = new Date(`${f.fee_date}T00:00:00Z`);
      const lagDays = (created.getTime() - feeDay.getTime()) / 86400_000;
      const isBackfilled = lagDays > 1.5;
      const isWeekend = mult === 0;
      const isCharged = fee !== 0;
      total_fee += fee;
      if (isWeekend) weekend_days += 1;
      else if (isBackfilled) backfilled_days += 1;
      if (isCharged) charged_days += 1;
      else if (!isWeekend) skipped_days += 1;
      return {
        id: f.id,
        fee_date: f.fee_date,
        usd_balance: Number(f.usd_balance),
        effective_balance:
          f.effective_balance !== null && f.effective_balance !== undefined
            ? Number(f.effective_balance)
            : Number(f.usd_balance) *
              (1 + Number(f.additional_exposure_pct ?? 5) / 100),
        annual_rate: Number(f.annual_rate),
        additional_exposure_pct: Number(f.additional_exposure_pct ?? 5),
        day_multiplier: mult,
        daily_fee: fee,
        xauusd_price: f.xauusd_price !== null ? Number(f.xauusd_price) : null,
        position_type: (f.position_type ?? "long") as "long" | "short",
        created_at: f.created_at,
        is_backfilled: isBackfilled,
        is_weekend: isWeekend,
        is_charged: isCharged,
      };
    });

    return {
      client: {
        id: client.id,
        code: client.code,
        notes: client.notes ?? null,
        position_type: (client.position_type ?? "long") as "long" | "short",
        annual_rate: Number(client.annual_rate),
        short_annual_rate: Number(client.short_annual_rate ?? 0),
      },
      month: data.month,
      opening_balance,
      closing_balance,
      totals: {
        total_fee,
        charged_days,
        skipped_days,
        weekend_days,
        backfilled_days,
        manual_days,
      },
      rows,
    };
  });


// ============================================================
// Backfill preview & approval workflow (admin)
// ============================================================
const dateRule = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");

async function assertSwapAdmin(userId: string): Promise<void> {
  const { data: prof } = await supabaseAdmin
    .from("swap_profiles")
    .select("is_admin")
    .eq("id", userId)
    .maybeSingle();
  if (!prof?.is_admin) throw new Error("Admin only.");
}

type BackfillItem = {
  client_id: string;
  client_code: string;
  position_type: "long" | "short";
  fee_date: string;
  day_multiplier: number;
  usd_balance: number;
  annual_rate: number;
  additional_exposure_pct: number;
  effective_balance: number;
  expected_fee: number;
};

export const previewSwapBackfill = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        start_date: dateRule,
        end_date: dateRule,
        client_id: z.string().uuid().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);

    const { data: feeSettings } = await supabaseAdmin
      .from("swap_settings")
      .select("wednesday_multiplier, skip_saturday, skip_sunday")
      .eq("id", "global")
      .maybeSingle();

    let cq = supabaseAdmin
      .from("swap_clients")
      .select(
        "id, code, usd_balance, annual_rate, short_annual_rate, additional_exposure_pct, position_type",
      );
    if (data.client_id) cq = cq.eq("id", data.client_id);
    const { data: clients, error: cErr } = await cq;
    if (cErr) throw new Error(cErr.message);

    const clientIds = (clients ?? []).map((c) => c.id);
    const { data: existing, error: eErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("client_id, fee_date")
      .in("client_id", clientIds.length ? clientIds : ["00000000-0000-0000-0000-000000000000"])
      .gte("fee_date", data.start_date)
      .lte("fee_date", data.end_date);
    if (eErr) throw new Error(eErr.message);
    const existingSet = new Set(
      (existing ?? []).map((r) => `${r.client_id}|${r.fee_date}`),
    );

    // Enumerate the date range
    const dates: string[] = [];
    const start = new Date(`${data.start_date}T00:00:00Z`);
    const end = new Date(`${data.end_date}T00:00:00Z`);
    if (end.getTime() < start.getTime()) throw new Error("end_date is before start_date");
    if ((end.getTime() - start.getTime()) / 86400_000 > 92) {
      throw new Error("Range too large (max 92 days)");
    }
    for (let d = new Date(start); d.getTime() <= end.getTime(); d.setUTCDate(d.getUTCDate() + 1)) {
      dates.push(d.toISOString().slice(0, 10));
    }

    const items: BackfillItem[] = [];
    let weekend_skipped = 0;
    for (const c of clients ?? []) {
      const positionType = (c.position_type ?? "long") as "long" | "short";
      const effRate =
        positionType === "short"
          ? Number(c.short_annual_rate ?? 0)
          : Number(c.annual_rate);
      const addExp = Number(c.additional_exposure_pct ?? 5);
      const effBal = effectiveBalance(Number(c.usd_balance), addExp);
      for (const d of dates) {
        if (existingSet.has(`${c.id}|${d}`)) continue;
        const mult = swapDayMultiplierFromSettings(
          new Date(`${d}T00:00:00Z`),
          feeSettings,
        );
        if (mult === 0) {
          weekend_skipped += 1;
          continue;
        }
        const expected = (Math.abs(effBal) * effRate) / 100 / 365 * mult;
        items.push({
          client_id: c.id,
          client_code: c.code,
          position_type: positionType,
          fee_date: d,
          day_multiplier: mult,
          usd_balance: Number(c.usd_balance),
          annual_rate: effRate,
          additional_exposure_pct: addExp,
          effective_balance: effBal,
          expected_fee: expected,
        });
      }
    }

    items.sort((a, b) =>
      a.fee_date === b.fee_date
        ? a.client_code.localeCompare(b.client_code)
        : a.fee_date.localeCompare(b.fee_date),
    );

    return {
      summary: {
        clients_scanned: (clients ?? []).length,
        days_in_range: dates.length,
        missing_count: items.length,
        weekend_skipped,
        total_expected: items.reduce((s, x) => s + x.expected_fee, 0),
      },
      items,
    };
  });

export const applySwapBackfill = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        items: z
          .array(
            z.object({
              client_id: z.string().uuid(),
              fee_date: dateRule,
            }),
          )
          .min(1)
          .max(2000),
        reason: z.string().trim().min(1).max(500),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapAdmin(context.userId);

    const { data: feeSettings } = await supabaseAdmin
      .from("swap_settings")
      .select("wednesday_multiplier, skip_saturday, skip_sunday")
      .eq("id", "global")
      .maybeSingle();

    const clientIds = [...new Set(data.items.map((i) => i.client_id))];
    const { data: clients, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select(
        "id, code, usd_balance, annual_rate, short_annual_rate, additional_exposure_pct, position_type",
      )
      .in("id", clientIds);
    if (cErr) throw new Error(cErr.message);
    const byId = new Map((clients ?? []).map((c) => [c.id, c]));

    // Re-check what already exists so the apply step stays idempotent.
    const dates = [...new Set(data.items.map((i) => i.fee_date))];
    const { data: existing } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("client_id, fee_date")
      .in("client_id", clientIds)
      .in("fee_date", dates);
    const existingSet = new Set(
      (existing ?? []).map((r) => `${r.client_id}|${r.fee_date}`),
    );

    // Locked dates can never be backfilled — they're append-blocked.
    const lockedDates = await loadLockedDates(dates);

    const nowIso = new Date().toISOString();
    const rows: Array<{
      client_id: string;
      fee_date: string;
      xauusd_price: number | null;
      usd_balance: number;
      annual_rate: number;
      additional_exposure_pct: number;
      effective_balance: number;
      day_multiplier: number;
      position_type: "long" | "short";
      daily_fee: number;
      created_at: string;
    }> = [];

    let skipped_existing = 0;
    let skipped_weekend = 0;
    let skipped_no_client = 0;
    let skipped_locked = 0;

    for (const it of data.items) {
      if (lockedDates.has(it.fee_date)) {
        skipped_locked += 1;
        continue;
      }
      if (existingSet.has(`${it.client_id}|${it.fee_date}`)) {
        skipped_existing += 1;
        continue;
      }
      const c = byId.get(it.client_id);
      if (!c) {
        skipped_no_client += 1;
        continue;
      }
      const positionType = (c.position_type ?? "long") as "long" | "short";
      const effRate =
        positionType === "short"
          ? Number(c.short_annual_rate ?? 0)
          : Number(c.annual_rate);
      const addExp = Number(c.additional_exposure_pct ?? 5);
      const effBal = effectiveBalance(Number(c.usd_balance), addExp);
      const mult = swapDayMultiplierFromSettings(
        new Date(`${it.fee_date}T00:00:00Z`),
        feeSettings,
      );
      if (mult === 0) {
        skipped_weekend += 1;
        continue;
      }
      const fee = (Math.abs(effBal) * effRate) / 100 / 365 * mult;
      rows.push({
        client_id: c.id,
        fee_date: it.fee_date,
        xauusd_price: null,
        usd_balance: Number(c.usd_balance),
        annual_rate: effRate,
        additional_exposure_pct: addExp,
        effective_balance: effBal,
        day_multiplier: mult,
        position_type: positionType,
        daily_fee: fee,
        created_at: nowIso,
      });
    }

    let inserted = 0;
    if (rows.length > 0) {
      const { error: iErr, count } = await supabaseAdmin
        .from("swap_daily_fees")
        .upsert(rows, { onConflict: "client_id,fee_date", ignoreDuplicates: true, count: "exact" });
      if (iErr) throw new Error(iErr.message);
      inserted = count ?? rows.length;
    }

    const result = {
      requested: data.items.length,
      inserted,
      skipped_existing,
      skipped_weekend,
      skipped_no_client,
      skipped_locked,
      total_amount: rows.reduce((s, r) => s + r.daily_fee, 0),
    };
    await logActivity(context.userId, "fees_backfilled", null, null, {
      ...result,
      reason: data.reason,
    });
    return result;
  });

