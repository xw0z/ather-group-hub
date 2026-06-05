import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const codeRule = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.\- ]+$/, "Letters, numbers, . _ - space only");
const positionTypeRule = z.enum(["long", "short"]);

// 1 kg gold = 32.1507466 troy ounces
export const TROY_OZ_PER_KG = 32.1507466;

export function computeMargin(input: {
  usd_balance: number;
  gold_kg: number;
  xauusd_price: number | null;
  margin_requirement_pct: number;
}) {
  const xau = Number(input.xauusd_price ?? 0);
  const usdBalance = Number(input.usd_balance);
  const goldValue = Number(input.gold_kg) * TROY_OZ_PER_KG * xau;
  // Equity = USD balance + gold value (can be negative)
  const equity = usdBalance + goldValue;
  // Total exposure is the gold position value only
  const totalExposure = goldValue;
  const requiredMargin = (totalExposure * Number(input.margin_requirement_pct)) / 100;
  // Available margin is based on equity, not raw USD balance
  const availableMargin = equity;
  const difference = availableMargin - requiredMargin;
  const marginLevelPct = requiredMargin > 0 ? (equity / requiredMargin) * 100 : 0;
  const status: "enough" | "needed" = difference >= 0 ? "enough" : "needed";
  // Tiered status: critical if equity < 0, needed if equity < required,
  // warning if 100-120%, safe if >=120% or no exposure.
  let tier: "safe" | "warning" | "needed" | "critical";
  if (requiredMargin <= 0) tier = equity < 0 ? "critical" : "safe";
  else if (equity < 0) tier = "critical";
  else if (marginLevelPct >= 120) tier = "safe";
  else if (marginLevelPct >= 100) tier = "warning";
  else tier = "needed";
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

// Forex/CFD swap rollover multipliers by weekday (UTC).
// Sun=0, Mon=1, Tue=2, Wed=3, Thu=4, Fri=5, Sat=6.
// Wednesday charges 3 days to cover the weekend; Sat/Sun = 0.
const SWAP_DAY_MULTIPLIERS = [0, 1, 1, 3, 1, 1, 0] as const;
export function swapDayMultiplier(date: Date = new Date()): number {
  return SWAP_DAY_MULTIPLIERS[date.getUTCDay()];
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

async function logActivity(
  userId: string,
  action: string,
  entity_type: string | null,
  entity_id: string | null,
  details: Record<string, Json> | null,
) {
  const username = await getUsername(userId);
  await supabaseAdmin.from("swap_activity_log").insert({
    user_id: userId,
    username,
    action,
    entity_type,
    entity_id,
    details: details as Json,
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

    await logActivity(context.userId, "client_updated", "client", row.id, patch as Record<string, Json>);
    return row;
  });

export const deleteSwapClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);
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
    const { data, error } = await supabaseAdmin
      .from("swap_activity_log")
      .select("id, user_id, username, action, entity_type, entity_id, details, created_at")
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

    const todayMultiplier = swapDayMultiplier(new Date());
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
        const baseDaily = (effBal * effRate) / 100 / 365;
        const liveDaily = baseDaily * todayMultiplier;

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

  const today = new Date().toISOString().slice(0, 10);
  const { data: clients, error } = await supabaseAdmin
    .from("swap_clients")
    .select("id, usd_balance, annual_rate, short_annual_rate, additional_exposure_pct, position_type");
  if (error) throw new Error(error.message);

  const nowIso = new Date().toISOString();

  // Determine which dates to write. Default: just today.
  // Backfill: for each client, fill any missing weekdays since their last
  // snapshot up to today. Sat/Sun naturally skip (multiplier 0).
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
    position_type: "long" | "short";
    daily_fee: number;
    created_at: string;
  }> = [];

  for (const c of clients ?? []) {
    const positionType = (c.position_type ?? "long") as "long" | "short";
    const effRate = effectiveAnnualRate(c);
    const effBal = effectiveBalance(Number(c.usd_balance), c.additional_exposure_pct);
    const last = lastDateByClient.get(c.id) ?? null;
    const dates = last === today ? [today] : datesBetween(last, today);
    for (const d of dates) {
      const mult = swapDayMultiplier(new Date(`${d}T00:00:00Z`));
      rows.push({
        client_id: c.id,
        fee_date: d,
        // Only stamp live XAU on today's snapshot; backfilled rows leave it null.
        xauusd_price: d === today ? xauusd : null,
        usd_balance: Number(c.usd_balance),
        annual_rate: effRate,
        position_type: positionType,
        daily_fee: ((effBal * effRate) / 100 / 365) * mult,
        created_at: nowIso,
      });
    }
  }

  if (rows.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .upsert(rows, { onConflict: "client_id,fee_date" });
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
    .select("client_id, xauusd_price, daily_fee, usd_balance, annual_rate, position_type, created_at")
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
    const amountLabel = isShort ? "Swap benefit credited" : "Swap fee";
    const absFee = Math.abs(Number(f.daily_fee));
    const dt = new Date(`${feeDate}T00:00:00Z`);
    const isWed = dt.getUTCDay() === 3;
    const baseFee = isWed ? absFee / 3 : absFee;
    const sign = isShort ? "+" : "-";
    const amountFmt = `*${sign}$${fmtNum(baseFee)}*`;
    const wedLine = isWed
      ? `\nWednesday 3× applied: *${sign}$${fmtNum(absFee)}* charged`
      : "";
    const bal = Number(f.usd_balance);
    const balStr = `${bal < 0 ? "-" : ""}$${fmtNum(Math.abs(bal))}`;
    const body =
      `Swap Statement — ${feeDate}\n` +
      `Client: ${c.code}\n` +
      `Position: ${isShort ? "Short / Sell" : "Long / Buy"}\n` +
      `Snapshot: ${snapshot}` +
      (xau !== null ? ` · XAUUSD $${fmtNum(xau)}` : "") +
      `\n\n` +
      `Balance: ${balStr}\n` +
      `Rate: ${fmtNum(Number(f.annual_rate))}% p.a.\n` +
      `${amountLabel}: ${amountFmt}${wedLine}`;

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

