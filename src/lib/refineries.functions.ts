import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =========================================================
// Types
// =========================================================
export type RefineryRole = "manager" | "staff" | "viewer";
export type RefineryDirection = "receiving" | "delivery";
export type RefineryTxType = "da" | "gold";
export type RefineryTxStatus = "draft" | "pending" | "settled" | "cancelled";
export type RefineryBarType = "bar" | "scrap";

export type Refinery = { id: string; name: string; status: string };
export type RefineryAssignment = {
  isAdmin: boolean;
  refineryId: string | null;
  role: RefineryRole | null;
};
export type RefineryClient = {
  id: string;
  refinery_id: string;
  name: string;
  phone: string | null;
  purity_balance: number;
  da_balance: number;
  refining_fee_price: number;
  notes: string | null;
  status: string;
};
export type RefineryGoldBar = {
  id?: string;
  item_number: string | null;
  item_type: RefineryBarType;
  gross_weight: number;
  purity: number;
  pure_weight: number;
};
export type RefineryTransaction = {
  id: string;
  refinery_id: string;
  client_id: string;
  client_name?: string;
  client_phone?: string | null;
  transaction_number: string;
  direction: RefineryDirection;
  transaction_type: RefineryTxType;
  transaction_date: string;
  total_gross_weight: number;
  total_pure_weight: number;
  average_purity: number;
  da_amount: number;
  fee_price: number;
  total_refining_fee: number;
  previous_purity_balance: number | null;
  new_purity_balance: number | null;
  previous_da_balance: number | null;
  new_da_balance: number | null;
  previous_gold_stock: number | null;
  new_gold_stock: number | null;
  previous_da_stock: number | null;
  new_da_stock: number | null;
  status: RefineryTxStatus;
  notes: string | null;
  settled_at: string | null;
  created_at: string;
  bars?: RefineryGoldBar[];
};

// =========================================================
// Helpers
// =========================================================
async function loadAssignment(uid: string): Promise<RefineryAssignment> {
  const { data: prof } = await supabaseAdmin
    .from("swap_profiles")
    .select("is_admin")
    .eq("id", uid)
    .maybeSingle();
  const isAdmin = Boolean(prof?.is_admin);
  const { data: row } = await supabaseAdmin
    .from("refinery_users")
    .select("refinery_id, role")
    .eq("user_id", uid)
    .maybeSingle();
  return {
    isAdmin,
    refineryId: row?.refinery_id ?? null,
    role: (row?.role as RefineryRole | undefined) ?? null,
  };
}

async function assertAccess(uid: string, refineryId: string) {
  const a = await loadAssignment(uid);
  if (a.isAdmin) return a;
  if (a.refineryId !== refineryId) throw new Error("Forbidden: refinery access denied.");
  return a;
}

async function assertAdmin(uid: string) {
  const a = await loadAssignment(uid);
  if (!a.isAdmin) throw new Error("Admin only.");
  return a;
}

// =========================================================
// Assignment + refineries
// =========================================================
export const getMyRefineryAssignment = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => loadAssignment(context.userId));

export const listRefineries = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Refinery[]> => {
    const a = await loadAssignment(context.userId);
    let q = supabaseAdmin.from("refineries").select("id, name, status").order("name");
    if (!a.isAdmin && a.refineryId) q = q.eq("id", a.refineryId);
    if (!a.isAdmin && !a.refineryId) return [];
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Refinery[];
  });

// =========================================================
// Clients
// =========================================================
const clientCreate = z.object({
  refinery_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  phone: z.string().trim().max(64).optional().nullable(),
  purity_balance: z.number().default(0),
  da_balance: z.number().default(0),
  refining_fee_price: z.number().min(0).default(0),
  notes: z.string().max(2000).optional().nullable(),
  status: z.enum(["active", "inactive"]).default("active"),
});

export const listClients = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_clients")
      .select("*")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return rows as RefineryClient[];
  });

export const getClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error } = await supabaseAdmin
      .from("refinery_clients").select("*").eq("id", data.id).single();
    if (error) throw new Error(error.message);
    await assertAccess(context.userId, row.refinery_id);
    return row as RefineryClient;
  });

export const createClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => clientCreate.parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refinery_id);
    const { data: row, error } = await supabaseAdmin
      .from("refinery_clients").insert(data).select("*").single();
    if (error) throw new Error(error.message);
    return row as RefineryClient;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200).optional(),
      phone: z.string().trim().max(64).optional().nullable(),
      refining_fee_price: z.number().min(0).optional(),
      notes: z.string().max(2000).optional().nullable(),
      status: z.enum(["active", "inactive"]).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await supabaseAdmin
      .from("refinery_clients").select("refinery_id").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    await assertAccess(context.userId, existing.refinery_id);
    const { id, ...patch } = data;
    const { data: row, error } = await supabaseAdmin
      .from("refinery_clients").update(patch).eq("id", id).select("*").single();
    if (error) throw new Error(error.message);
    return row as RefineryClient;
  });

export const deleteClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await supabaseAdmin
      .from("refinery_clients").select("refinery_id").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    await assertAccess(context.userId, existing.refinery_id);
    const { count } = await supabaseAdmin
      .from("refinery_transactions")
      .select("id", { count: "exact", head: true })
      .eq("client_id", data.id);
    if ((count ?? 0) > 0) {
      throw new Error("Cannot delete: client has transactions. Delete those transactions first.");
    }
    const { error } = await supabaseAdmin.from("refinery_clients").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Transactions
// =========================================================
const barSchema = z.object({
  item_number: z.string().trim().max(64).optional().nullable(),
  item_type: z.enum(["bar", "scrap"]).default("bar"),
  gross_weight: z.number().positive(),
  purity: z.number().positive().max(1000),
});

const txCreate = z.object({
  refinery_id: z.string().uuid(),
  client_id: z.string().uuid(),
  direction: z.enum(["receiving", "delivery"]),
  transaction_type: z.enum(["da", "gold"]),
  transaction_date: z.string(),
  notes: z.string().max(2000).optional().nullable(),
  da_amount: z.number().min(0).optional(),
  fee_price: z.number().min(0).optional(),
  bars: z.array(barSchema).optional(),
});

async function nextTxNumber(refineryId: string, refName: string): Promise<string> {
  const prefix = refName.replace(/[^A-Za-z0-9]/g, "").toUpperCase().slice(0, 6) || "REF";
  const { count } = await supabaseAdmin
    .from("refinery_transactions")
    .select("id", { count: "exact", head: true })
    .eq("refinery_id", refineryId);
  const n = (count ?? 0) + 1;
  const now = new Date();
  const ymd = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  return `${prefix}-${ymd}-${String(n).padStart(4, "0")}`;
}

export const listTransactions = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_transactions")
      .select("*, client:refinery_clients(name, phone)")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const { client, ...rest } = r as typeof r & { client?: { name: string; phone: string | null } };
      return {
        ...rest,
        client_name: client?.name ?? "",
        client_phone: client?.phone ?? null,
      } as RefineryTransaction;
    });
  });

export const getTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tx, error } = await supabaseAdmin
      .from("refinery_transactions")
      .select("*, client:refinery_clients(name, phone)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    await assertAccess(context.userId, (tx as { refinery_id: string }).refinery_id);
    const { data: bars } = await supabaseAdmin
      .from("refinery_transaction_gold_bars")
      .select("*").eq("transaction_id", data.id).order("created_at");
    const { client, ...rest } = tx as typeof tx & { client?: { name: string; phone: string | null } };
    return {
      ...rest,
      client_name: client?.name ?? "",
      client_phone: client?.phone ?? null,
      bars: (bars ?? []) as RefineryGoldBar[],
    } as RefineryTransaction;
  });

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => txCreate.parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refinery_id);

    // Compute totals
    let total_gross = 0, total_pure = 0, avg_purity = 0, fee = 0;
    const bars = (data.bars ?? []).map((b) => {
      const pure = (b.gross_weight * b.purity) / 1000;
      total_gross += b.gross_weight;
      total_pure += pure;
      return { ...b, pure_weight: pure };
    });
    if (total_gross > 0) avg_purity = (total_pure / total_gross) * 1000;
    if (data.transaction_type === "gold") {
      if (bars.length === 0) throw new Error("At least one gold bar is required.");
      if (data.direction === "receiving") {
        fee = total_gross * (data.fee_price ?? 0);
      }
    } else {
      if (!data.da_amount || data.da_amount <= 0) throw new Error("DA amount must be greater than 0.");
    }

    // Refinery name for tx number
    const { data: ref } = await supabaseAdmin
      .from("refineries").select("name").eq("id", data.refinery_id).single();
    const tnum = await nextTxNumber(data.refinery_id, ref?.name ?? "REF");

    const { data: tx, error } = await supabaseAdmin
      .from("refinery_transactions").insert({
        refinery_id: data.refinery_id,
        client_id: data.client_id,
        transaction_number: tnum,
        direction: data.direction,
        transaction_type: data.transaction_type,
        transaction_date: data.transaction_date,
        notes: data.notes ?? null,
        da_amount: data.transaction_type === "da" ? data.da_amount ?? 0 : 0,
        fee_price: data.transaction_type === "gold" && data.direction === "receiving" ? data.fee_price ?? 0 : 0,
        total_gross_weight: total_gross,
        total_pure_weight: total_pure,
        average_purity: avg_purity,
        total_refining_fee: fee,
        status: "pending",
        created_by: context.userId,
      }).select("*").single();
    if (error) throw new Error(error.message);

    if (bars.length > 0) {
      const { error: be } = await supabaseAdmin
        .from("refinery_transaction_gold_bars")
        .insert(bars.map((b) => ({ ...b, transaction_id: tx.id })));
      if (be) throw new Error(be.message);
    }
    return tx as RefineryTransaction;
  });

export const settleTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tx, error: e0 } = await supabaseAdmin
      .from("refinery_transactions").select("refinery_id").eq("id", data.id).single();
    if (e0) throw new Error(e0.message);
    await assertAccess(context.userId, tx.refinery_id);
    const { data: settled, error } = await supabaseAdmin.rpc("refinery_settle_transaction", { _tx_id: data.id });
    if (error) throw new Error(error.message);
    return settled as RefineryTransaction;
  });

const txUpdate = txCreate.extend({ id: z.string().uuid() });

export const updateTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => txUpdate.parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refinery_id);

    // Reverse current settlement (if any)
    const { error: revErr } = await supabaseAdmin.rpc("refinery_reverse_transaction", { _tx_id: data.id });
    if (revErr) throw new Error(revErr.message);

    // Recompute totals
    let total_gross = 0, total_pure = 0, avg_purity = 0, fee = 0;
    const bars = (data.bars ?? []).map((b) => {
      const pure = (b.gross_weight * b.purity) / 1000;
      total_gross += b.gross_weight;
      total_pure += pure;
      return { ...b, pure_weight: pure };
    });
    if (total_gross > 0) avg_purity = (total_pure / total_gross) * 1000;
    if (data.transaction_type === "gold") {
      if (bars.length === 0) throw new Error("At least one gold bar is required.");
      if (data.direction === "receiving") fee = total_gross * (data.fee_price ?? 0);
    } else if (!data.da_amount || data.da_amount <= 0) {
      throw new Error("DA amount must be greater than 0.");
    }

    const { error: ue } = await supabaseAdmin
      .from("refinery_transactions").update({
        client_id: data.client_id,
        direction: data.direction,
        transaction_type: data.transaction_type,
        transaction_date: data.transaction_date,
        notes: data.notes ?? null,
        da_amount: data.transaction_type === "da" ? data.da_amount ?? 0 : 0,
        fee_price: data.transaction_type === "gold" && data.direction === "receiving" ? data.fee_price ?? 0 : 0,
        total_gross_weight: total_gross,
        total_pure_weight: total_pure,
        average_purity: avg_purity,
        total_refining_fee: fee,
        status: "pending",
      }).eq("id", data.id);
    if (ue) throw new Error(ue.message);

    // Replace bars
    await supabaseAdmin.from("refinery_transaction_gold_bars").delete().eq("transaction_id", data.id);
    if (bars.length > 0) {
      const { error: be } = await supabaseAdmin
        .from("refinery_transaction_gold_bars")
        .insert(bars.map((b) => ({ ...b, transaction_id: data.id })));
      if (be) throw new Error(be.message);
    }

    // Re-apply
    const { data: settled, error: se } = await supabaseAdmin.rpc("refinery_settle_transaction", { _tx_id: data.id });
    if (se) throw new Error(se.message);
    return settled as RefineryTransaction;
  });

export const deleteTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tx, error: e0 } = await supabaseAdmin
      .from("refinery_transactions").select("refinery_id").eq("id", data.id).single();
    if (e0) throw new Error(e0.message);
    await assertAccess(context.userId, tx.refinery_id);
    const { error: revErr } = await supabaseAdmin.rpc("refinery_reverse_transaction", { _tx_id: data.id });
    if (revErr) throw new Error(revErr.message);
    await supabaseAdmin.from("refinery_transaction_gold_bars").delete().eq("transaction_id", data.id);
    await supabaseAdmin.from("refinery_stock_movements").delete().eq("transaction_id", data.id);
    const { error } = await supabaseAdmin.from("refinery_transactions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const cancelTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error: revErr } = await supabaseAdmin.rpc("refinery_reverse_transaction", { _tx_id: data.id });
    if (revErr) throw new Error(revErr.message);
    const { error } = await supabaseAdmin
      .from("refinery_transactions").update({ status: "cancelled" }).eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Stock
// =========================================================
export const getStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: row, error } = await supabaseAdmin
      .from("refinery_stock").select("*").eq("refinery_id", data.refineryId).maybeSingle();
    if (error) throw new Error(error.message);
    return row ?? { refinery_id: data.refineryId, pure_gold_stock: 0, da_stock: 0 };
  });

export const listStockMovements = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_stock_movements")
      .select("*, client:refinery_clients(name), transaction:refinery_transactions(transaction_number, direction, transaction_type)")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

export const adjustStock = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      pure_gold_stock: z.number().min(0),
      da_stock: z.number().min(0),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: existing } = await supabaseAdmin
      .from("refinery_stock").select("*").eq("refinery_id", data.refineryId).maybeSingle();
    const before = {
      gold: Number(existing?.pure_gold_stock ?? 0),
      da: Number(existing?.da_stock ?? 0),
    };
    if (existing) {
      const { error } = await supabaseAdmin.from("refinery_stock")
        .update({ pure_gold_stock: data.pure_gold_stock, da_stock: data.da_stock, updated_at: new Date().toISOString() })
        .eq("refinery_id", data.refineryId);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("refinery_stock")
        .insert({ refinery_id: data.refineryId, pure_gold_stock: data.pure_gold_stock, da_stock: data.da_stock });
      if (error) throw new Error(error.message);
    }
    const { error: me } = await supabaseAdmin.from("refinery_stock_movements").insert({
      refinery_id: data.refineryId,
      movement_type: "adjustment",
      gold_change: data.pure_gold_stock - before.gold,
      da_change: data.da_stock - before.da,
      gold_stock_before: before.gold,
      gold_stock_after: data.pure_gold_stock,
      da_stock_before: before.da,
      da_stock_after: data.da_stock,
      notes: data.notes ?? "Manual stock adjustment",
      created_by: context.userId,
    });
    if (me) throw new Error(me.message);
    return { ok: true };
  });

export const adjustClientBalances = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      purity_balance: z.number(),
      da_balance: z.number(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: existing, error: e1 } = await supabaseAdmin
      .from("refinery_clients").select("refinery_id").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    await assertAccess(context.userId, existing.refinery_id);
    const { error } = await supabaseAdmin.from("refinery_clients")
      .update({ purity_balance: data.purity_balance, da_balance: data.da_balance })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Dashboard
// =========================================================
export const getDashboard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayIso = today.toISOString();

    const [stockR, clientsR, todayTxR, negR, recentR] = await Promise.all([
      supabaseAdmin.from("refinery_stock").select("*").eq("refinery_id", data.refineryId).maybeSingle(),
      supabaseAdmin.from("refinery_clients").select("id, purity_balance, da_balance").eq("refinery_id", data.refineryId),
      supabaseAdmin.from("refinery_transactions")
        .select("direction, transaction_type, total_pure_weight, da_amount, status")
        .eq("refinery_id", data.refineryId).gte("created_at", todayIso),
      supabaseAdmin.from("refinery_clients")
        .select("id, name, purity_balance, da_balance")
        .eq("refinery_id", data.refineryId)
        .or("purity_balance.lt.0,da_balance.lt.0")
        .order("name").limit(50),
      supabaseAdmin.from("refinery_transactions")
        .select("*, client:refinery_clients(name)")
        .eq("refinery_id", data.refineryId)
        .order("created_at", { ascending: false }).limit(10),
    ]);

    const clients = clientsR.data ?? [];
    const todayTx = todayTxR.data ?? [];
    const sum = (arr: typeof todayTx, dir: string, type: string, field: "total_pure_weight" | "da_amount") =>
      arr.filter((t) => t.direction === dir && t.transaction_type === type && t.status === "settled")
        .reduce((s, t) => s + Number(t[field] ?? 0), 0);

    return {
      stock: stockR.data ?? { pure_gold_stock: 0, da_stock: 0 },
      totalClients: clients.length,
      negativePurity: clients.filter((c) => Number(c.purity_balance) < 0).length,
      negativeDa: clients.filter((c) => Number(c.da_balance) < 0).length,
      todayCount: todayTx.length,
      todayReceivedGold: sum(todayTx, "receiving", "gold", "total_pure_weight"),
      todayDeliveredGold: sum(todayTx, "delivery", "gold", "total_pure_weight"),
      todayReceivedDa: sum(todayTx, "receiving", "da", "da_amount"),
      todayDeliveredDa: sum(todayTx, "delivery", "da", "da_amount"),
      negativeClients: negR.data ?? [],
      recent: (recentR.data ?? []).map((r) => {
        const { client, ...rest } = r as typeof r & { client?: { name: string } };
        return { ...rest, client_name: client?.name ?? "" };
      }),
    };
  });

// =========================================================
// Profile
// =========================================================
export const getMyRefineryProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const a = await loadAssignment(context.userId);
    const { data: user } = await supabaseAdmin.auth.admin.getUserById(context.userId);
    const { data: profile } = await supabaseAdmin
      .from("swap_profiles").select("username").eq("id", context.userId).maybeSingle();
    const { data: ru } = await supabaseAdmin
      .from("refinery_users").select("display_name, phone, status, role, refinery_id").eq("user_id", context.userId).maybeSingle();
    const { data: ref } = ru?.refinery_id
      ? await supabaseAdmin.from("refineries").select("name").eq("id", ru.refinery_id).maybeSingle()
      : { data: null };
    return {
      isAdmin: a.isAdmin,
      email: user?.user?.email ?? null,
      username: profile?.username ?? null,
      display_name: ru?.display_name ?? null,
      phone: ru?.phone ?? null,
      status: ru?.status ?? "active",
      role: ru?.role ?? null,
      refinery_id: ru?.refinery_id ?? null,
      refinery_name: ref?.name ?? null,
    };
  });

export const updateMyRefineryProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      display_name: z.string().trim().max(120).optional().nullable(),
      phone: z.string().trim().max(64).optional().nullable(),
      password: z.string().min(6).max(128).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const patch: { display_name?: string | null; phone?: string | null } = {};
    if (data.display_name !== undefined) patch.display_name = data.display_name;
    if (data.phone !== undefined) patch.phone = data.phone;
    if (Object.keys(patch).length > 0) {
      await supabaseAdmin.from("refinery_users").update(patch).eq("user_id", context.userId);
    }
    if (data.password) {
      const { error } = await supabaseAdmin.auth.admin.updateUserById(context.userId, { password: data.password });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

// =========================================================
// Admin: assign user to refinery
// =========================================================
export const assignUserToRefinery = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      user_id: z.string().uuid(),
      refinery_id: z.string().uuid(),
      role: z.enum(["manager", "staff", "viewer"]).default("staff"),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin
      .from("refinery_users")
      .upsert({ user_id: data.user_id, refinery_id: data.refinery_id, role: data.role }, { onConflict: "user_id" });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRefineryStaff = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_users").select("*").eq("refinery_id", data.refineryId).order("created_at");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });
