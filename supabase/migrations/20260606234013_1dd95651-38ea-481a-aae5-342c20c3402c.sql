
-- =========================================================
-- REFINERIES MODULE — initial schema
-- =========================================================

-- Enums
DO $$ BEGIN
  CREATE TYPE public.refinery_role AS ENUM ('manager','staff','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refinery_tx_direction AS ENUM ('receiving','delivery');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refinery_tx_type AS ENUM ('da','gold');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refinery_tx_status AS ENUM ('draft','pending','settled','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refinery_bar_type AS ENUM ('bar','scrap');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.refinery_movement_type AS ENUM (
    'receiving_da','delivery_da','receiving_gold','delivery_gold','adjustment','reversal'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- =========================================================
-- updated_at trigger helper (reuse existing if present)
-- =========================================================
CREATE OR REPLACE FUNCTION public.refinery_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

-- =========================================================
-- refineries
-- =========================================================
CREATE TABLE IF NOT EXISTS public.refineries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.refineries TO authenticated;
GRANT ALL ON public.refineries TO service_role;
ALTER TABLE public.refineries ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_refineries_touch ON public.refineries;
CREATE TRIGGER trg_refineries_touch BEFORE UPDATE ON public.refineries
FOR EACH ROW EXECUTE FUNCTION public.refinery_touch_updated_at();

-- =========================================================
-- refinery_users
-- =========================================================
CREATE TABLE IF NOT EXISTS public.refinery_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  role public.refinery_role NOT NULL DEFAULT 'staff',
  display_name text,
  phone text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refinery_users TO authenticated;
GRANT ALL ON public.refinery_users TO service_role;
ALTER TABLE public.refinery_users ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_refinery_users_touch ON public.refinery_users;
CREATE TRIGGER trg_refinery_users_touch BEFORE UPDATE ON public.refinery_users
FOR EACH ROW EXECUTE FUNCTION public.refinery_touch_updated_at();

-- =========================================================
-- helper fns
-- =========================================================
CREATE OR REPLACE FUNCTION public.is_refinery_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_uid)
$$;

CREATE OR REPLACE FUNCTION public.user_refinery_id(_uid uuid)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT refinery_id FROM public.refinery_users WHERE user_id = _uid LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.can_access_refinery(_uid uuid, _rid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_platform_admin(_uid)
      OR EXISTS (SELECT 1 FROM public.refinery_users WHERE user_id = _uid AND refinery_id = _rid)
$$;

-- Policies for refineries
DROP POLICY IF EXISTS refineries_select ON public.refineries;
CREATE POLICY refineries_select ON public.refineries FOR SELECT TO authenticated
  USING (public.can_access_refinery(auth.uid(), id));

-- Policies for refinery_users
DROP POLICY IF EXISTS ru_select ON public.refinery_users;
CREATE POLICY ru_select ON public.refinery_users FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()) OR user_id = auth.uid());

DROP POLICY IF EXISTS ru_admin_write ON public.refinery_users;
CREATE POLICY ru_admin_write ON public.refinery_users FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

DROP POLICY IF EXISTS ru_self_update ON public.refinery_users;
CREATE POLICY ru_self_update ON public.refinery_users FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =========================================================
-- refinery_clients
-- =========================================================
CREATE TABLE IF NOT EXISTS public.refinery_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  name text NOT NULL,
  phone text,
  purity_balance numeric NOT NULL DEFAULT 0,
  da_balance numeric NOT NULL DEFAULT 0,
  refining_fee_price numeric NOT NULL DEFAULT 0,
  notes text,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rclients_ref ON public.refinery_clients(refinery_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refinery_clients TO authenticated;
GRANT ALL ON public.refinery_clients TO service_role;
ALTER TABLE public.refinery_clients ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_rclients_touch ON public.refinery_clients;
CREATE TRIGGER trg_rclients_touch BEFORE UPDATE ON public.refinery_clients
FOR EACH ROW EXECUTE FUNCTION public.refinery_touch_updated_at();

DROP POLICY IF EXISTS rc_all ON public.refinery_clients;
CREATE POLICY rc_all ON public.refinery_clients FOR ALL TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id))
  WITH CHECK (public.can_access_refinery(auth.uid(), refinery_id));

-- =========================================================
-- refinery_transactions
-- =========================================================
CREATE TABLE IF NOT EXISTS public.refinery_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.refinery_clients(id) ON DELETE RESTRICT,
  transaction_number text NOT NULL,
  direction public.refinery_tx_direction NOT NULL,
  transaction_type public.refinery_tx_type NOT NULL,
  transaction_date date NOT NULL DEFAULT CURRENT_DATE,
  total_gross_weight numeric NOT NULL DEFAULT 0,
  total_pure_weight numeric NOT NULL DEFAULT 0,
  average_purity numeric NOT NULL DEFAULT 0,
  da_amount numeric NOT NULL DEFAULT 0,
  fee_price numeric NOT NULL DEFAULT 0,
  total_refining_fee numeric NOT NULL DEFAULT 0,
  previous_purity_balance numeric,
  new_purity_balance numeric,
  previous_da_balance numeric,
  new_da_balance numeric,
  previous_gold_stock numeric,
  new_gold_stock numeric,
  previous_da_stock numeric,
  new_da_stock numeric,
  status public.refinery_tx_status NOT NULL DEFAULT 'pending',
  notes text,
  settled_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (refinery_id, transaction_number)
);
CREATE INDEX IF NOT EXISTS idx_rtx_ref ON public.refinery_transactions(refinery_id);
CREATE INDEX IF NOT EXISTS idx_rtx_client ON public.refinery_transactions(client_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refinery_transactions TO authenticated;
GRANT ALL ON public.refinery_transactions TO service_role;
ALTER TABLE public.refinery_transactions ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_rtx_touch ON public.refinery_transactions;
CREATE TRIGGER trg_rtx_touch BEFORE UPDATE ON public.refinery_transactions
FOR EACH ROW EXECUTE FUNCTION public.refinery_touch_updated_at();

DROP POLICY IF EXISTS rtx_all ON public.refinery_transactions;
CREATE POLICY rtx_all ON public.refinery_transactions FOR ALL TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id))
  WITH CHECK (public.can_access_refinery(auth.uid(), refinery_id));

-- =========================================================
-- refinery_transaction_gold_bars
-- =========================================================
CREATE TABLE IF NOT EXISTS public.refinery_transaction_gold_bars (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.refinery_transactions(id) ON DELETE CASCADE,
  item_number text,
  item_type public.refinery_bar_type NOT NULL DEFAULT 'bar',
  gross_weight numeric NOT NULL DEFAULT 0,
  purity numeric NOT NULL DEFAULT 0,
  pure_weight numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rbars_tx ON public.refinery_transaction_gold_bars(transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refinery_transaction_gold_bars TO authenticated;
GRANT ALL ON public.refinery_transaction_gold_bars TO service_role;
ALTER TABLE public.refinery_transaction_gold_bars ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_rbars_touch ON public.refinery_transaction_gold_bars;
CREATE TRIGGER trg_rbars_touch BEFORE UPDATE ON public.refinery_transaction_gold_bars
FOR EACH ROW EXECUTE FUNCTION public.refinery_touch_updated_at();

DROP POLICY IF EXISTS rbars_all ON public.refinery_transaction_gold_bars;
CREATE POLICY rbars_all ON public.refinery_transaction_gold_bars FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.refinery_transactions t
    WHERE t.id = transaction_id AND public.can_access_refinery(auth.uid(), t.refinery_id)
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.refinery_transactions t
    WHERE t.id = transaction_id AND public.can_access_refinery(auth.uid(), t.refinery_id)
  ));

-- =========================================================
-- refinery_stock
-- =========================================================
CREATE TABLE IF NOT EXISTS public.refinery_stock (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL UNIQUE REFERENCES public.refineries(id) ON DELETE CASCADE,
  pure_gold_stock numeric NOT NULL DEFAULT 0,
  da_stock numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.refinery_stock TO authenticated;
GRANT ALL ON public.refinery_stock TO service_role;
ALTER TABLE public.refinery_stock ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rstock_select ON public.refinery_stock;
CREATE POLICY rstock_select ON public.refinery_stock FOR SELECT TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));

-- =========================================================
-- refinery_stock_movements
-- =========================================================
CREATE TABLE IF NOT EXISTS public.refinery_stock_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  client_id uuid REFERENCES public.refinery_clients(id) ON DELETE SET NULL,
  transaction_id uuid REFERENCES public.refinery_transactions(id) ON DELETE SET NULL,
  movement_type public.refinery_movement_type NOT NULL,
  gold_change numeric NOT NULL DEFAULT 0,
  da_change numeric NOT NULL DEFAULT 0,
  gold_stock_before numeric NOT NULL DEFAULT 0,
  gold_stock_after numeric NOT NULL DEFAULT 0,
  da_stock_before numeric NOT NULL DEFAULT 0,
  da_stock_after numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rsm_ref ON public.refinery_stock_movements(refinery_id);

GRANT SELECT, INSERT ON public.refinery_stock_movements TO authenticated;
GRANT ALL ON public.refinery_stock_movements TO service_role;
ALTER TABLE public.refinery_stock_movements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS rsm_select ON public.refinery_stock_movements;
CREATE POLICY rsm_select ON public.refinery_stock_movements FOR SELECT TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));

-- =========================================================
-- Settlement RPC
-- =========================================================
CREATE OR REPLACE FUNCTION public.refinery_settle_transaction(_tx_id uuid)
RETURNS public.refinery_transactions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tx public.refinery_transactions;
  cli public.refinery_clients;
  stk public.refinery_stock;
  uid uuid := auth.uid();
  new_purity numeric;
  new_da numeric;
  new_gold_stock numeric;
  new_da_stock numeric;
  mv public.refinery_movement_type;
  gold_change numeric := 0;
  da_change numeric := 0;
BEGIN
  SELECT * INTO tx FROM public.refinery_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF NOT public.can_access_refinery(uid, tx.refinery_id) THEN RAISE EXCEPTION 'Forbidden'; END IF;
  IF tx.status <> 'pending' THEN RAISE EXCEPTION 'Transaction is not pending'; END IF;

  SELECT * INTO cli FROM public.refinery_clients WHERE id = tx.client_id FOR UPDATE;
  SELECT * INTO stk FROM public.refinery_stock WHERE refinery_id = tx.refinery_id FOR UPDATE;
  IF stk IS NULL THEN
    INSERT INTO public.refinery_stock(refinery_id) VALUES (tx.refinery_id) RETURNING * INTO stk;
  END IF;

  new_purity := cli.purity_balance;
  new_da := cli.da_balance;
  new_gold_stock := stk.pure_gold_stock;
  new_da_stock := stk.da_stock;

  IF tx.direction = 'receiving' AND tx.transaction_type = 'da' THEN
    new_da := cli.da_balance + tx.da_amount;
    new_da_stock := stk.da_stock + tx.da_amount;
    da_change := tx.da_amount;
    mv := 'receiving_da';

  ELSIF tx.direction = 'delivery' AND tx.transaction_type = 'da' THEN
    IF stk.da_stock < tx.da_amount THEN
      RAISE EXCEPTION 'Not enough stock to settle this transaction.';
    END IF;
    new_da := cli.da_balance - tx.da_amount;
    new_da_stock := stk.da_stock - tx.da_amount;
    da_change := -tx.da_amount;
    mv := 'delivery_da';

  ELSIF tx.direction = 'receiving' AND tx.transaction_type = 'gold' THEN
    new_purity := cli.purity_balance + tx.total_pure_weight;
    new_gold_stock := stk.pure_gold_stock + tx.total_pure_weight;
    new_da := cli.da_balance - tx.total_refining_fee;
    gold_change := tx.total_pure_weight;
    da_change := -tx.total_refining_fee;
    mv := 'receiving_gold';

  ELSIF tx.direction = 'delivery' AND tx.transaction_type = 'gold' THEN
    IF stk.pure_gold_stock < tx.total_pure_weight THEN
      RAISE EXCEPTION 'Not enough stock to settle this transaction.';
    END IF;
    new_purity := cli.purity_balance - tx.total_pure_weight;
    new_gold_stock := stk.pure_gold_stock - tx.total_pure_weight;
    gold_change := -tx.total_pure_weight;
    mv := 'delivery_gold';
  ELSE
    RAISE EXCEPTION 'Unknown transaction kind';
  END IF;

  UPDATE public.refinery_clients
     SET purity_balance = new_purity, da_balance = new_da
   WHERE id = cli.id;

  UPDATE public.refinery_stock
     SET pure_gold_stock = new_gold_stock, da_stock = new_da_stock, updated_at = now()
   WHERE refinery_id = tx.refinery_id;

  INSERT INTO public.refinery_stock_movements(
    refinery_id, client_id, transaction_id, movement_type,
    gold_change, da_change,
    gold_stock_before, gold_stock_after, da_stock_before, da_stock_after,
    created_by
  ) VALUES (
    tx.refinery_id, tx.client_id, tx.id, mv,
    gold_change, da_change,
    stk.pure_gold_stock, new_gold_stock, stk.da_stock, new_da_stock,
    uid
  );

  UPDATE public.refinery_transactions
     SET status = 'settled',
         settled_at = now(),
         previous_purity_balance = cli.purity_balance,
         new_purity_balance = new_purity,
         previous_da_balance = cli.da_balance,
         new_da_balance = new_da,
         previous_gold_stock = stk.pure_gold_stock,
         new_gold_stock = new_gold_stock,
         previous_da_stock = stk.da_stock,
         new_da_stock = new_da_stock
   WHERE id = tx.id
   RETURNING * INTO tx;

  RETURN tx;
END $$;

GRANT EXECUTE ON FUNCTION public.refinery_settle_transaction(uuid) TO authenticated;

-- =========================================================
-- Seed three refineries + stock rows
-- =========================================================
INSERT INTO public.refineries(name) VALUES ('Refinery 1') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.refineries(name) VALUES ('Refinery 2') ON CONFLICT (name) DO NOTHING;
INSERT INTO public.refineries(name) VALUES ('Refinery 3') ON CONFLICT (name) DO NOTHING;

INSERT INTO public.refinery_stock(refinery_id)
SELECT id FROM public.refineries
ON CONFLICT (refinery_id) DO NOTHING;
