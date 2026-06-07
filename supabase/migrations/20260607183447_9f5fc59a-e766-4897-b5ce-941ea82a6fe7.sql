CREATE OR REPLACE FUNCTION public.refinery_create_buysell(
  _refinery_id uuid,
  _client_id uuid,
  _kind text,                -- 'buy' | 'sell'
  _settlement text,          -- 'settlement' | 'cash'
  _weight numeric,           -- grams (pure)
  _purity numeric,           -- 0..1000 (optional, defaults to 1000)
  _price_per_gram numeric,   -- DA / g
  _date date,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  stk public.refinery_stock;
  cli public.refinery_clients;
  ref_name text;
  prefix text;
  cnt int;
  ymd text;
  num text;
  tx_id uuid;
  prev_gold numeric; new_gold numeric;
  prev_da_stock numeric;
  prev_da numeric;   new_da numeric;
  total_da numeric;
  gold_delta numeric;
  da_delta numeric := 0;
  mv public.refinery_movement_type;
BEGIN
  IF _kind NOT IN ('buy','sell') THEN RAISE EXCEPTION 'Invalid buysell kind'; END IF;
  IF _settlement NOT IN ('settlement','cash') THEN RAISE EXCEPTION 'Invalid settlement method'; END IF;
  IF _weight IS NULL OR _weight <= 0 THEN RAISE EXCEPTION 'Weight must be greater than 0'; END IF;
  IF _price_per_gram IS NULL OR _price_per_gram < 0 THEN RAISE EXCEPTION 'Price per gram must be >= 0'; END IF;
  IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, _refinery_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  SELECT * INTO cli FROM public.refinery_clients WHERE id = _client_id FOR UPDATE;
  IF NOT FOUND OR cli.refinery_id <> _refinery_id THEN
    RAISE EXCEPTION 'Client not found in this refinery';
  END IF;

  SELECT * INTO stk FROM public.refinery_stock WHERE refinery_id = _refinery_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.refinery_stock(refinery_id) VALUES (_refinery_id) RETURNING * INTO stk;
  END IF;

  total_da := round(_weight * _price_per_gram);
  prev_gold := stk.pure_gold_stock;
  prev_da_stock := stk.da_stock;
  prev_da := cli.da_balance;

  IF _kind = 'buy' THEN
    gold_delta := _weight;
    new_gold := prev_gold + _weight;
    mv := 'buy_gold';
    IF _settlement = 'settlement' THEN
      -- Refinery owes the client → client DA balance increases
      da_delta := total_da;
    END IF;
  ELSE
    gold_delta := -_weight;
    IF prev_gold < _weight THEN
      RAISE EXCEPTION 'Not enough gold stock to sell (have %, need %)', prev_gold, _weight;
    END IF;
    new_gold := prev_gold - _weight;
    mv := 'sell_gold';
    IF _settlement = 'settlement' THEN
      -- Client owes the refinery → client DA balance decreases
      da_delta := -total_da;
    END IF;
  END IF;

  new_da := prev_da + da_delta;

  -- Apply stock
  UPDATE public.refinery_stock
     SET pure_gold_stock = new_gold, updated_at = now()
   WHERE refinery_id = _refinery_id;

  -- Apply client balance only for settlement
  IF _settlement = 'settlement' AND da_delta <> 0 THEN
    UPDATE public.refinery_clients
       SET da_balance = new_da
     WHERE id = cli.id;
  END IF;

  -- Build transaction number
  SELECT name INTO ref_name FROM public.refineries WHERE id = _refinery_id;
  prefix := COALESCE(NULLIF(regexp_replace(COALESCE(ref_name,'REF'), '[^A-Za-z0-9]', '', 'g'), ''), 'REF');
  prefix := upper(substring(prefix from 1 for 6));
  SELECT count(*) INTO cnt FROM public.refinery_transactions WHERE refinery_id = _refinery_id;
  ymd := to_char(now(), 'YYYYMM');
  num := prefix || '-BS-' || ymd || '-' || lpad((cnt+1)::text, 4, '0');

  INSERT INTO public.refinery_transactions(
    refinery_id, client_id, transaction_number,
    direction, transaction_type,
    transaction_date, notes, status, created_by, settled_at,
    total_pure_weight, total_gross_weight, average_purity,
    da_amount, fee_price, total_refining_fee,
    previous_purity_balance, new_purity_balance,
    previous_da_balance, new_da_balance,
    previous_gold_stock, new_gold_stock,
    previous_da_stock, new_da_stock,
    buysell_kind, buysell_settlement,
    buysell_weight, buysell_purity, buysell_price_per_gram, buysell_total
  ) VALUES (
    _refinery_id, cli.id, num,
    CASE WHEN _kind='buy' THEN 'receiving' ELSE 'delivery' END, 'buysell',
    _date, _notes, 'settled', uid, now(),
    _weight, _weight, COALESCE(_purity, 1000),
    total_da, _price_per_gram, 0,
    cli.purity_balance, cli.purity_balance,
    prev_da, new_da,
    prev_gold, new_gold,
    prev_da_stock, prev_da_stock,
    _kind, _settlement,
    _weight, COALESCE(_purity, 1000), _price_per_gram, total_da
  ) RETURNING id INTO tx_id;

  -- Audit movement row
  INSERT INTO public.refinery_stock_movements(
    refinery_id, client_id, transaction_id, movement_type,
    gold_change, da_change,
    gold_stock_before, gold_stock_after,
    da_stock_before, da_stock_after,
    notes, created_by
  ) VALUES (
    _refinery_id, cli.id, tx_id, mv,
    gold_delta, da_delta,
    prev_gold, new_gold,
    prev_da_stock, prev_da_stock,
    _notes, uid
  );

  RETURN tx_id;
END $$;