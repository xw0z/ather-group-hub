import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const codeRule = z.string().trim().min(1).max(64).regex(/^[A-Za-z0-9_.\- ]+$/, "Letters, numbers, . _ - space only");

async function getUsername(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("swap_profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return data?.username ?? "unknown";
}

type Json = string | number | boolean | null | { [k: string]: Json } | Json[];

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
  .handler(async () => {
    const { data, error } = await supabaseAdmin
      .from("swap_clients")
      .select("id, code, usd_balance, annual_rate, notes, created_by, created_at, updated_at")
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
        usd_balance: z.number().finite().min(0).max(1e12),
        annual_rate: z.number().finite().min(0).max(100).optional(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("swap_clients")
      .insert({
        code: data.code.trim(),
        usd_balance: data.usd_balance,
        annual_rate: data.annual_rate ?? 5.4,
        notes: data.notes ?? null,
        created_by: context.userId,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "client_created", "client", row.id, {
      code: row.code,
      usd_balance: row.usd_balance,
      annual_rate: row.annual_rate,
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
        usd_balance: z.number().finite().min(0).max(1e12).optional(),
        annual_rate: z.number().finite().min(0).max(100).optional(),
        notes: z.string().max(2000).optional().nullable(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: {
      code?: string;
      usd_balance?: number;
      annual_rate?: number;
      notes?: string | null;
    } = {};
    if (data.code !== undefined) patch.code = data.code.trim();
    if (data.usd_balance !== undefined) patch.usd_balance = data.usd_balance;
    if (data.annual_rate !== undefined) patch.annual_rate = data.annual_rate;
    if (data.notes !== undefined) patch.notes = data.notes;
    const { data: row, error } = await supabaseAdmin
      .from("swap_clients")
      .update(patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await logActivity(context.userId, "client_updated", "client", row.id, patch as Record<string, Json>);
    return row;
  });

export const deleteSwapClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
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
  .handler(async () => {
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
  .handler(async () => {
    const today = new Date().toISOString().slice(0, 10);
    // most recent fee row per client (today preferred, else latest)
    const { data: clients, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select("id, code, usd_balance, annual_rate, notes")
      .order("code");
    if (cErr) throw new Error(cErr.message);

    const { data: fees, error: fErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("client_id, fee_date, xauusd_price, daily_fee, usd_balance, annual_rate")
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

    return {
      today,
      lastXauPrice,
      lastXauDate,
      rows: (clients ?? []).map((c) => {
        const t = todayByClient.get(c.id);
        const l = latestByClient.get(c.id);
        const liveDaily = (Number(c.usd_balance) * Number(c.annual_rate)) / 100 / 365;
        return {
          id: c.id,
          code: c.code,
          notes: c.notes ?? null,
          usd_balance: Number(c.usd_balance),
          annual_rate: Number(c.annual_rate),
          today_fee: t ? Number(t.daily_fee) : null,
          today_xauusd: t?.xauusd_price ? Number(t.xauusd_price) : null,
          last_fee: l ? Number(l.daily_fee) : null,
          last_fee_date: l?.fee_date ?? null,
          live_daily_fee: liveDaily,
        };
      }),
    };
  });

export const getSwapClientHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { data: client, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select("id, code, usd_balance, annual_rate, notes, created_at")
      .eq("id", data.id)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: fees, error: fErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select("id, fee_date, xauusd_price, daily_fee, usd_balance, annual_rate, created_at")
      .eq("client_id", data.id)
      .order("fee_date", { ascending: false })
      .limit(365);
    if (fErr) throw new Error(fErr.message);

    return {
      client: {
        id: client.id,
        code: client.code,
        notes: client.notes ?? null,
        usd_balance: Number(client.usd_balance),
        annual_rate: Number(client.annual_rate),
      },
      fees: (fees ?? []).map((f) => ({
        id: f.id,
        fee_date: f.fee_date,
        xauusd_price: f.xauusd_price !== null ? Number(f.xauusd_price) : null,
        daily_fee: Number(f.daily_fee),
        usd_balance: Number(f.usd_balance),
        annual_rate: Number(f.annual_rate),
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
    .select("id, usd_balance, annual_rate");
  if (error) throw new Error(error.message);

  const rows = (clients ?? []).map((c) => ({
    client_id: c.id,
    fee_date: today,
    xauusd_price: xauusd,
    usd_balance: Number(c.usd_balance),
    annual_rate: Number(c.annual_rate),
    daily_fee: (Number(c.usd_balance) * Number(c.annual_rate)) / 100 / 365,
  }));

  if (rows.length > 0) {
    const { error: upErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .upsert(rows, { onConflict: "client_id,fee_date" });
    if (upErr) throw new Error(upErr.message);
  }

  // Send one WhatsApp message per client to the admin number (best-effort).
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
  // Strip spaces, dashes, parens from the raw number, keep leading +
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
    .select("client_id, xauusd_price, daily_fee, usd_balance, annual_rate, created_at")
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
    const body =
      `Swap Statement — ${feeDate}\n` +
      `Client: ${c.code}${c.notes ? ` (${c.notes})` : ""}\n` +
      `Snapshot: ${snapshot}` +
      (xau !== null ? ` · XAUUSD $${fmtNum(xau)}` : "") +
      `\n\n` +
      `Balance: $${fmtNum(Number(f.usd_balance))}\n` +
      `Rate: ${fmtNum(Number(f.annual_rate))}% p.a.\n` +
      `Swap fee: -$${fmtNum(Number(f.daily_fee))}`;

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
