
-- 1) Add silver stock column to refinery_stock
ALTER TABLE public.refinery_stock
  ADD COLUMN IF NOT EXISTS silver_stock numeric NOT NULL DEFAULT 0;

-- 2) Add silver tracking + adjustment metadata to refinery_stock_movements
ALTER TABLE public.refinery_stock_movements
  ADD COLUMN IF NOT EXISTS silver_change numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS silver_stock_before numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS silver_stock_after numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS metal text,
  ADD COLUMN IF NOT EXISTS adjustment_kind text;

-- 3) Add 'stock_adjustment' to refinery_tx_type enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
      JOIN pg_type t ON t.oid = e.enumtypid
      WHERE t.typname = 'refinery_tx_type' AND e.enumlabel = 'stock_adjustment'
  ) THEN
    ALTER TYPE public.refinery_tx_type ADD VALUE 'stock_adjustment';
  END IF;
END $$;

-- 4) Add silver/adjustment metadata to refinery_transactions
ALTER TABLE public.refinery_transactions
  ADD COLUMN IF NOT EXISTS adjustment_metal text,
  ADD COLUMN IF NOT EXISTS adjustment_kind text,
  ADD COLUMN IF NOT EXISTS adjustment_delta numeric,
  ADD COLUMN IF NOT EXISTS previous_silver_stock numeric,
  ADD COLUMN IF NOT EXISTS new_silver_stock numeric;

-- 5) Auto-settle trigger: skip stock_adjustment (we insert it as settled directly)
CREATE OR REPLACE FUNCTION public.refinery_tx_auto_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.transaction_type IN ('settlement','stock_adjustment') THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'pending' THEN
    PERFORM public.refinery_settle_transaction(NEW.id);
  END IF;
  RETURN NEW;
END $$;

-- 6) RPC: refinery_create_stock_adjustment
CREATE OR REPLACE FUNCTION public.refinery_create_stock_adjustment(
  _refinery_id uuid,
  _metal text,          -- 'gold' | 'silver' | 'da'
  _kind  text,          -- 'add' | 'remove' | 'correction' | 'loss' | 'manual'
  _delta numeric,       -- signed amount in grams (gold/silver) or DA
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  stk public.refinery_stock;
  ref_name text;
  prefix text;
  cnt int;
  ymd text;
  num text;
  tx_id uuid;
  prev_gold numeric; prev_silver numeric; prev_da numeric;
  new_gold numeric;  new_silver numeric;  new_da numeric;
BEGIN
  IF _metal NOT IN ('gold','silver','da') THEN RAISE EXCEPTION 'Invalid metal'; END IF;
  IF _kind NOT IN ('add','remove','correction','loss','manual') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF _delta IS NULL OR _delta = 0 THEN RAISE EXCEPTION 'Delta must be non-zero'; END IF;
  IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, _refinery_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO stk FROM public.refinery_stock WHERE refinery_id = _refinery_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.refinery_stock(refinery_id) VALUES (_refinery_id) RETURNING * INTO stk;
  END IF;

  prev_gold := stk.pure_gold_stock; prev_silver := stk.silver_stock; prev_da := stk.da_stock;
  new_gold := prev_gold; new_silver := prev_silver; new_da := prev_da;

  IF _metal = 'gold' THEN
    new_gold := prev_gold + _delta;
    IF new_gold < 0 THEN RAISE EXCEPTION 'Resulting gold stock would be negative'; END IF;
  ELSIF _metal = 'silver' THEN
    new_silver := prev_silver + _delta;
    IF new_silver < 0 THEN RAISE EXCEPTION 'Resulting silver stock would be negative'; END IF;
  ELSE
    new_da := prev_da + _delta;
    IF new_da < 0 THEN RAISE EXCEPTION 'Resulting DA stock would be negative'; END IF;
  END IF;

  UPDATE public.refinery_stock
     SET pure_gold_stock = new_gold,
         silver_stock    = new_silver,
         da_stock        = new_da,
         updated_at      = now()
   WHERE refinery_id = _refinery_id;

  -- Build a transaction number
  SELECT name INTO ref_name FROM public.refineries WHERE id = _refinery_id;
  prefix := COALESCE(NULLIF(regexp_replace(COALESCE(ref_name,'REF'), '[^A-Za-z0-9]', '', 'g'), ''), 'REF');
  prefix := upper(substring(prefix from 1 for 6));
  SELECT count(*) INTO cnt FROM public.refinery_transactions WHERE refinery_id = _refinery_id;
  ymd := to_char(now(), 'YYYYMM');
  num := prefix || '-ADJ-' || ymd || '-' || lpad((cnt+1)::text, 4, '0');

  INSERT INTO public.refinery_transactions(
    refinery_id, client_id, transaction_number, direction, transaction_type,
    transaction_date, notes, status, created_by, settled_at,
    total_pure_weight, total_gross_weight, average_purity,
    da_amount, fee_price, total_refining_fee,
    adjustment_metal, adjustment_kind, adjustment_delta,
    previous_purity_balance, new_purity_balance,
    previous_da_balance, new_da_balance,
    previous_gold_stock, new_gold_stock,
    previous_da_stock, new_da_stock,
    previous_silver_stock, new_silver_stock
  )
  -- client_id is required NOT NULL; reuse refinery_id as placeholder? No, FK requires a real client.
  -- Use the first client of this refinery; if none exists, raise.
  SELECT
    _refinery_id, c.id, num, 'receiving', 'stock_adjustment',
    CURRENT_DATE, _notes, 'settled', uid, now(),
    0, 0, 0,
    0, 0, 0,
    _metal, _kind, _delta,
    NULL, NULL,
    NULL, NULL,
    prev_gold, new_gold,
    prev_da,   new_da,
    prev_silver, new_silver
  FROM public.refinery_clients c
  WHERE c.refinery_id = _refinery_id
  ORDER BY c.created_at ASC
  LIMIT 1
  RETURNING id INTO tx_id;

  IF tx_id IS NULL THEN
    RAISE EXCEPTION 'Cannot create stock adjustment: refinery has no clients yet. Add at least one client first.';
  END IF;

  -- Audit movement row
  INSERT INTO public.refinery_stock_movements(
    refinery_id, transaction_id, movement_type,
    gold_change, da_change, silver_change,
    gold_stock_before, gold_stock_after,
    da_stock_before, da_stock_after,
    silver_stock_before, silver_stock_after,
    metal, adjustment_kind,
    notes, created_by
  ) VALUES (
    _refinery_id, tx_id, 'adjustment',
    new_gold - prev_gold, new_da - prev_da, new_silver - prev_silver,
    prev_gold, new_gold,
    prev_da, new_da,
    prev_silver, new_silver,
    _metal, _kind,
    _notes, uid
  );

  RETURN tx_id;
END $$;

-- 7) RPC: refinery_delete_stock_adjustment (reverses stock + removes tx + movement)
CREATE OR REPLACE FUNCTION public.refinery_delete_stock_adjustment(_tx_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx public.refinery_transactions;
  stk public.refinery_stock;
  uid uuid := auth.uid();
  delta numeric;
BEGIN
  SELECT * INTO tx FROM public.refinery_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;
  IF tx.transaction_type <> 'stock_adjustment' THEN RAISE EXCEPTION 'Not a stock adjustment'; END IF;
  IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, tx.refinery_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO stk FROM public.refinery_stock WHERE refinery_id = tx.refinery_id FOR UPDATE;
  delta := COALESCE(tx.adjustment_delta, 0);

  IF tx.adjustment_metal = 'gold' THEN
    IF (stk.pure_gold_stock - delta) < 0 THEN RAISE EXCEPTION 'Reversal would make gold stock negative'; END IF;
    UPDATE public.refinery_stock SET pure_gold_stock = pure_gold_stock - delta, updated_at = now() WHERE refinery_id = tx.refinery_id;
  ELSIF tx.adjustment_metal = 'silver' THEN
    IF (stk.silver_stock - delta) < 0 THEN RAISE EXCEPTION 'Reversal would make silver stock negative'; END IF;
    UPDATE public.refinery_stock SET silver_stock = silver_stock - delta, updated_at = now() WHERE refinery_id = tx.refinery_id;
  ELSIF tx.adjustment_metal = 'da' THEN
    IF (stk.da_stock - delta) < 0 THEN RAISE EXCEPTION 'Reversal would make DA stock negative'; END IF;
    UPDATE public.refinery_stock SET da_stock = da_stock - delta, updated_at = now() WHERE refinery_id = tx.refinery_id;
  END IF;

  DELETE FROM public.refinery_stock_movements WHERE transaction_id = _tx_id;
  DELETE FROM public.refinery_transactions WHERE id = _tx_id;
END $$;
