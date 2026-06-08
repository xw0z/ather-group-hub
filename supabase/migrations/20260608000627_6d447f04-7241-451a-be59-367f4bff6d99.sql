ALTER TABLE public.refinery_transactions ALTER COLUMN client_id DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.refinery_create_stock_adjustment(_refinery_id uuid, _metal text, _kind text, _delta numeric, _notes text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  ) VALUES (
    _refinery_id, NULL, num, 'receiving', 'stock_adjustment',
    CURRENT_DATE, _notes, 'settled', uid, now(),
    0, 0, 0,
    0, 0, 0,
    _metal, _kind, _delta,
    NULL, NULL,
    NULL, NULL,
    prev_gold, new_gold,
    prev_da,   new_da,
    prev_silver, new_silver
  ) RETURNING id INTO tx_id;

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
END $function$;

UPDATE public.refinery_transactions
   SET client_id = NULL
 WHERE transaction_type = 'stock_adjustment'
   AND client_id IS NOT NULL;
