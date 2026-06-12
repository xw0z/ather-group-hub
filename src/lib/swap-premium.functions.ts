import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { recordAudit } from "@/lib/swap-audit.server";
import { assertPermission } from "@/lib/permissions.functions";


export const TROY_OZ_PER_GRAM = 0.0321507466;

export type PremiumKind = "add" | "remove" | "adjust" | "discount" | "premium";

export type PremiumCompany = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type PremiumTx = {
  id: string;
  company_id: string;
  kind: PremiumKind;
  grams: number;
  per_oz: number | null;
  amount_usd: number | null;
  notes: string | null;
  username: string;
  created_at: string;
};

export type CompanySummary = {
  company: PremiumCompany;
  total_balance_grams: number;
  dp_grams: number; // combined discount + premium grams
  clean_remaining_grams: number;
  dp_charges_usd: number; // combined discount + premium $ charges
  tx_count: number;
};

export const listPremiumCompanies = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertPermission(userId, "premium", "view");

    const { data: companies, error } = await supabase
      .from("swap_premium_companies")
      .select("*")
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);

    const { data: txs, error: e2 } = await supabase
      .from("swap_premium_transactions")
      .select("*");
    if (e2) throw new Error(e2.message);

    const summaries: CompanySummary[] = (companies ?? []).map((c) => {
      const list = (txs ?? []).filter((t) => t.company_id === c.id);
      let bal = 0,
        dp_g = 0,
        dp_usd = 0;
      for (const t of list) {
        const g = Number(t.grams) || 0;
        const usd = Number(t.amount_usd) || 0;
        if (t.kind === "add") bal += g;
        else if (t.kind === "remove") bal -= g;
        else if (t.kind === "adjust") bal += g;
        else if (t.kind === "discount" || t.kind === "premium") {
          dp_g += g;
          dp_usd += usd;
        }
      }
      return {
        company: c as PremiumCompany,
        total_balance_grams: bal,
        dp_grams: dp_g,
        clean_remaining_grams: bal - dp_g,
        dp_charges_usd: dp_usd,
        tx_count: list.length,
      };
    });
    return summaries;
  });

export const listCompanyTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { companyId: string }) =>
    z.object({ companyId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: txs, error } = await supabase
      .from("swap_premium_transactions")
      .select("*")
      .eq("company_id", data.companyId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (txs ?? []) as PremiumTx[];
  });

const ListAllInput = z
  .object({
    limit: z.number().int().min(1).max(1000).optional(),
    offset: z.number().int().min(0).optional(),
    fromDate: z.string().optional(), // YYYY-MM-DD
    toDate: z.string().optional(),   // YYYY-MM-DD (inclusive)
  })
  .optional();

export const listAllTransactions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof ListAllInput>) => ListAllInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const limit = data?.limit ?? 200;
    const offset = data?.offset ?? 0;
    let q = supabase
      .from("swap_premium_transactions")
      .select("*", { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (data?.fromDate) q = q.gte("created_at", `${data.fromDate}T00:00:00.000Z`);
    if (data?.toDate) q = q.lte("created_at", `${data.toDate}T23:59:59.999Z`);
    const { data: rows, error, count } = await q;
    if (error) throw new Error(error.message);
    return {
      rows: (rows ?? []) as PremiumTx[],
      total: count ?? rows?.length ?? 0,
      limit,
      offset,
    };
  });

export const createPremiumCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { name: string }) =>
    z.object({ name: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertPermission(userId, "premium", "create");

    const { data: row, error } = await supabase
      .from("swap_premium_companies")
      .insert({ name: data.name.trim(), created_by: userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await recordAudit({
      userId,
      module: "premium",
      action: "premium_company_created",
      entity_type: "premium_company",
      entity_id: row.id,
      new_values: { name: data.name.trim() },
    });
    return row as PremiumCompany;
  });

export const renamePremiumCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string; name: string }) =>
    z.object({ id: z.string().uuid(), name: z.string().min(1).max(120) }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertPermission(userId, "premium", "edit");

    const { data: prev } = await supabase
      .from("swap_premium_companies")
      .select("name")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase
      .from("swap_premium_companies")
      .update({ name: data.name.trim() })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit({
      userId,
      module: "premium",
      action: "premium_company_updated",
      entity_type: "premium_company",
      entity_id: data.id,
      old_values: prev ?? null,
      new_values: { name: data.name.trim() },
    });
    return { ok: true };
  });

export const deletePremiumCompany = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertPermission(userId, "premium", "delete");

    const { data: prev } = await supabase
      .from("swap_premium_companies")
      .select("name")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase
      .from("swap_premium_companies")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit({
      userId,
      module: "premium",
      action: "premium_company_deleted",
      entity_type: "premium_company",
      entity_id: data.id,
      old_values: prev ?? null,
    });
    return { ok: true };
  });

const TxInput = z.object({
  company_id: z.string().uuid(),
  kind: z.enum(["add", "remove", "adjust", "discount", "premium"]),
  grams: z.number().finite(),
  per_oz: z.number().finite().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const createPremiumTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof TxInput>) => TxInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertPermission(userId, "premium", "create");


    // Resolve username
    const { data: prof } = await supabase
      .from("swap_profiles")
      .select("username")
      .eq("id", userId)
      .maybeSingle();
    const username = prof?.username ?? "unknown";

    let grams = Math.abs(data.grams);
    // For adjust, allow signed
    if (data.kind === "adjust") grams = data.grams;

    let per_oz: number | null = null;
    let amount_usd: number | null = null;
    if (data.kind === "discount" || data.kind === "premium") {
      const p = Number(data.per_oz ?? 0);
      if (!Number.isFinite(p) || p <= 0) {
        throw new Error("Price per oz must be greater than 0 for discount or premium transactions.");
      }
      per_oz = p;
      const ounces = Math.abs(grams) * TROY_OZ_PER_GRAM;
      amount_usd = ounces * p;
    }


    const { data: row, error } = await supabase
      .from("swap_premium_transactions")
      .insert({
        company_id: data.company_id,
        kind: data.kind,
        grams,
        per_oz,
        amount_usd,
        notes: data.notes ?? null,
        created_by: userId,
        username,
      })
      .select()
      .single();
    if (error) throw new Error(error.message);
    await recordAudit({
      userId,
      module: "premium",
      action: "premium_tx_created",
      entity_type: "premium_tx",
      entity_id: row.id,
      new_values: {
        company_id: data.company_id,
        kind: data.kind,
        grams,
        per_oz,
        amount_usd,
        notes: data.notes ?? null,
      },
    });
    return row as PremiumTx;
  });

export const deletePremiumTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { id: string }) =>
    z.object({ id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertPermission(userId, "premium", "delete");

    const { data: prev } = await supabase
      .from("swap_premium_transactions")
      .select("company_id, kind, grams, per_oz, amount_usd, notes")
      .eq("id", data.id)
      .maybeSingle();
    const { error } = await supabase
      .from("swap_premium_transactions")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await recordAudit({
      userId,
      module: "premium",
      action: "premium_tx_deleted",
      entity_type: "premium_tx",
      entity_id: data.id,
      old_values: prev ?? null,
    });
    return { ok: true };
  });

const UpdateTxInput = z.object({
  id: z.string().uuid(),
  company_id: z.string().uuid(),
  kind: z.enum(["add", "remove", "adjust", "discount", "premium"]),
  grams: z.number().finite(),
  per_oz: z.number().finite().nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});

export const updatePremiumTransaction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: z.infer<typeof UpdateTxInput>) => UpdateTxInput.parse(input))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    await assertPermission(userId, "premium", "edit");


    const { data: prev, error: prevErr } = await supabase
      .from("swap_premium_transactions")
      .select("*")
      .eq("id", data.id)
      .maybeSingle();
    if (prevErr) throw new Error(prevErr.message);
    if (!prev) throw new Error("Transaction not found");

    let grams = Math.abs(data.grams);
    if (data.kind === "adjust") grams = data.grams;

    let per_oz: number | null = null;
    let amount_usd: number | null = null;
    if (data.kind === "discount" || data.kind === "premium") {
      const p = Number(data.per_oz ?? 0);
      if (!Number.isFinite(p) || p <= 0) {
        throw new Error("Price per oz must be greater than 0 for discount or premium transactions.");
      }
      per_oz = p;
      const ounces = Math.abs(grams) * TROY_OZ_PER_GRAM;
      amount_usd = ounces * p;
    }


    const newValues = {
      company_id: data.company_id,
      kind: data.kind,
      grams,
      per_oz,
      amount_usd,
      notes: data.notes ?? null,
    };

    const { data: row, error } = await supabase
      .from("swap_premium_transactions")
      .update(newValues)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);

    await recordAudit({
      userId,
      module: "premium",
      action: "premium_tx_updated",
      entity_type: "premium_tx",
      entity_id: data.id,
      old_values: {
        company_id: prev.company_id,
        kind: prev.kind,
        grams: prev.grams,
        per_oz: prev.per_oz,
        amount_usd: prev.amount_usd,
        notes: prev.notes,
      },
      new_values: newValues,
    });
    return row as PremiumTx;
  });
