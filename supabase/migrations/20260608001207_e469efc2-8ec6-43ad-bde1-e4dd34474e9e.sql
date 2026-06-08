CREATE OR REPLACE FUNCTION public.refinery_edit_stock_adjustment(
  _tx_id uuid,
  _metal text,
  _kind text,
  _delta numeric,
  _date date,
  _notes text
) RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  tx public.refinery_transactions;
  stk public.refinery_stock;
  old_metal text; old_kind text; old_delta numeric; old_notes text; old_date date;
  prev_gold numeric; prev_silver numeric; prev_da numeric;
  rev_gold numeric;  rev_silver numeric;  rev_da numeric;   -- stock after reversal
  new_gold numeric;  new_silver numeric;  new_da numeric;   -- stock after new delta
BEGIN
  IF _metal NOT IN ('gold','silver','da') THEN RAISE EXCEPTION 'Invalid metal'; END IF;
  IF _kind NOT IN ('add','remove','correction','loss','manual') THEN RAISE EXCEPTION 'Invalid kind'; END IF;
  IF _delta IS NULL OR _delta = 0 THEN RAISE EXCEPTION 'Delta must be non-zero'; END IF;

  SELECT * INTO tx FROM public.refinery_transactions WHERE id = _tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaction not found'; END IF;
  IF tx.transaction_type <> 'stock_adjustment' THEN RAISE EXCEPTION 'Not a stock adjustment'; END IF;
  IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, tx.refinery_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  old_metal := tx.adjustment_metal;
  old_kind  := tx.adjustment_kind;
  old_delta := COALESCE(tx.adjustment_delta, 0);
  old_notes := tx.notes;
  old_date  := tx.transaction_date;

  SELECT * INTO stk FROM public.refinery_stock WHERE refinery_id = tx.refinery_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.refinery_stock(refinery_id) VALUES (tx.refinery_id) RETURNING * INTO stk;
  END IF;

  prev_gold := stk.pure_gold_stock;
  prev_silver := stk.silver_stock;
  prev_da := stk.da_stock;

  -- Reverse old adjustment
  rev_gold := prev_gold;
  rev_silver := prev_silver;
  rev_da := prev_da;
  IF old_metal = 'gold' THEN
    rev_gold := prev_gold - old_delta;
  ELSIF old_metal = 'silver' THEN
    rev_silver := prev_silver - old_delta;
  ELSIF old_metal = 'da' THEN
    rev_da := prev_da - old_delta;
  END IF;

  -- Apply new adjustment
  new_gold := rev_gold;
  new_silver := rev_silver;
  new_da := rev_da;
  IF _metal = 'gold' THEN
    new_gold := rev_gold + _delta;
    IF new_gold < 0 THEN RAISE EXCEPTION 'Resulting gold stock would be negative'; END IF;
  ELSIF _metal = 'silver' THEN
    new_silver := rev_silver + _delta;
    IF new_silver < 0 THEN RAISE EXCEPTION 'Resulting silver stock would be negative'; END IF;
  ELSE
    new_da := rev_da + _delta;
    IF new_da < 0 THEN RAISE EXCEPTION 'Resulting DA stock would be negative'; END IF;
  END IF;

  IF rev_silver < 0 OR rev_gold < 0 OR rev_da < 0 THEN
    -- The reversal would make some other metal negative (stock changed since adjustment). Block it.
    RAISE EXCEPTION 'Cannot edit: reversing the previous adjustment would make stock negative. Adjust or delete the conflicting movements first.';
  END IF;

  UPDATE public.refinery_stock
     SET pure_gold_stock = new_gold,
         silver_stock    = new_silver,
         da_stock        = new_da,
         updated_at      = now()
   WHERE refinery_id = tx.refinery_id;

  -- Update transaction row, including new before/after stock snapshots
  UPDATE public.refinery_transactions
     SET adjustment_metal = _metal,
         adjustment_kind  = _kind,
         adjustment_delta = _delta,
         transaction_date = _date,
         notes            = _notes,
         previous_gold_stock   = rev_gold,
         new_gold_stock        = new_gold,
         previous_silver_stock = rev_silver,
         new_silver_stock      = new_silver,
         previous_da_stock     = rev_da,
         new_da_stock          = new_da
   WHERE id = _tx_id;

  -- Refresh stock movement audit row
  DELETE FROM public.refinery_stock_movements WHERE transaction_id = _tx_id;
  INSERT INTO public.refinery_stock_movements(
    refinery_id, transaction_id, movement_type,
    gold_change, da_change, silver_change,
    gold_stock_before, gold_stock_after,
    da_stock_before, da_stock_after,
    silver_stock_before, silver_stock_after,
    metal, adjustment_kind,
    notes, created_by
  ) VALUES (
    tx.refinery_id, _tx_id, 'adjustment',
    new_gold - rev_gold, new_da - rev_da, new_silver - rev_silver,
    rev_gold, new_gold,
    rev_da, new_da,
    rev_silver, new_silver,
    _metal, _kind,
    _notes, uid
  );

  -- Audit log
  SELECT email INTO uemail FROM auth.users WHERE id = uid;
  INSERT INTO public.refinery_audit_log(refinery_id, user_id, user_email, action, details)
  VALUES (
    tx.refinery_id, uid, uemail, 'stock_adjustment.edit',
    jsonb_build_object(
      'transaction_id', _tx_id,
      'transaction_number', tx.transaction_number,
      'old', jsonb_build_object(
        'metal', old_metal, 'kind', old_kind, 'delta', old_delta,
        'date', old_date, 'notes', old_notes
      ),
      'new', jsonb_build_object(
        'metal', _metal, 'kind', _kind, 'delta', _delta,
        'date', _date, 'notes', _notes
      )
    )
  );

  RETURN _tx_id;
END $function$;