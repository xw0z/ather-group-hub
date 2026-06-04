import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeMargin, assertSwapUser } from "@/lib/swap-clients.functions";

const dateStr = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

async function getUsername(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("swap_profiles")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  return data?.username ?? "unknown";
}

/** Client swap-fee report aggregated over a date range. */
export const getSwapFeeReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        clientId: z.string().uuid(),
        from: dateStr,
        to: dateStr,
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertSwapUser(context.userId);
    const { data: client, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select(
        "id, code, notes, usd_balance, annual_rate, short_annual_rate, position_type",
      )
      .eq("id", data.clientId)
      .maybeSingle();
    if (cErr) throw new Error(cErr.message);
    if (!client) throw new Error("Client not found");

    const { data: fees, error: fErr } = await supabaseAdmin
      .from("swap_daily_fees")
      .select(
        "id, fee_date, xauusd_price, daily_fee, usd_balance, annual_rate, position_type, created_at",
      )
      .eq("client_id", data.clientId)
      .gte("fee_date", data.from)
      .lte("fee_date", data.to)
      .order("fee_date", { ascending: true });
    if (fErr) throw new Error(fErr.message);

    const rows = (fees ?? []).map((f) => {
      const dt = new Date(`${f.fee_date}T00:00:00Z`);
      const isWed = dt.getUTCDay() === 3;
      const ptype = (f.position_type ?? "long") as "long" | "short";
      return {
        id: f.id,
        fee_date: f.fee_date,
        xauusd_price: f.xauusd_price !== null ? Number(f.xauusd_price) : null,
        daily_fee: Number(f.daily_fee),
        usd_balance: Number(f.usd_balance),
        annual_rate: Number(f.annual_rate),
        position_type: ptype,
        is_wednesday: isWed,
        created_at: f.created_at,
      };
    });

    let totalFeesCharged = 0;
    let totalCredits = 0;
    let wednesdayTotal = 0;
    for (const r of rows) {
      if (r.position_type === "short") totalCredits += r.daily_fee;
      else totalFeesCharged += r.daily_fee;
      if (r.is_wednesday) wednesdayTotal += r.daily_fee;
    }
    const openingBalance = rows.length > 0 ? rows[0].usd_balance : Number(client.usd_balance);
    const closingBalance =
      rows.length > 0 ? rows[rows.length - 1].usd_balance : Number(client.usd_balance);

    return {
      client: {
        id: client.id,
        code: client.code,
        notes: client.notes ?? null,
        position_type: (client.position_type ?? "long") as "long" | "short",
        annual_rate: Number(client.annual_rate),
        short_annual_rate: Number(client.short_annual_rate ?? 0),
        current_usd_balance: Number(client.usd_balance),
      },
      range: { from: data.from, to: data.to },
      rows,
      totals: {
        openingBalance,
        closingBalance,
        totalFeesCharged,
        totalCredits,
        wednesdayTotal,
        netSwapResult: totalCredits - totalFeesCharged,
        count: rows.length,
      },
    };
  });

/** Management portfolio summary. */
export const getPortfolioReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);
    const { data: clients, error: cErr } = await supabaseAdmin
      .from("swap_clients")
      .select(
        "id, code, usd_balance, gold_kg, xauusd_price, margin_requirement_pct",
      );
    if (cErr) throw new Error(cErr.message);

    const today = new Date().toISOString().slice(0, 10);
    const monthStart = today.slice(0, 7) + "-01";

    const [{ data: todayFees }, { data: mtdFees }] = await Promise.all([
      supabaseAdmin
        .from("swap_daily_fees")
        .select("daily_fee, position_type")
        .eq("fee_date", today),
      supabaseAdmin
        .from("swap_daily_fees")
        .select("daily_fee, position_type")
        .gte("fee_date", monthStart)
        .lte("fee_date", today),
    ]);

    let totalGoldKg = 0;
    let totalGoldValue = 0;
    let totalEquity = 0;
    let totalRequired = 0;
    let totalShortage = 0;
    let safeCount = 0;
    let warningCount = 0;
    let neededCount = 0;
    let criticalCount = 0;
    let totalUsd = 0;

    for (const c of clients ?? []) {
      const xau = c.xauusd_price !== null ? Number(c.xauusd_price) : 0;
      const m = computeMargin({
        usd_balance: Number(c.usd_balance),
        gold_kg: Number(c.gold_kg ?? 0),
        xauusd_price: xau,
        margin_requirement_pct: Number(c.margin_requirement_pct ?? 20),
      });
      totalUsd += Number(c.usd_balance);
      totalGoldKg += Number(c.gold_kg ?? 0);
      totalGoldValue += m.goldValue;
      totalEquity += m.equity;
      totalRequired += m.requiredMargin;
      if (m.status === "needed") totalShortage += Math.abs(m.difference);
      if (m.tier === "safe") safeCount++;
      else if (m.tier === "warning") warningCount++;
      else if (m.tier === "needed") neededCount++;
      else if (m.tier === "critical") criticalCount++;
    }

    const sumFees = (rows: { daily_fee: number; position_type: string | null }[] | null) => {
      let charged = 0;
      let credited = 0;
      for (const r of rows ?? []) {
        if ((r.position_type ?? "long") === "short") credited += Number(r.daily_fee);
        else charged += Number(r.daily_fee);
      }
      return { charged, credited, net: charged - credited };
    };

    return {
      clientCount: clients?.length ?? 0,
      totals: {
        totalUsd,
        totalGoldKg,
        totalGoldValue,
        totalEquity,
        totalRequired,
        totalShortage,
        safeCount,
        warningCount,
        neededCount,
        criticalCount,
      },
      swapToday: sumFees(todayFees),
      swapMonthToDate: sumFees(mtdFees),
      asOf: new Date().toISOString(),
    };
  });

export const logReportGeneration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        report_type: z.enum(["margin", "swap_fee", "combined", "portfolio"]),
        client_id: z.string().uuid().nullable().optional(),
        client_code: z.string().max(64).nullable().optional(),
        format: z.enum(["PNG", "PDF"]),
        channel: z.enum(["download", "whatsapp", "copy"]),
        details: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ context, data }) => {
    await assertSwapUser(context.userId);
    const username = await getUsername(context.userId);
    const { error } = await supabaseAdmin.from("swap_report_history").insert({
      report_type: data.report_type,
      client_id: data.client_id ?? null,
      client_code: data.client_code ?? null,
      format: data.format,
      channel: data.channel,
      generated_by: context.userId,
      generated_by_username: username,
      details: (data.details ?? null) as never,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listReportHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertSwapUser(context.userId);
    const { data, error } = await supabaseAdmin
      .from("swap_report_history")
      .select(
        "id, report_type, client_id, client_code, format, channel, generated_by_username, details, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
