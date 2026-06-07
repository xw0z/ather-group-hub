-- Add metal type to buy/sell transactions and extend movement types
ALTER TABLE public.refinery_transactions
  ADD COLUMN IF NOT EXISTS buysell_metal text;

UPDATE public.refinery_transactions
  SET buysell_metal = 'gold'
  WHERE transaction_type = 'buysell' AND buysell_metal IS NULL;

ALTER TABLE public.refinery_transactions
  ADD CONSTRAINT refinery_transactions_buysell_metal_check
  CHECK (buysell_metal IS NULL OR buysell_metal IN ('gold','silver'));

-- Add silver movement types if missing
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'buy_silver'
    AND enumtypid = 'public.refinery_movement_type'::regtype) THEN
    ALTER TYPE public.refinery_movement_type ADD VALUE 'buy_silver';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'sell_silver'
    AND enumtypid = 'public.refinery_movement_type'::regtype) THEN
    ALTER TYPE public.refinery_movement_type ADD VALUE 'sell_silver';
  END IF;
END $$;

-- Replace the buy/sell RPC to support gold AND silver
CREATE OR REPLACE FUNCTION public.refinery_create_buysell(
  _refinery_id uuid,
  _client_id uuid,
  _kind text,
  _settlement text,
  _weight numeric,
  _purity numeric,
  _price_per_gram numeric,
  _date date,
  _notes text,
  _metal text DEFAULT 'gold'
)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  prev_silver numeric; new_silver numeric;
  prev_da_stock numeric;
  prev_da numeric;   new_da numeric;
  total_da numeric;
  metal_delta numeric;
  da_delta numeric := 0;
  mv public.refinery_movement_type;
BEGIN
  IF _kind NOT IN ('buy','sell') THEN RAISE EXCEPTION 'Invalid buysell kind'; END IF;
  IF _settlement NOT IN ('settlement','cash') THEN RAISE EXCEPTION 'Invalid settlement method'; END IF;
  IF _metal NOT IN ('gold','silver') THEN RAISE EXCEPTION 'Invalid metal'; END IF;
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
  prev_silver := stk.silver_stock;
  prev_da_stock := stk.da_stock;
  prev_da := cli.da_balance;
  new_gold := prev_gold;
  new_silver := prev_silver;

  IF _kind = 'buy' THEN
    metal_delta := _weight;
    IF _metal = 'gold' THEN
      new_gold := prev_gold + _weight;
      mv := 'buy_gold';
    ELSE
      new_silver := prev_silver + _weight;
      mv := 'buy_silver';
    END IF;
    IF _settlement = 'settlement' THEN
      da_delta := total_da;
    END IF;
  ELSE
    metal_delta := -_weight;
    IF _metal = 'gold' THEN
      IF prev_gold < _weight THEN
        RAISE EXCEPTION 'Not enough gold stock to sell (have %, need %)', prev_gold, _weight;
      END IF;
      new_gold := prev_gold - _weight;
      mv := 'sell_gold';
    ELSE
      IF prev_silver < _weight THEN
        RAISE EXCEPTION 'Not enough silver stock to sell (have %, need %)', prev_silver, _weight;
      END IF;
      new_silver := prev_silver - _weight;
      mv := 'sell_silver';
    END IF;
    IF _settlement = 'settlement' THEN
      da_delta := -total_da;
    END IF;
  END IF;

  new_da := prev_da + da_delta;

  UPDATE public.refinery_stock
     SET pure_gold_stock = new_gold, silver_stock = new_silver, updated_at = now()
   WHERE refinery_id = _refinery_id;

  IF _settlement = 'settlement' AND da_delta <> 0 THEN
    UPDATE public.refinery_clients
       SET da_balance = new_da
     WHERE id = cli.id;
  END IF;

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
    previous_silver_stock, new_silver_stock,
    previous_da_stock, new_da_stock,
    buysell_kind, buysell_settlement, buysell_metal,
    buysell_weight, buysell_purity, buysell_price_per_gram, buysell_total
  ) VALUES (
    _refinery_id, cli.id, num,
    CASE WHEN _kind='buy' THEN 'receiving' ELSE 'delivery' END, 'buysell',
    _date, _notes, 'settled', uid, now(),
    CASE WHEN _metal='gold' THEN _weight ELSE 0 END,
    _weight, COALESCE(_purity, 1000),
    total_da, _price_per_gram, 0,
    cli.purity_balance, cli.purity_balance,
    prev_da, new_da,
    prev_gold, new_gold,
    prev_silver, new_silver,
    prev_da_stock, prev_da_stock,
    _kind, _settlement, _metal,
    _weight, COALESCE(_purity, 1000), _price_per_gram, total_da
  ) RETURNING id INTO tx_id;

  INSERT INTO public.refinery_stock_movements(
    refinery_id, client_id, transaction_id, movement_type,
    gold_change, silver_change, da_change,
    gold_stock_before, gold_stock_after,
    silver_stock_before, silver_stock_after,
    da_stock_before, da_stock_after,
    metal,
    notes, created_by
  ) VALUES (
    _refinery_id, cli.id, tx_id, mv,
    CASE WHEN _metal='gold' THEN metal_delta ELSE 0 END,
    CASE WHEN _metal='silver' THEN metal_delta ELSE 0 END,
    da_delta,
    prev_gold, new_gold,
    prev_silver, new_silver,
    prev_da_stock, prev_da_stock,
    _metal,
    _notes, uid
  );

  RETURN tx_id;
END $function$;