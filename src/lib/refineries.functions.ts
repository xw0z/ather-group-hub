import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =========================================================
// Types
// =========================================================
export type RefineryRole = "manager" | "staff" | "viewer";
export type RefineryDirection = "receiving" | "delivery";
export type RefineryTxType = "da" | "gold" | "settlement" | "stock_adjustment";
export type StockAdjustmentMetal = "gold" | "silver" | "da";
export type StockAdjustmentKind = "add" | "remove" | "correction" | "loss" | "manual";
export type RefinerySettlementKind = "gold" | "da";
export type RefinerySettlementRole = "from" | "to";
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
  created_by?: string | null;
  created_by_name?: string | null;
  bars?: RefineryGoldBar[];
  // Settlement-only fields
  settlement_group_id?: string | null;
  settlement_kind?: string | null;
  settlement_role?: string | null;
  counterparty_client_id?: string | null;
  counterparty_client_name?: string | null;
  settlement_apply_fee?: boolean | null;
  settlement_amount?: number | null;
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
      .select("*, client:refinery_clients!refinery_transactions_client_id_fkey(name, phone), counterparty:refinery_clients!refinery_transactions_counterparty_client_id_fkey(name)")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => {
      const { client, counterparty, ...rest } = r as typeof r & {
        client?: { name: string; phone: string | null };
        counterparty?: { name: string } | null;
      };
      return {
        ...rest,
        client_name: client?.name ?? "",
        client_phone: client?.phone ?? null,
        counterparty_client_name: counterparty?.name ?? null,
      } as RefineryTransaction;
    });
  });

export const getTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tx, error } = await supabaseAdmin
      .from("refinery_transactions")
      .select("*, client:refinery_clients!refinery_transactions_client_id_fkey(name, phone), counterparty:refinery_clients!refinery_transactions_counterparty_client_id_fkey(name)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    await assertAccess(context.userId, (tx as { refinery_id: string }).refinery_id);
    const { data: bars } = await supabaseAdmin
      .from("refinery_transaction_gold_bars")
      .select("*").eq("transaction_id", data.id).order("created_at");
    const { client, counterparty, ...rest } = tx as typeof tx & {
      client?: { name: string; phone: string | null };
      counterparty?: { name: string } | null;
    };
    let created_by_name: string | null = null;
    const createdBy = (rest as { created_by?: string | null }).created_by;
    if (createdBy) {
      const { data: prof } = await supabaseAdmin
        .from("swap_profiles").select("username").eq("id", createdBy).maybeSingle();
      created_by_name = (prof as { username?: string } | null)?.username ?? null;
    }
    return {
      ...rest,
      client_name: client?.name ?? "",
      client_phone: client?.phone ?? null,
      counterparty_client_name: counterparty?.name ?? null,
      created_by_name,
      bars: (bars ?? []) as RefineryGoldBar[],
    } as RefineryTransaction;
  });

export const createTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => txCreate.parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refinery_id);

    // Compute totals — refining fee charged on equivalent weight at 730 purity
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
        const weight_at_730 = (total_pure * 1000) / 730; // = sum(gross * purity / 730)
        fee = weight_at_730 * (data.fee_price ?? 0);
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

    // Recompute totals — fee on weight at 730
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
        const weight_at_730 = (total_pure * 1000) / 730;
        fee = weight_at_730 * (data.fee_price ?? 0);
      }
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
      .from("refinery_transactions")
      .select("refinery_id, transaction_type, settlement_group_id")
      .eq("id", data.id).single();
    if (e0) throw new Error(e0.message);
    await assertAccess(context.userId, tx.refinery_id);
    // Settlement: delete both paired rows + reverse balances in one RPC
    if (tx.transaction_type === "settlement" && tx.settlement_group_id) {
      const { error: se } = await supabaseAdmin.rpc("refinery_delete_settlement", { _group_id: tx.settlement_group_id });
      if (se) throw new Error(se.message);
      return { ok: true };
    }
    // Stock adjustment: reverse stock + remove tx + movement
    if (tx.transaction_type === "stock_adjustment") {
      const { error: ae } = await supabaseAdmin.rpc("refinery_delete_stock_adjustment", { _tx_id: data.id });
      if (ae) throw new Error(ae.message);
      return { ok: true };
    }
    const { error: revErr } = await supabaseAdmin.rpc("refinery_reverse_transaction", { _tx_id: data.id });
    if (revErr) throw new Error(revErr.message);
    await supabaseAdmin.from("refinery_transaction_gold_bars").delete().eq("transaction_id", data.id);
    await supabaseAdmin.from("refinery_stock_movements").delete().eq("transaction_id", data.id);
    const { error } = await supabaseAdmin.from("refinery_transactions").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Settlements
// =========================================================
const settlementCreate = z.object({
  refinery_id: z.string().uuid(),
  from_client_id: z.string().uuid(),
  to_client_id: z.string().uuid(),
  kind: z.enum(["gold", "da"]),
  amount: z.number().positive(),
  apply_fee: z.boolean().default(false),
  fee_price: z.number().min(0).default(0),
  transaction_date: z.string(),
  notes: z.string().max(2000).optional().nullable(),
});

export const createSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settlementCreate.parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refinery_id);
    if (data.from_client_id === data.to_client_id) {
      throw new Error("From and To clients must be different");
    }
    const { data: groupId, error } = await supabaseAdmin.rpc("refinery_create_settlement", {
      _refinery_id: data.refinery_id,
      _from_client: data.from_client_id,
      _to_client: data.to_client_id,
      _kind: data.kind,
      _amount: data.amount,
      _apply_fee: data.apply_fee,
      _fee_price: data.fee_price,
      _date: data.transaction_date,
      _notes: data.notes ?? "",
    });
    if (error) throw new Error(error.message);
    return { group_id: (groupId ?? "") as string };
  });

export type SettlementPair = {
  group_id: string;
  refinery_id: string;
  transaction_date: string;
  created_at: string;
  created_by_name: string | null;
  kind: "gold" | "da";
  amount: number;
  apply_fee: boolean;
  fee_price: number;
  total_fee: number;
  weight_730: number;
  notes: string | null;
  from: {
    client_id: string;
    client_name: string;
    transaction_number: string;
    previous_purity: number; new_purity: number;
    previous_da: number; new_da: number;
  };
  to: {
    client_id: string;
    client_name: string;
    transaction_number: string;
    previous_purity: number; new_purity: number;
    previous_da: number; new_da: number;
  };
};

export const getSettlement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<SettlementPair> => {
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_transactions")
      .select("*, client:refinery_clients!refinery_transactions_client_id_fkey(name)")
      .eq("settlement_group_id", data.group_id)
      .order("settlement_role", { ascending: true }); // 'from' before 'to'
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) throw new Error("Settlement not found");
    const first = rows[0] as { refinery_id: string };
    await assertAccess(context.userId, first.refinery_id);

    const fromRow = rows.find((r) => (r as { settlement_role?: string }).settlement_role === "from") as typeof rows[0] & { client?: { name: string } };
    const toRow = rows.find((r) => (r as { settlement_role?: string }).settlement_role === "to") as typeof rows[0] & { client?: { name: string } };
    if (!fromRow || !toRow) throw new Error("Incomplete settlement");

    let created_by_name: string | null = null;
    const createdBy = (fromRow as { created_by?: string | null }).created_by;
    if (createdBy) {
      const { data: prof } = await supabaseAdmin
        .from("swap_profiles").select("username").eq("id", createdBy).maybeSingle();
      created_by_name = (prof as { username?: string } | null)?.username ?? null;
    }

    const kind = ((fromRow as { settlement_kind?: string }).settlement_kind ?? "gold") as "gold" | "da";
    const amount = Number((fromRow as { settlement_amount?: number }).settlement_amount ?? 0);
    const apply_fee = Boolean((fromRow as { settlement_apply_fee?: boolean }).settlement_apply_fee);
    const fee_price = Number((fromRow as { fee_price?: number }).fee_price ?? 0);
    const total_fee = Number((toRow as { total_refining_fee?: number }).total_refining_fee ?? 0);
    const weight_730 = kind === "gold" && apply_fee ? (amount * 1000) / 730 : 0;

    return {
      group_id: data.group_id,
      refinery_id: first.refinery_id,
      transaction_date: (fromRow as { transaction_date: string }).transaction_date,
      created_at: (fromRow as { created_at: string }).created_at,
      created_by_name,
      kind, amount, apply_fee, fee_price, total_fee, weight_730,
      notes: (fromRow as { notes: string | null }).notes,
      from: {
        client_id: (fromRow as { client_id: string }).client_id,
        client_name: fromRow.client?.name ?? "",
        transaction_number: (fromRow as { transaction_number: string }).transaction_number,
        previous_purity: Number((fromRow as { previous_purity_balance?: number }).previous_purity_balance ?? 0),
        new_purity: Number((fromRow as { new_purity_balance?: number }).new_purity_balance ?? 0),
        previous_da: Number((fromRow as { previous_da_balance?: number }).previous_da_balance ?? 0),
        new_da: Number((fromRow as { new_da_balance?: number }).new_da_balance ?? 0),
      },
      to: {
        client_id: (toRow as { client_id: string }).client_id,
        client_name: toRow.client?.name ?? "",
        transaction_number: (toRow as { transaction_number: string }).transaction_number,
        previous_purity: Number((toRow as { previous_purity_balance?: number }).previous_purity_balance ?? 0),
        new_purity: Number((toRow as { new_purity_balance?: number }).new_purity_balance ?? 0),
        previous_da: Number((toRow as { previous_da_balance?: number }).previous_da_balance ?? 0),
        new_da: Number((toRow as { new_da_balance?: number }).new_da_balance ?? 0),
      },
    };
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

export const updateStockAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      movementId: z.string().uuid(),
      pure_gold_stock: z.number().min(0),
      da_stock: z.number().min(0),
      notes: z.string().max(500).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { data: mv, error: me } = await supabaseAdmin
      .from("refinery_stock_movements").select("*").eq("id", data.movementId).single();
    if (me) throw new Error(me.message);
    if (mv.movement_type !== "adjustment") throw new Error("Only adjustment movements can be edited");
    await assertAccess(context.userId, mv.refinery_id);

    const { data: stk } = await supabaseAdmin
      .from("refinery_stock").select("*").eq("refinery_id", mv.refinery_id).maybeSingle();
    const curGold = Number(stk?.pure_gold_stock ?? 0);
    const curDa = Number(stk?.da_stock ?? 0);
    const newGold = curGold + (data.pure_gold_stock - Number(mv.gold_stock_after));
    const newDa = curDa + (data.da_stock - Number(mv.da_stock_after));
    if (newGold < 0 || newDa < 0) throw new Error("Resulting stock would be negative");

    const { error: e1 } = await supabaseAdmin.from("refinery_stock")
      .update({ pure_gold_stock: newGold, da_stock: newDa, updated_at: new Date().toISOString() })
      .eq("refinery_id", mv.refinery_id);
    if (e1) throw new Error(e1.message);

    const { error: e2 } = await supabaseAdmin.from("refinery_stock_movements").update({
      gold_change: data.pure_gold_stock - Number(mv.gold_stock_before),
      da_change: data.da_stock - Number(mv.da_stock_before),
      gold_stock_after: data.pure_gold_stock,
      da_stock_after: data.da_stock,
      notes: data.notes ?? mv.notes,
    }).eq("id", data.movementId);
    if (e2) throw new Error(e2.message);
    return { ok: true };
  });

export const deleteStockAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ movementId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: mv, error: me } = await supabaseAdmin
      .from("refinery_stock_movements").select("*").eq("id", data.movementId).single();
    if (me) throw new Error(me.message);
    if (mv.movement_type !== "adjustment") throw new Error("Only adjustment movements can be deleted");
    await assertAccess(context.userId, mv.refinery_id);

    const { data: stk } = await supabaseAdmin
      .from("refinery_stock").select("*").eq("refinery_id", mv.refinery_id).maybeSingle();
    const newGold = Number(stk?.pure_gold_stock ?? 0) - Number(mv.gold_change);
    const newDa = Number(stk?.da_stock ?? 0) - Number(mv.da_change);
    if (newGold < 0 || newDa < 0) throw new Error("Resulting stock would be negative");

    const { error: e1 } = await supabaseAdmin.from("refinery_stock")
      .update({ pure_gold_stock: newGold, da_stock: newDa, updated_at: new Date().toISOString() })
      .eq("refinery_id", mv.refinery_id);
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin.from("refinery_stock_movements")
      .delete().eq("id", data.movementId);
    if (e2) throw new Error(e2.message);
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
      stock: stockR.data ?? { pure_gold_stock: 0, da_stock: 0, silver_stock: 0 },
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

// =========================================================
// Account Statement
// =========================================================
export type StatementRowType =
  | "gold_received"
  | "gold_delivered"
  | "refining_fee"
  | "da_received"
  | "da_paid"
  | "adjustment"
  | "reversal";

export type StatementRow = {
  date: string;
  created_at: string;
  reference: string;
  type: StatementRowType;
  description: string;
  client_name: string | null;
  gold_debit: number;
  gold_credit: number;
  da_debit: number;
  da_credit: number;
  running_gold: number;
  running_da: number;
  // Refining-fee details (populated on refining_fee rows)
  original_weight?: number;
  original_purity?: number;
  weight_at_730?: number;
  fee_price?: number;
  fee_total?: number;
};

export type AccountStatement = {
  refinery: { id: string; name: string };
  client: { id: string; name: string; phone: string | null };
  range: { from: string; to: string };
  statement_number: string;
  generated_at: string;
  generated_by: string;
  opening_gold: number;
  opening_da: number;
  closing_gold: number;
  closing_da: number;
  rows: StatementRow[];
  summary: {
    total_gold_received: number;
    total_gold_delivered: number;
    total_da_received: number;
    total_da_paid: number;
    total_refining_fees: number;
    transaction_count: number;
  };
};

const dateStrR = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");

export const getAccountStatement = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      clientId: z.string().uuid(),
      from: dateStrR,
      to: dateStrR,
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<AccountStatement> => {
    await assertAccess(context.userId, data.refineryId);

    const [{ data: ref, error: rErr }, { data: cli, error: cErr }] = await Promise.all([
      supabaseAdmin.from("refineries").select("id, name").eq("id", data.refineryId).single(),
      supabaseAdmin.from("refinery_clients").select("id, name, phone, refinery_id")
        .eq("id", data.clientId).single(),
    ]);
    if (rErr) throw new Error(rErr.message);
    if (cErr) throw new Error(cErr.message);
    if (cli.refinery_id !== data.refineryId) throw new Error("Client does not belong to this refinery");

    const fromTs = `${data.from}T00:00:00.000Z`;
    const toTs = `${data.to}T23:59:59.999Z`;

    // Opening: latest settled tx for this client strictly before window
    const { data: priorTx } = await supabaseAdmin
      .from("refinery_transactions")
      .select("new_purity_balance, new_da_balance, settled_at")
      .eq("client_id", data.clientId)
      .eq("status", "settled")
      .lt("settled_at", fromTs)
      .order("settled_at", { ascending: false })
      .limit(1);
    let openingGold = 0;
    let openingDa = 0;
    if (priorTx && priorTx.length > 0) {
      openingGold = Number(priorTx[0].new_purity_balance ?? 0);
      openingDa = Number(priorTx[0].new_da_balance ?? 0);
    }

    // Transactions in window (settled)
    const { data: txs, error: tErr } = await supabaseAdmin
      .from("refinery_transactions")
      .select("id, transaction_number, transaction_date, settled_at, direction, transaction_type, total_pure_weight, total_gross_weight, average_purity, fee_price, total_refining_fee, da_amount, previous_purity_balance, new_purity_balance, previous_da_balance, new_da_balance")
      .eq("client_id", data.clientId)
      .eq("status", "settled")
      .gte("settled_at", fromTs)
      .lte("settled_at", toTs)
      .order("settled_at", { ascending: true });
    if (tErr) throw new Error(tErr.message);

    const rows: StatementRow[] = [];
    let totalGoldRecv = 0, totalGoldDeliv = 0, totalDaRecv = 0, totalDaPaid = 0, totalFees = 0;

    for (const tx of txs ?? []) {
      const dateStr = tx.transaction_date ?? String(tx.settled_at).slice(0, 10);
      const refn = tx.transaction_number;
      const runGold = Number(tx.new_purity_balance ?? 0);
      const runDa = Number(tx.new_da_balance ?? 0);

      if (tx.transaction_type === "gold" && tx.direction === "receiving") {
        const gold = Number(tx.total_pure_weight) || 0;
        totalGoldRecv += gold;
        rows.push({
          date: dateStr, created_at: String(tx.settled_at),
          reference: refn, type: "gold_received",
          description: `Gold Received — ${cli.name}`,
          client_name: cli.name,
          gold_debit: 0, gold_credit: gold,
          da_debit: 0, da_credit: 0,
          running_gold: runGold, running_da: runDa,
        });
        if (Number(tx.total_refining_fee) > 0) {
          const orig_w = Number(tx.total_gross_weight) || 0;
          const orig_p = Number(tx.average_purity) || 0;
          const w730 = orig_p > 0 ? (orig_w * orig_p) / 730 : 0;
          const fee = Number(tx.total_refining_fee) || 0;
          totalFees += fee;
          rows.push({
            date: dateStr, created_at: String(tx.settled_at),
            reference: refn, type: "refining_fee",
            description: `Refining Fee — ${cli.name}`,
            client_name: cli.name,
            gold_debit: 0, gold_credit: 0,
            da_debit: fee, da_credit: 0,
            running_gold: runGold, running_da: runDa,
            original_weight: orig_w, original_purity: orig_p,
            weight_at_730: w730, fee_price: Number(tx.fee_price) || 0, fee_total: fee,
          });
        }
      } else if (tx.transaction_type === "gold" && tx.direction === "delivery") {
        const gold = Number(tx.total_pure_weight) || 0;
        totalGoldDeliv += gold;
        rows.push({
          date: dateStr, created_at: String(tx.settled_at),
          reference: refn, type: "gold_delivered",
          description: `Gold Delivered — ${cli.name}`,
          client_name: cli.name,
          gold_debit: gold, gold_credit: 0,
          da_debit: 0, da_credit: 0,
          running_gold: runGold, running_da: runDa,
        });
      } else if (tx.transaction_type === "da" && tx.direction === "receiving") {
        const da = Number(tx.da_amount) || 0;
        totalDaRecv += da;
        rows.push({
          date: dateStr, created_at: String(tx.settled_at),
          reference: refn, type: "da_received",
          description: `DA Payment Received — ${cli.name}`,
          client_name: cli.name,
          gold_debit: 0, gold_credit: 0,
          da_debit: 0, da_credit: da,
          running_gold: runGold, running_da: runDa,
        });
      } else if (tx.transaction_type === "da" && tx.direction === "delivery") {
        const da = Number(tx.da_amount) || 0;
        totalDaPaid += da;
        rows.push({
          date: dateStr, created_at: String(tx.settled_at),
          reference: refn, type: "da_paid",
          description: `DA Payment Paid — ${cli.name}`,
          client_name: cli.name,
          gold_debit: 0, gold_credit: 0,
          da_debit: da, da_credit: 0,
          running_gold: runGold, running_da: runDa,
        });
      }
    }

    const closingGold = rows.length > 0 ? rows[rows.length - 1].running_gold : openingGold;
    const closingDa = rows.length > 0 ? rows[rows.length - 1].running_da : openingDa;

    // Generator
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles").select("username").eq("id", context.userId).maybeSingle();
    let genName: string | null = prof?.username ?? null;
    if (!genName) {
      const { data: ru } = await supabaseAdmin
        .from("refinery_users").select("display_name").eq("user_id", context.userId).maybeSingle();
      genName = ru?.display_name ?? "User";
    }

    const stmtNum = `STMT-${data.from.replace(/-/g, "")}-${data.to.replace(/-/g, "")}-${Date.now().toString(36).slice(-5).toUpperCase()}`;

    return {
      refinery: { id: ref.id, name: ref.name },
      client: { id: cli.id, name: cli.name, phone: cli.phone ?? null },
      range: { from: data.from, to: data.to },
      statement_number: stmtNum,
      generated_at: new Date().toISOString(),
      generated_by: genName,
      opening_gold: openingGold,
      opening_da: openingDa,
      closing_gold: closingGold,
      closing_da: closingDa,
      rows,
      summary: {
        total_gold_received: totalGoldRecv,
        total_gold_delivered: totalGoldDeliv,
        total_da_received: totalDaRecv,
        total_da_paid: totalDaPaid,
        total_refining_fees: totalFees,
        transaction_count: (txs ?? []).length,
      },
    };
  });

export const logRefineryReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refinery_id: z.string().uuid(),
      client_id: z.string().uuid().nullable().optional(),
      date_from: dateStrR,
      date_to: dateStrR,
      statement_number: z.string().max(120).nullable().optional(),
      format: z.enum(["PNG", "PDF", "PREVIEW"]),
      channel: z.enum(["download", "whatsapp", "preview", "copy"]).default("download"),
      details: z.record(z.string(), z.unknown()).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refinery_id);
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles").select("username").eq("id", context.userId).maybeSingle();
    const username: string | null = prof?.username ?? null;

    const { error } = await supabaseAdmin.from("refinery_report_history").insert({
      refinery_id: data.refinery_id,
      client_id: data.client_id ?? null,
      report_type: "account_statement",
      date_from: data.date_from,
      date_to: data.date_to,
      statement_number: data.statement_number ?? null,
      format: data.format,
      channel: data.channel,
      generated_by: context.userId,
      generated_by_username: username,
      details: (data.details ?? null) as never,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listRefineryReportHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    refineryId: z.string().uuid(),
    clientId: z.string().uuid().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    let q = supabaseAdmin
      .from("refinery_report_history")
      .select("id, client_id, date_from, date_to, statement_number, format, channel, generated_by_username, created_at")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false })
      .limit(100);
    if (data.clientId) q = q.eq("client_id", data.clientId);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return rows ?? [];
  });


// =========================================================
// Refinery Dashboard Overview (admin)
// =========================================================
export type RefineryDashboardOverview = {
  refinery: { id: string; name: string };
  range: { from: string; to: string };
  stock: {
    pure_gold_stock: number;
    da_stock: number;
    total_bars: number;
    average_purity: number;
  };
  totals: {
    totalClientGoldBalance: number;
    totalClientDaBalance: number;
    clientGoldLiability: number;     // sum of positive client gold balances (we owe them)
    clientDaLiability: number;       // sum of positive client da balances (we owe them)
    clientGoldReceivable: number;    // sum of negative balances (they owe us), as positive number
    clientDaReceivable: number;
    refiningFeesEarned: number;      // all-time
    refiningFeesEarnedInRange: number;
  };
  rangeTotals: {
    goldReceived: number;
    goldDelivered: number;
    daReceived: number;
    daDelivered: number;
    settlementsCount: number;
    settlementsGoldVolume: number;
    settlementsDaVolume: number;
    txCount: number;
  };
  clients: Array<{
    id: string;
    code: string;
    name: string;
    purity_balance: number;
    da_balance: number;
    last_tx_date: string | null;
  }>;
};

export const getRefineryDashboardOverview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      from: z.string(),
      to: z.string(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RefineryDashboardOverview> => {
    await assertAdmin(context.userId);

    const [refR, stockR, barsR, clientsR, lastTxR, rangeTxR, feesAllR] = await Promise.all([
      supabaseAdmin.from("refineries").select("id, name").eq("id", data.refineryId).single(),
      supabaseAdmin.from("refinery_stock").select("*").eq("refinery_id", data.refineryId).maybeSingle(),
      supabaseAdmin.from("refinery_transaction_gold_bars")
        .select("pure_weight, purity, gross_weight, transaction:refinery_transactions!inner(refinery_id, direction, status)")
        .eq("transaction.refinery_id", data.refineryId),
      supabaseAdmin.from("refinery_clients")
        .select("id, name, purity_balance, da_balance")
        .eq("refinery_id", data.refineryId)
        .order("name"),
      supabaseAdmin.from("refinery_transactions")
        .select("client_id, transaction_date, created_at")
        .eq("refinery_id", data.refineryId)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("refinery_transactions")
        .select("direction, transaction_type, total_pure_weight, da_amount, total_refining_fee, status, settlement_role, settlement_kind, settlement_amount, settlement_group_id")
        .eq("refinery_id", data.refineryId)
        .gte("transaction_date", data.from)
        .lte("transaction_date", data.to),
      supabaseAdmin.from("refinery_transactions")
        .select("total_refining_fee, status")
        .eq("refinery_id", data.refineryId),
    ]);

    if (refR.error || !refR.data) throw new Error("Refinery not found");

    // Bars in current stock (receiving - delivery, settled only)
    type BarRow = { pure_weight: number; purity: number; gross_weight: number; transaction: { direction: string; status: string } | { direction: string; status: string }[] };
    const bars = (barsR.data ?? []) as unknown as BarRow[];
    let barCount = 0;
    let weightedPuritySum = 0;
    let totalGrossForPurity = 0;
    for (const b of bars) {
      const tx = Array.isArray(b.transaction) ? b.transaction[0] : b.transaction;
      if (!tx || tx.status !== "settled") continue;
      const sign = tx.direction === "receiving" ? 1 : -1;
      barCount += sign;
      weightedPuritySum += sign * Number(b.gross_weight) * Number(b.purity);
      totalGrossForPurity += sign * Number(b.gross_weight);
    }
    const avgPurity = totalGrossForPurity > 0 ? weightedPuritySum / totalGrossForPurity : 0;

    // Client aggregates
    const clientsAll = clientsR.data ?? [];
    let totalGold = 0, totalDa = 0;
    let liabGold = 0, liabDa = 0, recvGold = 0, recvDa = 0;
    for (const c of clientsAll) {
      const g = Number(c.purity_balance ?? 0);
      const d2 = Number(c.da_balance ?? 0);
      totalGold += g; totalDa += d2;
      if (g > 0) liabGold += g; else recvGold += -g;
      if (d2 > 0) liabDa += d2; else recvDa += -d2;
    }

    // Last tx date per client
    const lastByClient = new Map<string, string>();
    for (const r of (lastTxR.data ?? [])) {
      if (!lastByClient.has(r.client_id)) lastByClient.set(r.client_id, r.transaction_date);
    }

    // Range totals
    const rng = rangeTxR.data ?? [];
    let goldReceived = 0, goldDelivered = 0, daReceived = 0, daDelivered = 0;
    let feesInRange = 0;
    const settlementGroups = new Set<string>();
    let settGold = 0, settDa = 0;
    for (const t of rng) {
      if (t.status !== "settled") continue;
      if (t.transaction_type === "settlement") {
        if (t.settlement_group_id) settlementGroups.add(t.settlement_group_id);
        if (t.settlement_role === "to") {
          if (t.settlement_kind === "gold") settGold += Number(t.settlement_amount ?? 0);
          else if (t.settlement_kind === "da") settDa += Number(t.settlement_amount ?? 0);
          feesInRange += Number(t.total_refining_fee ?? 0);
        }
        continue;
      }
      if (t.transaction_type === "gold") {
        if (t.direction === "receiving") { goldReceived += Number(t.total_pure_weight ?? 0); feesInRange += Number(t.total_refining_fee ?? 0); }
        else goldDelivered += Number(t.total_pure_weight ?? 0);
      } else if (t.transaction_type === "da") {
        if (t.direction === "receiving") daReceived += Number(t.da_amount ?? 0);
        else daDelivered += Number(t.da_amount ?? 0);
      }
    }

    const feesAllTime = (feesAllR.data ?? [])
      .filter((r) => r.status === "settled")
      .reduce((s, r) => s + Number(r.total_refining_fee ?? 0), 0);

    return {
      refinery: refR.data,
      range: { from: data.from, to: data.to },
      stock: {
        pure_gold_stock: Number(stockR.data?.pure_gold_stock ?? 0),
        da_stock: Number(stockR.data?.da_stock ?? 0),
        total_bars: Math.max(0, barCount),
        average_purity: avgPurity,
      },
      totals: {
        totalClientGoldBalance: totalGold,
        totalClientDaBalance: totalDa,
        clientGoldLiability: liabGold,
        clientDaLiability: liabDa,
        clientGoldReceivable: recvGold,
        clientDaReceivable: recvDa,
        refiningFeesEarned: feesAllTime,
        refiningFeesEarnedInRange: feesInRange,
      },
      rangeTotals: {
        goldReceived,
        goldDelivered,
        daReceived,
        daDelivered,
        settlementsCount: settlementGroups.size,
        settlementsGoldVolume: settGold,
        settlementsDaVolume: settDa,
        txCount: rng.filter((t) => t.status === "settled").length,
      },
      clients: clientsAll.map((c, i) => ({
        id: c.id,
        code: `C-${String(i + 1).padStart(4, "0")}`,
        name: c.name,
        purity_balance: Number(c.purity_balance ?? 0),
        da_balance: Number(c.da_balance ?? 0),
        last_tx_date: lastByClient.get(c.id) ?? null,
      })),
    };
  });

// =========================================================
// Stock Adjustment Transactions (admin/manager) - V2
// =========================================================
export const createStockAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      metal: z.enum(["gold", "silver", "da"]),
      kind: z.enum(["add", "remove", "correction", "loss", "manual"]),
      // Positive amount; "remove" / "loss" convert it to a negative delta server-side
      amount: z.number().positive(),
      notes: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const signed = data.kind === "remove" || data.kind === "loss" ? -data.amount : data.amount;
    const { data: txId, error } = await supabaseAdmin.rpc("refinery_create_stock_adjustment", {
      _refinery_id: data.refineryId,
      _metal: data.metal,
      _kind: data.kind,
      _delta: signed,
      _notes: data.notes ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true, transactionId: txId as string };
  });
