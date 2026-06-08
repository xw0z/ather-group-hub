import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// =========================================================
// Types
// =========================================================
export type RefineryRole = "manager" | "staff" | "viewer";
export type RefineryDirection = "receiving" | "delivery";
export type RefineryTxType = "da" | "gold" | "settlement" | "stock_adjustment" | "buysell";
export type BuySellKind = "buy" | "sell";
export type BuySellSettlement = "settlement" | "cash";
export type BuySellMetal = "gold" | "silver";
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
  code: string | null;
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
  client_id: string | null;
  client_name?: string;
  client_code?: string | null;
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
  counterparty_client_code?: string | null;
  settlement_apply_fee?: boolean | null;
  settlement_amount?: number | null;
  // Buy/Sell-only fields
  buysell_kind?: BuySellKind | string | null;
  buysell_settlement?: BuySellSettlement | string | null;
  buysell_metal?: BuySellMetal | string | null;
  buysell_weight?: number | null;
  buysell_purity?: number | null;
  buysell_price_per_gram?: number | null;
  buysell_total?: number | null;
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
const codeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z]{2}\d{4}$/, "Code must be 2 letters + 4 digits (e.g. AM4821)")
  .transform((s) => s.toUpperCase());

const clientCreate = z.object({
  refinery_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  code: codeSchema.optional().nullable(),
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
    const payload = { ...data, code: data.code ?? null };
    const { data: row, error } = await supabaseAdmin
      .from("refinery_clients").insert(payload).select("*").single();
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error("This client code is already used by another client.");
      }
      throw new Error(error.message);
    }
    return row as RefineryClient;
  });

export const updateClient = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      name: z.string().trim().min(1).max(200).optional(),
      code: codeSchema.optional().nullable(),
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
    if (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new Error("This client code is already used by another client.");
      }
      throw new Error(error.message);
    }
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

/** Suggest a unique client code from a name (server-generated, format AA1234). */
export const suggestClientCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ name: z.string().trim().min(1).max(200) }).parse(d))
  .handler(async ({ data }) => {
    const { data: code, error } = await supabaseAdmin
      .rpc("refinery_generate_client_code", { _name: data.name });
    if (error) throw new Error(error.message);
    return { code: code as string };
  });

/** Validate a manually entered client code: uniqueness + prefix collision warning. */
export const checkClientCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      code: codeSchema,
      excludeClientId: z.string().uuid().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const prefix = data.code.slice(0, 2);
    const exclude = data.excludeClientId ?? null;
    const [{ data: dup }, { data: prefixHits }] = await Promise.all([
      supabaseAdmin
        .from("refinery_clients")
        .select("id, name")
        .eq("code", data.code)
        .limit(2),
      supabaseAdmin
        .from("refinery_clients")
        .select("id, name, code")
        .ilike("code", `${prefix}%`)
        .limit(20),
    ]);
    const duplicates = (dup ?? []).filter((c) => c.id !== exclude);
    const prefixOthers = (prefixHits ?? []).filter(
      (c) => c.id !== exclude && c.code !== data.code,
    );
    return {
      duplicate: duplicates.length > 0,
      duplicateOf: duplicates[0]?.name ?? null,
      prefixCollision: prefixOthers.length > 0,
      prefixOthers: prefixOthers.map((c) => ({ name: c.name, code: c.code as string })),
    };
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
      .select("*, client:refinery_clients!refinery_transactions_client_id_fkey(name, code, phone), counterparty:refinery_clients!refinery_transactions_counterparty_client_id_fkey(name, code)")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? [])
      // Settlements live as two DB rows (one per client). Hide the "to" side so the
      // list shows ONE row per settlement; the "from" row carries the counterparty fields.
      .filter((r) => {
        const role = (r as { settlement_role?: string | null }).settlement_role;
        return role !== "to";
      })
      .map((r) => {
        const { client, counterparty, ...rest } = r as typeof r & {
          client?: { name: string; code: string | null; phone: string | null };
          counterparty?: { name: string; code: string | null } | null;
        };
        return {
          ...rest,
          client_name: client?.name ?? "",
          client_code: client?.code ?? null,
          client_phone: client?.phone ?? null,
          counterparty_client_name: counterparty?.name ?? null,
          counterparty_client_code: counterparty?.code ?? null,
        } as RefineryTransaction;
      });
  });

/** Strip the legacy -A/-B suffix from a settlement transaction number. Safe for any row. */
export function displayTxNumber(tx: { transaction_number: string; transaction_type?: string | null }): string {
  if (tx.transaction_type === "settlement") return tx.transaction_number.replace(/-[AB]$/, "");
  return tx.transaction_number;
}


export const getTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: tx, error } = await supabaseAdmin
      .from("refinery_transactions")
      .select("*, client:refinery_clients!refinery_transactions_client_id_fkey(name, code, phone), counterparty:refinery_clients!refinery_transactions_counterparty_client_id_fkey(name, code)")
      .eq("id", data.id).single();
    if (error) throw new Error(error.message);
    await assertAccess(context.userId, (tx as { refinery_id: string }).refinery_id);
    const { data: bars } = await supabaseAdmin
      .from("refinery_transaction_gold_bars")
      .select("*").eq("transaction_id", data.id).order("created_at");
    const { client, counterparty, ...rest } = tx as typeof tx & {
      client?: { name: string; code: string | null; phone: string | null };
      counterparty?: { name: string; code: string | null } | null;
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
      client_code: client?.code ?? null,
      client_phone: client?.phone ?? null,
      counterparty_client_name: counterparty?.name ?? null,
      counterparty_client_code: counterparty?.code ?? null,
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
    // Buy/Sell transactions are immutable — deletion is blocked for audit integrity.
    if (tx.transaction_type === "buysell") {
      throw new Error("Buy/Sell transactions cannot be deleted. They are kept for audit integrity.");
    }
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
  from_fee_price: z.number().min(0).default(0),
  to_fee_price: z.number().min(0).default(0),
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
      _from_fee_price: data.from_fee_price,
      _to_fee_price: data.to_fee_price,
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
  /** Legacy: kept for back-compat. Equals to_fee_price. */
  fee_price: number;
  from_fee_price: number;
  to_fee_price: number;
  /** From-client credit (DA). */
  from_fee_credit: number;
  /** To-client debit (DA). */
  to_fee_debit: number;
  /** Net refinery fee profit = to_fee_debit - from_fee_credit. */
  net_fee_profit: number;
  /** Legacy fields kept for back-compat; net_fee_profit is the new source of truth. */
  total_fee: number;
  weight_730: number;
  notes: string | null;
  from: {
    client_id: string;
    client_name: string;
    client_code: string | null;
    transaction_number: string;
    previous_purity: number; new_purity: number;
    previous_da: number; new_da: number;
  };
  to: {
    client_id: string;
    client_name: string;
    client_code: string | null;
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
      .select("*, client:refinery_clients!refinery_transactions_client_id_fkey(name, code)")
      .eq("settlement_group_id", data.group_id)
      .order("settlement_role", { ascending: true }); // 'from' before 'to'
    if (error) throw new Error(error.message);
    if (!rows || rows.length === 0) throw new Error("Settlement not found");
    const first = rows[0] as { refinery_id: string };
    await assertAccess(context.userId, first.refinery_id);

    const fromRow = rows.find((r) => (r as { settlement_role?: string }).settlement_role === "from") as typeof rows[0] & { client?: { name: string; code: string | null } };
    const toRow = rows.find((r) => (r as { settlement_role?: string }).settlement_role === "to") as typeof rows[0] & { client?: { name: string; code: string | null } };
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
    const from_fee_price = Number((fromRow as { fee_price?: number }).fee_price ?? 0);
    const to_fee_price = Number((toRow as { fee_price?: number }).fee_price ?? 0);
    const from_fee_credit = Number((fromRow as { total_refining_fee?: number }).total_refining_fee ?? 0);
    const to_fee_debit = Number((toRow as { total_refining_fee?: number }).total_refining_fee ?? 0);
    const net_fee_profit = to_fee_debit - from_fee_credit;
    const weight_730 = kind === "gold" && apply_fee ? (amount * 1000) / 730 : 0;

    return {
      group_id: data.group_id,
      refinery_id: first.refinery_id,
      transaction_date: (fromRow as { transaction_date: string }).transaction_date,
      created_at: (fromRow as { created_at: string }).created_at,
      created_by_name,
      kind, amount, apply_fee,
      fee_price: to_fee_price,
      from_fee_price, to_fee_price,
      from_fee_credit, to_fee_debit, net_fee_profit,
      total_fee: to_fee_debit, weight_730,

      notes: (fromRow as { notes: string | null }).notes,
      from: {
        client_id: (fromRow as { client_id: string }).client_id,
        client_name: fromRow.client?.name ?? "",
        client_code: fromRow.client?.code ?? null,
        transaction_number: (fromRow as { transaction_number: string }).transaction_number,
        previous_purity: Number((fromRow as { previous_purity_balance?: number }).previous_purity_balance ?? 0),
        new_purity: Number((fromRow as { new_purity_balance?: number }).new_purity_balance ?? 0),
        previous_da: Number((fromRow as { previous_da_balance?: number }).previous_da_balance ?? 0),
        new_da: Number((fromRow as { new_da_balance?: number }).new_da_balance ?? 0),
      },
      to: {
        client_id: (toRow as { client_id: string }).client_id,
        client_name: toRow.client?.name ?? "",
        client_code: toRow.client?.code ?? null,
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

    const [stockR, clientsR, todayTxR, negR, recentR, priceR] = await Promise.all([
      supabaseAdmin.from("refinery_stock").select("*").eq("refinery_id", data.refineryId).maybeSingle(),
      supabaseAdmin.from("refinery_clients").select("id, purity_balance, da_balance").eq("refinery_id", data.refineryId),
      supabaseAdmin.from("refinery_transactions")
        .select("direction, transaction_type, total_pure_weight, da_amount, status, buysell_kind, buysell_metal, buysell_weight, buysell_total, adjustment_metal, adjustment_delta")
        .eq("refinery_id", data.refineryId).gte("created_at", todayIso),
      supabaseAdmin.from("refinery_clients")
        .select("id, name, code, purity_balance, da_balance")
        .eq("refinery_id", data.refineryId)
        .or("purity_balance.lt.0,da_balance.lt.0")
        .order("name").limit(100),
      supabaseAdmin.from("refinery_transactions")
        .select("*, client:refinery_clients(name, code)")
        .eq("refinery_id", data.refineryId)
        .order("created_at", { ascending: false }).limit(10),
      supabaseAdmin.from("refinery_price_log")
        .select("gold_price, silver_price")
        .eq("refinery_id", data.refineryId)
        .order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    const clients = clientsR.data ?? [];
    const todayTx = todayTxR.data ?? [];

    // Last activity per negative client (one extra query, scoped to those ids)
    const negIds = (negR.data ?? []).map((c) => c.id);
    const lastActivity: Record<string, string | null> = {};
    if (negIds.length) {
      const { data: acts } = await supabaseAdmin
        .from("refinery_transactions")
        .select("client_id, transaction_date")
        .in("client_id", negIds)
        .order("transaction_date", { ascending: false });
      for (const a of (acts ?? []) as Array<{ client_id: string; transaction_date: string }>) {
        if (!(a.client_id in lastActivity)) lastActivity[a.client_id] = a.transaction_date;
      }
    }

    const sum = (arr: typeof todayTx, dir: string, type: string, field: "total_pure_weight" | "da_amount") =>
      arr.filter((t) => t.direction === dir && t.transaction_type === type && t.status === "settled")
        .reduce((s, t) => s + Number(t[field] ?? 0), 0);
    const sumBuySell = (kind: "buy" | "sell", metal: "gold" | "silver" | null, field: "buysell_weight" | "buysell_total") =>
      todayTx.filter((t) =>
        t.transaction_type === "buysell"
        && t.buysell_kind === kind
        && (metal === null || (t.buysell_metal ?? "gold") === metal),
      ).reduce((s, t) => s + Number(t[field] ?? 0), 0);

    // Aggregate ALL client balances for equity (positive stored = refinery owes client)
    let clientsOweGold = 0, refineryOwesGold = 0, clientsOweDa = 0, refineryOwesDa = 0;
    for (const c of clients) {
      const g = Number(c.purity_balance); const d = Number(c.da_balance);
      if (g < 0) clientsOweGold += -g; else refineryOwesGold += g;
      if (d < 0) clientsOweDa += -d; else refineryOwesDa += d;
    }

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
      todayBuyCount: todayTx.filter((t) => t.transaction_type === "buysell" && t.buysell_kind === "buy").length,
      todaySellCount: todayTx.filter((t) => t.transaction_type === "buysell" && t.buysell_kind === "sell").length,
      todayGoldBought: sumBuySell("buy", "gold", "buysell_weight"),
      todayGoldSold: sumBuySell("sell", "gold", "buysell_weight"),
      todaySilverBought: sumBuySell("buy", "silver", "buysell_weight"),
      todaySilverSold: sumBuySell("sell", "silver", "buysell_weight"),
      todayBuyTotal: sumBuySell("buy", null, "buysell_total"),
      todaySellTotal: sumBuySell("sell", null, "buysell_total"),
      todayAdjustCount: todayTx.filter((t) => t.transaction_type === "stock_adjustment").length,
      goldPrice: Number(priceR.data?.gold_price ?? 0),
      silverPrice: Number(priceR.data?.silver_price ?? 0),
      clientsOweGold, refineryOwesGold, clientsOweDa, refineryOwesDa,
      negativeClients: (negR.data ?? []).map((c) => ({
        ...c,
        last_activity: lastActivity[c.id] ?? null,
      })),
      recent: (recentR.data ?? []).map((r) => {
        const { client, ...rest } = r as typeof r & { client?: { name: string; code: string | null } };
        return { ...rest, client_name: client?.name ?? "", client_code: client?.code ?? null };
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
  | "settlement"
  | "buy_metal"
  | "sell_metal"
  | "adjustment"
  | "reversal";

export type StatementRow = {
  date: string;
  created_at: string;
  reference: string;
  type: StatementRowType;
  description: string;
  client_name: string | null;
  metal?: "gold" | "silver" | null;
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
  client: { id: string; name: string; code: string | null; phone: string | null };
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
      supabaseAdmin.from("refinery_clients")
        .select("id, name, code, phone, refinery_id, purity_balance, da_balance")
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
    } else {
      // No prior settled transactions: fall back to the client's stored opening
      // balance (used for imported clients / fresh data with no transactions yet).
      openingGold = Number((cli as { purity_balance?: number | string | null }).purity_balance ?? 0);
      openingDa = Number((cli as { da_balance?: number | string | null }).da_balance ?? 0);
    }

    // Transactions in window (settled)
    const { data: txs, error: tErr } = await supabaseAdmin
      .from("refinery_transactions")
      .select("id, transaction_number, transaction_date, settled_at, direction, transaction_type, total_pure_weight, total_gross_weight, average_purity, fee_price, total_refining_fee, da_amount, previous_purity_balance, new_purity_balance, previous_da_balance, new_da_balance, settlement_kind, settlement_role, settlement_amount, settlement_apply_fee, counterparty_client_id, buysell_kind, buysell_metal, buysell_settlement, buysell_weight, buysell_total")
      .eq("client_id", data.clientId)
      .eq("status", "settled")
      .neq("transaction_type", "stock_adjustment")
      .gte("settled_at", fromTs)
      .lte("settled_at", toTs)
      .order("settled_at", { ascending: true });
    if (tErr) throw new Error(tErr.message);

    // Resolve counterparty names for settlements (single batch)
    const counterIds = Array.from(new Set((txs ?? [])
      .map((t: any) => t.counterparty_client_id)
      .filter((x: any): x is string => !!x)));
    const counterMap = new Map<string, string>();
    if (counterIds.length > 0) {
      const { data: others } = await supabaseAdmin
        .from("refinery_clients").select("id, name, code").in("id", counterIds);
      for (const o of others ?? []) {
        const oc = (o as { code?: string | null }).code ?? null;
        counterMap.set(o.id, oc ? `${oc} (${o.name})` : o.name);
      }
    }

    // Client label format: `CODE (Name)` — code first, name in parentheses.
    const cliCode = (cli as { code?: string | null }).code ?? null;
    const cliLabel = cliCode ? `${cliCode} (${cli.name})` : cli.name;

    const rows: StatementRow[] = [];
    let totalGoldRecv = 0, totalGoldDeliv = 0, totalDaRecv = 0, totalDaPaid = 0, totalFees = 0;

    for (const tx of txs ?? []) {
      const dateStr = tx.transaction_date ?? String(tx.settled_at).slice(0, 10);
      const refn = tx.transaction_number;
      const runGold = Number(tx.new_purity_balance ?? 0);
      const runDa = Number(tx.new_da_balance ?? 0);

      if (tx.transaction_type === "settlement") {
        const kind = (tx as any).settlement_kind as "gold" | "da" | null;
        const role = (tx as any).settlement_role as "from" | "to" | null;
        const amount = Number((tx as any).settlement_amount) || 0;
        const fee = Number(tx.total_refining_fee) || 0;
        const counterName = (tx as any).counterparty_client_id
          ? counterMap.get((tx as any).counterparty_client_id) ?? "Other client"
          : "Other client";
        const isFrom = role === "from";
        const descPrefix = isFrom ? `Settlement → ${counterName}` : `Settlement ← ${counterName}`;

        let goldDebit = 0, goldCredit = 0, daDebit = 0, daCredit = 0;
        if (kind === "gold") {
          if (isFrom) { goldDebit = amount; totalGoldDeliv += amount; }
          else { goldCredit = amount; totalGoldRecv += amount; }
        } else if (kind === "da") {
          if (isFrom) { daDebit = amount; totalDaPaid += amount; }
          else { daCredit = amount; totalDaRecv += amount; }
        }

        rows.push({
          date: dateStr, created_at: String(tx.settled_at),
          reference: refn, type: "settlement",
          description: descPrefix,
          client_name: cliLabel,
          gold_debit: goldDebit, gold_credit: goldCredit,
          da_debit: daDebit, da_credit: daCredit,
          running_gold: runGold, running_da: runDa,
          original_weight: kind === "gold" ? amount : undefined,
          fee_price: fee > 0 ? Number(tx.fee_price) || 0 : undefined,
          fee_total: fee > 0 ? fee : undefined,
          weight_at_730: kind === "gold" && fee > 0 ? (amount * 1000) / 730 : undefined,
        });

        if (fee > 0 && !isFrom) {
          totalFees += fee;
        }
      } else if (tx.transaction_type === "gold" && tx.direction === "receiving") {
        const gold = Number(tx.total_pure_weight) || 0;
        totalGoldRecv += gold;
        rows.push({
          date: dateStr, created_at: String(tx.settled_at),
          reference: refn, type: "gold_received",
          description: `Gold Received — ${cliLabel}`,
          client_name: cliLabel,
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
            description: `Refining Fee — ${cliLabel}`,
            client_name: cliLabel,
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
          description: `Gold Delivered — ${cliLabel}`,
          client_name: cliLabel,
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
          description: `DA Payment Received — ${cliLabel}`,
          client_name: cliLabel,
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
          description: `DA Payment Paid — ${cliLabel}`,
          client_name: cliLabel,
          gold_debit: 0, gold_credit: 0,
          da_debit: da, da_credit: 0,
          running_gold: runGold, running_da: runDa,
        });
      } else if (tx.transaction_type === "buysell" && (tx as any).buysell_settlement === "settlement") {
        const metal = ((tx as any).buysell_metal ?? "gold") as "gold" | "silver";
        const kind = (tx as any).buysell_kind as "buy" | "sell";
        const weight = Number((tx as any).buysell_weight) || 0;
        const total = Number((tx as any).buysell_total) || 0;
        const isBuy = kind === "buy";
        // Buy: refinery owes client → DA credit. Sell: client owes refinery → DA debit.
        const daDebit = isBuy ? 0 : total;
        const daCredit = isBuy ? total : 0;
        if (isBuy) totalDaRecv += 0; // not a DA receipt from the client's POV
        rows.push({
          date: dateStr, created_at: String(tx.settled_at),
          reference: refn,
          type: isBuy ? "buy_metal" : "sell_metal",
          description: `${isBuy ? "Bought" : "Sold"} ${metal === "gold" ? "Gold" : "Silver"} — ${weight.toFixed(2)} g`,
          client_name: cliLabel,
          metal,
          gold_debit: 0, gold_credit: 0,
          da_debit: daDebit, da_credit: daCredit,
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
      client: { id: cli.id, name: cli.name, code: (cli as { code?: string | null }).code ?? null, phone: cli.phone ?? null },
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
    silver_stock: number;
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
      if (r.client_id && !lastByClient.has(r.client_id)) lastByClient.set(r.client_id, r.transaction_date);
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
        silver_stock: Number((stockR.data as { silver_stock?: number } | null)?.silver_stock ?? 0),
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
      _notes: data.notes ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true, transactionId: txId as string };
  });

export const editStockAdjustment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      metal: z.enum(["gold", "silver", "da"]),
      kind: z.enum(["add", "remove", "correction", "loss", "manual"]),
      amount: z.number().positive(),
      date: z.string().min(8).max(32),
      notes: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Verify access via the tx's refinery
    const { data: tx, error: txErr } = await supabaseAdmin
      .from("refinery_transactions")
      .select("refinery_id, transaction_type")
      .eq("id", data.id)
      .maybeSingle();
    if (txErr) throw new Error(txErr.message);
    if (!tx) throw new Error("Transaction not found");
    if (tx.transaction_type !== "stock_adjustment") throw new Error("Not a stock adjustment");
    await assertAccess(context.userId, tx.refinery_id as string);

    const signed = data.kind === "remove" || data.kind === "loss" ? -data.amount : data.amount;
    const { error } = await supabaseAdmin.rpc("refinery_edit_stock_adjustment", {
      _tx_id: data.id,
      _metal: data.metal,
      _kind: data.kind,
      _delta: signed,
      _date: data.date,
      _notes: data.notes ?? "",
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Buy / Sell Gold (DA-priced)
// =========================================================
export const createBuySell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      clientId: z.string().uuid(),
      kind: z.enum(["buy", "sell"]),
      metal: z.enum(["gold", "silver"]).default("gold"),
      settlement: z.enum(["settlement", "cash"]),
      weight: z.number().positive(),
      purity: z.number().min(0).max(1000).optional().nullable(),
      pricePerGram: z.number().nonnegative(),
      date: z.string().optional().nullable(),
      notes: z.string().max(2000).optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: txId, error } = await supabaseAdmin.rpc("refinery_create_buysell", {
      _refinery_id: data.refineryId,
      _client_id: data.clientId,
      _kind: data.kind,
      _settlement: data.settlement,
      _weight: data.weight,
      _purity: data.purity ?? 1000,
      _price_per_gram: data.pricePerGram,
      _date: data.date ?? new Date().toISOString().slice(0, 10),
      _notes: data.notes ?? "",
      _metal: data.metal,
    });
    if (error) throw new Error(error.message);
    return { ok: true, transactionId: txId as string };
  });

export const updateBuySell = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      id: z.string().uuid(),
      notes: z.string().max(2000).optional().nullable(),
      date: z.string().optional().nullable(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    // Admin only — financial fields are immutable, only metadata can change.
    await assertAdmin(context.userId);
    const patch: { notes?: string | null; transaction_date?: string } = {};
    if (data.notes !== undefined) patch.notes = data.notes;
    if (data.date) patch.transaction_date = data.date;
    if (Object.keys(patch).length === 0) return { ok: true };
    const { error } = await supabaseAdmin
      .from("refinery_transactions")
      .update(patch)
      .eq("id", data.id)
      .eq("transaction_type", "buysell");
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Net Position — price log
// =========================================================
export type NetPositionPrice = {
  goldPrice: number;
  silverPrice: number;
  setBy: string | null;
  setByUsername: string | null;
  setAt: string | null;
};

export const getNetPositionPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<NetPositionPrice> => {
    await assertAccess(context.userId, data.refineryId);
    const { data: row, error } = await supabaseAdmin
      .from("refinery_price_log")
      .select("gold_price, silver_price, set_by, set_by_username, created_at")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return { goldPrice: 0, silverPrice: 0, setBy: null, setByUsername: null, setAt: null };
    return {
      goldPrice: Number(row.gold_price),
      silverPrice: Number(row.silver_price),
      setBy: row.set_by,
      setByUsername: row.set_by_username ?? null,
      setAt: row.created_at,
    };
  });

export const saveNetPositionPrice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      goldPrice: z.number().min(0),
      silverPrice: z.number().min(0),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    // resolve username
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles").select("username").eq("id", context.userId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("refinery_price_log")
      .insert({
        refinery_id: data.refineryId,
        gold_price: data.goldPrice,
        silver_price: data.silverPrice,
        set_by: context.userId,
        set_by_username: prof?.username ?? null,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Net Position — daily snapshots
// =========================================================
export type PositionSnapshot = {
  id: string;
  snapshotDate: string;
  pureGoldStock: number;
  silverStock: number;
  daCashBalance: number;
  netGoldPosition: number;
  goldPrice: number | null;
  silverPrice: number | null;
  createdByUsername: string | null;
  createdAt: string;
};

export const listPositionSnapshots = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      limit: z.number().int().min(1).max(365).optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }): Promise<PositionSnapshot[]> => {
    await assertAccess(context.userId, data.refineryId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_position_snapshots")
      .select("id, snapshot_date, pure_gold_stock, silver_stock, da_cash_balance, net_gold_position, gold_price, silver_price, created_by_username, created_at")
      .eq("refinery_id", data.refineryId)
      .order("snapshot_date", { ascending: false })
      .limit(data.limit ?? 60);
    if (error) throw new Error(error.message);
    return (rows ?? []).map((r) => ({
      id: r.id,
      snapshotDate: r.snapshot_date,
      pureGoldStock: Number(r.pure_gold_stock),
      silverStock: Number(r.silver_stock),
      daCashBalance: Number(r.da_cash_balance),
      netGoldPosition: Number(r.net_gold_position),
      goldPrice: r.gold_price == null ? null : Number(r.gold_price),
      silverPrice: r.silver_price == null ? null : Number(r.silver_price),
      createdByUsername: r.created_by_username,
      createdAt: r.created_at,
    }));
  });

export const recordPositionSnapshot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      pureGoldStock: z.number(),
      silverStock: z.number(),
      daCashBalance: z.number(),
      netGoldPosition: z.number(),
      goldPrice: z.number().nullable().optional(),
      silverPrice: z.number().nullable().optional(),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles").select("username").eq("id", context.userId).maybeSingle();
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await supabaseAdmin
      .from("refinery_position_snapshots")
      .upsert(
        {
          refinery_id: data.refineryId,
          snapshot_date: today,
          pure_gold_stock: data.pureGoldStock,
          silver_stock: data.silverStock,
          da_cash_balance: data.daCashBalance,
          net_gold_position: data.netGoldPosition,
          gold_price: data.goldPrice ?? null,
          silver_price: data.silverPrice ?? null,
          created_by: context.userId,
          created_by_username: prof?.username ?? null,
        },
        { onConflict: "refinery_id,snapshot_date" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Client notes
// =========================================================
export type RefineryClientNote = {
  id: string;
  client_id: string;
  refinery_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  created_at: string;
};

export const listClientNotes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ refineryId: z.string().uuid(), clientId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }): Promise<RefineryClientNote[]> => {
    await assertAccess(context.userId, data.refineryId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_client_notes")
      .select("*")
      .eq("client_id", data.clientId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as RefineryClientNote[];
  });

export const addClientNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({
      refineryId: z.string().uuid(),
      clientId: z.string().uuid(),
      body: z.string().min(1).max(2000),
    }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAccess(context.userId, data.refineryId);
    const { data: prof } = await supabaseAdmin
      .from("swap_profiles").select("username").eq("id", context.userId).maybeSingle();
    const { error } = await supabaseAdmin
      .from("refinery_client_notes")
      .insert({
        refinery_id: data.refineryId,
        client_id: data.clientId,
        author_id: context.userId,
        author_name: prof?.username ?? "",
        body: data.body,
      });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteClientNote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: row, error: fErr } = await supabaseAdmin
      .from("refinery_client_notes").select("refinery_id").eq("id", data.id).single();
    if (fErr) throw new Error(fErr.message);
    await assertAccess(context.userId, row.refinery_id);
    const { error } = await supabaseAdmin.from("refinery_client_notes").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// =========================================================
// Backup module
// =========================================================
export type RefineryBackupKind = "manual" | "scheduled" | "safety";
export type RefineryBackupMeta = {
  id: string;
  refinery_id: string;
  file_name: string;
  file_size_bytes: number;
  kind: RefineryBackupKind;
  schema_version: number;
  created_by: string | null;
  created_by_email: string | null;
  created_at: string;
};
export type RefineryBackupSettings = {
  refinery_id: string;
  daily_enabled: boolean;
  daily_time: string;
  keep_last: number;
  updated_at: string;
  updated_by: string | null;
};
export type RefineryAuditLogRow = {
  id: string;
  refinery_id: string | null;
  user_id: string | null;
  user_email: string | null;
  action: string;
  file_name: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  details: any;
  ip: string | null;
  user_agent: string | null;
  created_at: string;
};
/* eslint-disable @typescript-eslint/no-explicit-any */
export type RefineryBackupPayload = {
  schema_version: number;
  created_at: string;
  refinery: { id: string; name: string; status: string };
  stock: any;
  clients: any[];
  transactions: any[];
  gold_bars: any[];
  stock_movements: any[];
  client_notes: any[];
  price_log: any[];
  position_snapshots: any[];
  settings: any;
};
/* eslint-enable @typescript-eslint/no-explicit-any */

async function getActorContext(uid: string) {
  const { data: prof } = await supabaseAdmin
    .from("swap_profiles").select("username, email").eq("id", uid).maybeSingle();
  const email = (prof?.email as string | undefined) ?? (prof?.username as string | undefined) ?? null;
  return { email };
}

async function writeAudit(opts: {
  refineryId: string | null;
  userId: string | null;
  userEmail: string | null;
  action: string;
  fileName?: string | null;
  details?: unknown;
}) {
  let ip: string | null = null;
  let ua: string | null = null;
  try {
    const mod = await import("./refineries-request.server");
    const meta = mod.getRequestMeta();
    ip = meta.ip;
    ua = meta.ua;
  } catch { /* outside request scope (e.g. cron) */ }
  await supabaseAdmin.from("refinery_audit_log").insert({
    refinery_id: opts.refineryId,
    user_id: opts.userId,
    user_email: opts.userEmail,
    action: opts.action,
    file_name: opts.fileName ?? null,
    details: (opts.details ?? null) as never,
    ip, user_agent: ua,
  });
}

function backupFileName(refineryId: string, ts: Date, ext: "json" | "zip" = "json"): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const ymd = `${ts.getFullYear()}-${pad(ts.getMonth()+1)}-${pad(ts.getDate())}-${pad(ts.getHours())}-${pad(ts.getMinutes())}`;
  const shortId = refineryId.slice(0, 4);
  return `ather-refinery-${shortId}-backup-${ymd}.${ext}`;
}

async function snapshotRefinery(refineryId: string): Promise<RefineryBackupPayload> {
  const [refRes, stockRes, clientsRes, txRes, barsRes, mvRes, notesRes, plogRes, snapsRes, settingsRes] = await Promise.all([
    supabaseAdmin.from("refineries").select("*").eq("id", refineryId).single(),
    supabaseAdmin.from("refinery_stock").select("*").eq("refinery_id", refineryId).maybeSingle(),
    supabaseAdmin.from("refinery_clients").select("*").eq("refinery_id", refineryId),
    supabaseAdmin.from("refinery_transactions").select("*").eq("refinery_id", refineryId),
    supabaseAdmin.from("refinery_transaction_gold_bars").select("*, refinery_transactions!inner(refinery_id)").eq("refinery_transactions.refinery_id", refineryId),
    supabaseAdmin.from("refinery_stock_movements").select("*").eq("refinery_id", refineryId),
    supabaseAdmin.from("refinery_client_notes").select("*").eq("refinery_id", refineryId),
    supabaseAdmin.from("refinery_price_log").select("*").eq("refinery_id", refineryId),
    supabaseAdmin.from("refinery_position_snapshots").select("*").eq("refinery_id", refineryId),
    supabaseAdmin.from("refinery_backup_settings").select("*").eq("refinery_id", refineryId).maybeSingle(),
  ]);
  if (refRes.error) throw new Error(refRes.error.message);
  const bars = (barsRes.data ?? []).map((r: Record<string, unknown>) => {
    const copy = { ...r };
    delete (copy as Record<string, unknown>).refinery_transactions;
    return copy;
  });
  return {
    schema_version: 1,
    created_at: new Date().toISOString(),
    refinery: refRes.data as { id: string; name: string; status: string },
    stock: (stockRes.data ?? null) as Record<string, unknown> | null,
    clients: (clientsRes.data ?? []) as Record<string, unknown>[],
    transactions: (txRes.data ?? []) as Record<string, unknown>[],
    gold_bars: bars,
    stock_movements: (mvRes.data ?? []) as Record<string, unknown>[],
    client_notes: (notesRes.data ?? []) as Record<string, unknown>[],
    price_log: (plogRes.data ?? []) as Record<string, unknown>[],
    position_snapshots: (snapsRes.data ?? []) as Record<string, unknown>[],
    settings: (settingsRes.data ?? null) as Record<string, unknown> | null,
  };
}

async function pruneBackups(refineryId: string) {
  const { data: settings } = await supabaseAdmin
    .from("refinery_backup_settings").select("keep_last").eq("refinery_id", refineryId).maybeSingle();
  const keep = Math.max(1, Math.min(500, (settings?.keep_last as number) ?? 30));
  const { data: rows } = await supabaseAdmin
    .from("refinery_backups")
    .select("id, kind, created_at")
    .eq("refinery_id", refineryId)
    .neq("kind", "safety")
    .order("created_at", { ascending: false });
  const ids = (rows ?? []).slice(keep).map((r) => (r as { id: string }).id);
  if (ids.length) {
    await supabaseAdmin.from("refinery_backups").delete().in("id", ids);
  }
}

async function createBackupInternal(opts: {
  refineryId: string;
  kind: RefineryBackupKind;
  userId: string | null;
  userEmail: string | null;
}): Promise<RefineryBackupMeta> {
  const payload = await snapshotRefinery(opts.refineryId);
  const sizeBytes = Buffer.byteLength(JSON.stringify(payload), "utf8");
  const fileName = backupFileName(opts.refineryId, new Date());
  const { data, error } = await supabaseAdmin
    .from("refinery_backups")
    .insert({
      refinery_id: opts.refineryId,
      file_name: fileName,
      file_size_bytes: sizeBytes,
      kind: opts.kind,
      schema_version: payload.schema_version,
      payload: payload as never,
      created_by: opts.userId,
      created_by_email: opts.userEmail,
    })
    .select("id, refinery_id, file_name, file_size_bytes, kind, schema_version, created_by, created_by_email, created_at")
    .single();
  if (error) throw new Error(error.message);
  await pruneBackups(opts.refineryId);
  await writeAudit({
    refineryId: opts.refineryId,
    userId: opts.userId,
    userEmail: opts.userEmail,
    action: "backup_created",
    fileName,
    details: { kind: opts.kind, size: sizeBytes },
  });
  return data as RefineryBackupMeta;
}

export const createBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { email } = await getActorContext(context.userId);
    return createBackupInternal({
      refineryId: data.refineryId,
      kind: "manual",
      userId: context.userId,
      userEmail: email,
    });
  });

export const listBackups = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RefineryBackupMeta[]> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_backups")
      .select("id, refinery_id, file_name, file_size_bytes, kind, schema_version, created_by, created_by_email, created_at")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (rows ?? []) as RefineryBackupMeta[];
  });

export const getBackupPayload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ backupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { email } = await getActorContext(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("refinery_backups")
      .select("id, refinery_id, file_name, payload")
      .eq("id", data.backupId)
      .single();
    if (error) throw new Error(error.message);
    await writeAudit({
      refineryId: row.refinery_id as string,
      userId: context.userId,
      userEmail: email,
      action: "backup_downloaded",
      fileName: row.file_name as string,
    });
    return {
      id: row.id as string,
      refinery_id: row.refinery_id as string,
      file_name: row.file_name as string,
      payload: row.payload as RefineryBackupPayload,
    };
  });

export const deleteBackup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ backupId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { email } = await getActorContext(context.userId);
    const { data: row, error: fErr } = await supabaseAdmin
      .from("refinery_backups").select("refinery_id, file_name").eq("id", data.backupId).single();
    if (fErr) throw new Error(fErr.message);
    const { error } = await supabaseAdmin.from("refinery_backups").delete().eq("id", data.backupId);
    if (error) throw new Error(error.message);
    await writeAudit({
      refineryId: row.refinery_id as string,
      userId: context.userId,
      userEmail: email,
      action: "backup_deleted",
      fileName: row.file_name as string,
    });
    return { ok: true };
  });

async function performRestore(opts: {
  refineryId: string;
  payload: RefineryBackupPayload;
  userId: string;
  userEmail: string | null;
  sourceFileName: string;
}) {
  if (!opts.payload || opts.payload.schema_version !== 1) {
    throw new Error("Invalid or unsupported backup file.");
  }
  if (opts.payload.refinery?.id !== opts.refineryId) {
    throw new Error("Backup does not belong to this refinery.");
  }
  // Safety backup BEFORE restore
  const safety = await createBackupInternal({
    refineryId: opts.refineryId,
    kind: "safety",
    userId: opts.userId,
    userEmail: opts.userEmail,
  });
  await writeAudit({
    refineryId: opts.refineryId,
    userId: opts.userId,
    userEmail: opts.userEmail,
    action: "restore_started",
    fileName: opts.sourceFileName,
    details: { safety_backup_id: safety.id },
  });
  // Call atomic RPC
  const { error } = await supabaseAdmin.rpc("refinery_restore_from_payload", {
    _refinery_id: opts.refineryId,
    _payload: opts.payload as never,
  });
  if (error) {
    await writeAudit({
      refineryId: opts.refineryId,
      userId: opts.userId,
      userEmail: opts.userEmail,
      action: "restore_failed",
      fileName: opts.sourceFileName,
      details: { error: error.message, safety_backup_id: safety.id },
    });
    throw new Error(`Restore failed (no changes applied): ${error.message}`);
  }
  await writeAudit({
    refineryId: opts.refineryId,
    userId: opts.userId,
    userEmail: opts.userEmail,
    action: "restore_completed",
    fileName: opts.sourceFileName,
    details: { safety_backup_id: safety.id },
  });
  return { ok: true, safetyBackupId: safety.id };
}

export const restoreBackupFromHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    backupId: z.string().uuid(),
    confirmText: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.confirmText !== "RESTORE") throw new Error('Type "RESTORE" to confirm.');
    const { email } = await getActorContext(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("refinery_backups").select("refinery_id, file_name, payload").eq("id", data.backupId).single();
    if (error) throw new Error(error.message);
    return performRestore({
      refineryId: row.refinery_id as string,
      payload: row.payload as RefineryBackupPayload,
      userId: context.userId,
      userEmail: email,
      sourceFileName: row.file_name as string,
    });
  });

export const restoreBackupFromFile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    refineryId: z.string().uuid(),
    payload: z.unknown(),
    sourceFileName: z.string().max(300),
    confirmText: z.string(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    if (data.confirmText !== "RESTORE") throw new Error('Type "RESTORE" to confirm.');
    const { email } = await getActorContext(context.userId);
    return performRestore({
      refineryId: data.refineryId,
      payload: data.payload as RefineryBackupPayload,
      userId: context.userId,
      userEmail: email,
      sourceFileName: data.sourceFileName,
    });
  });

export const getBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ refineryId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }): Promise<RefineryBackupSettings> => {
    await assertAdmin(context.userId);
    const { data: row } = await supabaseAdmin
      .from("refinery_backup_settings").select("*").eq("refinery_id", data.refineryId).maybeSingle();
    if (row) return row as RefineryBackupSettings;
    return {
      refinery_id: data.refineryId,
      daily_enabled: false,
      daily_time: "02:00",
      keep_last: 30,
      updated_at: new Date().toISOString(),
      updated_by: null,
    };
  });

export const updateBackupSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    refineryId: z.string().uuid(),
    daily_enabled: z.boolean(),
    daily_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/),
    keep_last: z.number().int().min(1).max(500),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { email } = await getActorContext(context.userId);
    const time = data.daily_time.length === 5 ? `${data.daily_time}:00` : data.daily_time;
    const { error } = await supabaseAdmin.from("refinery_backup_settings").upsert({
      refinery_id: data.refineryId,
      daily_enabled: data.daily_enabled,
      daily_time: time,
      keep_last: data.keep_last,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await writeAudit({
      refineryId: data.refineryId,
      userId: context.userId,
      userEmail: email,
      action: "settings_updated",
      details: { daily_enabled: data.daily_enabled, daily_time: time, keep_last: data.keep_last },
    });
    return { ok: true };
  });

export const listAuditLog = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({
    refineryId: z.string().uuid(),
    limit: z.number().int().min(1).max(500).default(100),
  }).parse(d))
  .handler(async ({ data, context }): Promise<RefineryAuditLogRow[]> => {
    await assertAdmin(context.userId);
    const { data: rows, error } = await supabaseAdmin
      .from("refinery_audit_log")
      .select("*")
      .eq("refinery_id", data.refineryId)
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return (rows ?? []) as RefineryAuditLogRow[];
  });

// Internal helper for cron — not exposed as serverFn
export async function runScheduledBackups(now: Date = new Date()) {
  const hh = String(now.getHours()).padStart(2, "0");
  const { data: rows } = await supabaseAdmin
    .from("refinery_backup_settings")
    .select("refinery_id, daily_enabled, daily_time")
    .eq("daily_enabled", true);
  const due = (rows ?? []).filter((r) => {
    const t = (r as { daily_time: string }).daily_time ?? "";
    return t.slice(0, 2) === hh;
  });
  const results: { refinery_id: string; ok: boolean; error?: string }[] = [];
  for (const r of due) {
    const rid = (r as { refinery_id: string }).refinery_id;
    try {
      await createBackupInternal({ refineryId: rid, kind: "scheduled", userId: null, userEmail: "system@cron" });
      results.push({ refinery_id: rid, ok: true });
    } catch (e) {
      results.push({ refinery_id: rid, ok: false, error: e instanceof Error ? e.message : "unknown" });
    }
  }
  return { processed: due.length, results };
}
