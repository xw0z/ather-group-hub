-- Settlement: two-sided refinery fee accounting
-- From client is credited using their own fee price; To client is debited using the entered fee price.

DROP FUNCTION IF EXISTS public.refinery_create_settlement(uuid, uuid, uuid, text, numeric, boolean, numeric, date, text);

CREATE OR REPLACE FUNCTION public.refinery_create_settlement(
  _refinery_id uuid,
  _from_client uuid,
  _to_client uuid,
  _kind text,
  _amount numeric,
  _apply_fee boolean,
  _from_fee_price numeric,
  _to_fee_price numeric,
  _date date,
  _notes text
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  from_fee numeric := 0;
  to_fee numeric := 0;
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
      from_fee := _amount * COALESCE(_from_fee_price, 0);
      to_fee   := _amount * COALESCE(_to_fee_price, 0);
      -- From client is CREDITED (DA balance goes up) using its own fee price
      from_new_d := from_new_d + from_fee;
      -- To client is DEBITED (DA balance goes down) using the entered fee price
      to_new_d   := to_new_d   - to_fee;
    END IF;
  ELSE
    from_new_d := from_prev_d - _amount;
    to_new_d   := to_prev_d   + _amount;
    from_new_p := from_prev_p;
    to_new_p   := to_prev_p;
  END IF;

  UPDATE public.refinery_clients
    SET purity_balance = from_new_p, da_balance = from_new_d
    WHERE id = from_c.id;
  UPDATE public.refinery_clients
    SET purity_balance = to_new_p, da_balance = to_new_d
    WHERE id = to_c.id;

  SELECT name INTO ref_name FROM public.refineries WHERE id = _refinery_id;
  prefix := COALESCE(NULLIF(regexp_replace(COALESCE(ref_name,'REF'), '[^A-Za-z0-9]', '', 'g'), ''), 'REF');
  prefix := upper(substring(prefix from 1 for 6));
  SELECT count(*) INTO cnt FROM public.refinery_transactions WHERE refinery_id = _refinery_id;
  base_n := cnt + 1;
  ymd := to_char(now(), 'YYYYMM');
  num_from := prefix || '-' || ymd || '-' || lpad(base_n::text, 4, '0') || '-A';
  num_to   := prefix || '-' || ymd || '-' || lpad(base_n::text, 4, '0') || '-B';

  -- FROM row: sender. fee_price = from-side price; total_refining_fee = from credit
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
    COALESCE(_from_fee_price, 0),
    from_fee,
    from_prev_p, from_new_p,
    from_prev_d, from_new_d,
    now()
  );

  -- TO row: receiver. fee_price = to-side price; total_refining_fee = to debit
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
    COALESCE(_to_fee_price, 0),
    to_fee,
    to_prev_p, to_new_p,
    to_prev_d, to_new_d,
    now()
  );

  RETURN grp;
END $function$;