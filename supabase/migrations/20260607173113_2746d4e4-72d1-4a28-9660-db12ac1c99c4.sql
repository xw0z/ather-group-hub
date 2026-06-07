
-- Add 'settlement' enum value to refinery_tx_type
ALTER TYPE public.refinery_tx_type ADD VALUE IF NOT EXISTS 'settlement';

-- Add settlement-related columns to refinery_transactions
ALTER TABLE public.refinery_transactions
  ADD COLUMN IF NOT EXISTS settlement_group_id uuid,
  ADD COLUMN IF NOT EXISTS settlement_kind text,
  ADD COLUMN IF NOT EXISTS settlement_role text,
  ADD COLUMN IF NOT EXISTS counterparty_client_id uuid REFERENCES public.refinery_clients(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS settlement_apply_fee boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS settlement_amount numeric;

CREATE INDEX IF NOT EXISTS idx_rtx_settlement_group ON public.refinery_transactions(settlement_group_id);

-- =========================================================
-- Create a settlement (two paired rows, no stock movement)
-- =========================================================
CREATE OR REPLACE FUNCTION public.refinery_create_settlement(
  _refinery_id uuid,
  _from_client uuid,
  _to_client uuid,
  _kind text,                 -- 'gold' | 'da'
  _amount numeric,
  _apply_fee boolean,
  _fee_price numeric,
  _date date,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  grp uuid := gen_random_uuid();
  from_c public.refinery_clients;
  to_c public.refinery_clients;
  ref_name text;
  prefix text;
  cnt int;
  ymd text;
  base_n int;
  num_from text;
  num_to text;
  w730 numeric := 0;
  fee numeric := 0;
  -- balance snapshots
  from_prev_p numeric; from_new_p numeric;
  from_prev_d numeric; from_new_d numeric;
  to_prev_p numeric; to_new_p numeric;
  to_prev_d numeric; to_new_d numeric;
BEGIN
  IF _from_client = _to_client THEN
    RAISE EXCEPTION 'From and To clients must be different';
  END IF;
  IF _amount IS NULL OR _amount <= 0 THEN
    RAISE EXCEPTION 'Settlement amount must be greater than 0';
  END IF;
  IF _kind NOT IN ('gold','da') THEN
    RAISE EXCEPTION 'Invalid settlement kind';
  END IF;

  IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, _refinery_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO from_c FROM public.refinery_clients WHERE id = _from_client FOR UPDATE;
  IF NOT FOUND OR from_c.refinery_id <> _refinery_id THEN
    RAISE EXCEPTION 'From client not found in this refinery';
  END IF;
  SELECT * INTO to_c FROM public.refinery_clients WHERE id = _to_client FOR UPDATE;
  IF NOT FOUND OR to_c.refinery_id <> _refinery_id THEN
    RAISE EXCEPTION 'To client not found in this refinery';
  END IF;

  -- Calculate balance impacts
  from_prev_p := from_c.purity_balance;
  from_prev_d := from_c.da_balance;
  to_prev_p   := to_c.purity_balance;
  to_prev_d   := to_c.da_balance;

  IF _kind = 'gold' THEN
    from_new_p := from_prev_p - _amount;
    to_new_p   := to_prev_p   + _amount;
    from_new_d := from_prev_d;
    to_new_d   := to_prev_d;

    IF _apply_fee THEN
      w730 := (_amount * 1000) / 730;
      fee  := w730 * COALESCE(_fee_price, 0);
      -- Fee charged to RECEIVING client
      to_new_d := to_new_d - fee;
    END IF;
  ELSE
    -- DA settlement
    from_new_d := from_prev_d - _amount;
    to_new_d   := to_prev_d   + _amount;
    from_new_p := from_prev_p;
    to_new_p   := to_prev_p;
  END IF;

  -- Apply balance updates
  UPDATE public.refinery_clients
    SET purity_balance = from_new_p, da_balance = from_new_d
    WHERE id = from_c.id;
  UPDATE public.refinery_clients
    SET purity_balance = to_new_p, da_balance = to_new_d
    WHERE id = to_c.id;

  -- Build transaction numbers
  SELECT name INTO ref_name FROM public.refineries WHERE id = _refinery_id;
  prefix := COALESCE(NULLIF(regexp_replace(COALESCE(ref_name,'REF'), '[^A-Za-z0-9]', '', 'g'), ''), 'REF');
  prefix := upper(substring(prefix from 1 for 6));
  SELECT count(*) INTO cnt FROM public.refinery_transactions WHERE refinery_id = _refinery_id;
  base_n := cnt + 1;
  ymd := to_char(now(), 'YYYYMM');
  num_from := prefix || '-' || ymd || '-' || lpad(base_n::text, 4, '0') || '-A';
  num_to   := prefix || '-' || ymd || '-' || lpad(base_n::text, 4, '0') || '-B';

  -- Insert FROM row (delivery side: deducts from sender)
  INSERT INTO public.refinery_transactions(
    refinery_id, client_id, transaction_number, direction, transaction_type,
    transaction_date, notes, status, created_by,
    settlement_group_id, settlement_kind, settlement_role, counterparty_client_id,
    settlement_apply_fee, settlement_amount,
    total_pure_weight, total_gross_weight, average_purity,
    da_amount, fee_price, total_refining_fee,
    previous_purity_balance, new_purity_balance,
    previous_da_balance, new_da_balance,
    settled_at
  ) VALUES (
    _refinery_id, from_c.id, num_from, 'delivery', 'settlement',
    _date, _notes, 'settled', uid,
    grp, _kind, 'from', to_c.id,
    _apply_fee, _amount,
    CASE WHEN _kind='gold' THEN _amount ELSE 0 END, 0, 0,
    CASE WHEN _kind='da'   THEN _amount ELSE 0 END,
    COALESCE(_fee_price, 0),
    0,  -- fee charged on the TO row
    from_prev_p, from_new_p,
    from_prev_d, from_new_d,
    now()
  );

  -- Insert TO row (receiving side: adds to receiver, may include fee deduction)
  INSERT INTO public.refinery_transactions(
    refinery_id, client_id, transaction_number, direction, transaction_type,
    transaction_date, notes, status, created_by,
    settlement_group_id, settlement_kind, settlement_role, counterparty_client_id,
    settlement_apply_fee, settlement_amount,
    total_pure_weight, total_gross_weight, average_purity,
    da_amount, fee_price, total_refining_fee,
    previous_purity_balance, new_purity_balance,
    previous_da_balance, new_da_balance,
    settled_at
  ) VALUES (
    _refinery_id, to_c.id, num_to, 'receiving', 'settlement',
    _date, _notes, 'settled', uid,
    grp, _kind, 'to', from_c.id,
    _apply_fee, _amount,
    CASE WHEN _kind='gold' THEN _amount ELSE 0 END, 0, 0,
    CASE WHEN _kind='da'   THEN _amount ELSE 0 END,
    COALESCE(_fee_price, 0),
    fee,
    to_prev_p, to_new_p,
    to_prev_d, to_new_d,
    now()
  );

  RETURN grp;
END $$;

-- =========================================================
-- Reverse + delete a settlement pair
-- =========================================================
CREATE OR REPLACE FUNCTION public.refinery_delete_settlement(_group_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  uid uuid := auth.uid();
  cli public.refinery_clients;
BEGIN
  -- Authorization: any row in the group's refinery the caller can access
  PERFORM 1 FROM public.refinery_transactions
    WHERE settlement_group_id = _group_id LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  FOR r IN
    SELECT * FROM public.refinery_transactions
    WHERE settlement_group_id = _group_id
    FOR UPDATE
  LOOP
    IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, r.refinery_id) THEN
      RAISE EXCEPTION 'Forbidden';
    END IF;
    SELECT * INTO cli FROM public.refinery_clients WHERE id = r.client_id FOR UPDATE;
    IF FOUND THEN
      UPDATE public.refinery_clients
        SET purity_balance = cli.purity_balance - (COALESCE(r.new_purity_balance,0) - COALESCE(r.previous_purity_balance,0)),
            da_balance     = cli.da_balance     - (COALESCE(r.new_da_balance,0)     - COALESCE(r.previous_da_balance,0))
        WHERE id = cli.id;
    END IF;
  END LOOP;

  DELETE FROM public.refinery_transactions WHERE settlement_group_id = _group_id;
END $$;

-- =========================================================
-- Patch reverse_transaction to no-op for settlements
-- (delete is handled via refinery_delete_settlement)
-- =========================================================
CREATE OR REPLACE FUNCTION public.refinery_reverse_transaction(_tx_id uuid)
 RETURNS refinery_transactions
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tx public.refinery_transactions;
  cli public.refinery_clients;
  stk public.refinery_stock;
  uid uuid := auth.uid();
  rev_purity numeric := 0;
  rev_da numeric := 0;
  rev_gold_stock numeric := 0;
  rev_da_stock numeric := 0;
BEGIN
  SELECT * INTO tx FROM public.refinery_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, tx.refinery_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  -- Settlements are handled by refinery_delete_settlement; reverse here is a no-op
  IF tx.transaction_type = 'settlement' THEN
    RETURN tx;
  END IF;
  IF tx.status <> 'settled' THEN
    RETURN tx;
  END IF;

  SELECT * INTO cli FROM public.refinery_clients WHERE id = tx.client_id FOR UPDATE;
  SELECT * INTO stk FROM public.refinery_stock WHERE refinery_id = tx.refinery_id FOR UPDATE;

  IF tx.direction = 'receiving' AND tx.transaction_type = 'da' THEN
    rev_da := -tx.da_amount;
    rev_da_stock := -tx.da_amount;
  ELSIF tx.direction = 'delivery' AND tx.transaction_type = 'da' THEN
    rev_da := tx.da_amount;
    rev_da_stock := tx.da_amount;
  ELSIF tx.direction = 'receiving' AND tx.transaction_type = 'gold' THEN
    rev_purity := -tx.total_pure_weight;
    rev_gold_stock := -tx.total_pure_weight;
    rev_da := tx.total_refining_fee;
  ELSIF tx.direction = 'delivery' AND tx.transaction_type = 'gold' THEN
    rev_purity := tx.total_pure_weight;
    rev_gold_stock := tx.total_pure_weight;
  END IF;

  UPDATE public.refinery_clients
    SET purity_balance = cli.purity_balance + rev_purity,
        da_balance = cli.da_balance + rev_da
    WHERE id = cli.id;

  UPDATE public.refinery_stock
    SET pure_gold_stock = stk.pure_gold_stock + rev_gold_stock,
        da_stock = stk.da_stock + rev_da_stock,
        updated_at = now()
    WHERE refinery_id = tx.refinery_id;

  DELETE FROM public.refinery_stock_movements WHERE transaction_id = _tx_id;

  UPDATE public.refinery_transactions
    SET status = 'pending',
        settled_at = NULL,
        previous_purity_balance = NULL, new_purity_balance = NULL,
        previous_da_balance = NULL, new_da_balance = NULL,
        previous_gold_stock = NULL, new_gold_stock = NULL,
        previous_da_stock = NULL, new_da_stock = NULL
    WHERE id = _tx_id
    RETURNING * INTO tx;

  RETURN tx;
END $function$;

-- Patch auto-settle trigger: skip settlements (they are inserted as 'settled' already)
CREATE OR REPLACE FUNCTION public.refinery_tx_auto_settle()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.transaction_type = 'settlement' THEN
    RETURN NEW;
  END IF;
  IF NEW.status = 'pending' THEN
    PERFORM public.refinery_settle_transaction(NEW.id);
  END IF;
  RETURN NEW;
END $function$;
