-- F5: Drop legacy 9-arg refinery_create_buysell overload. The current app only
-- calls the 10-arg version (with _metal). Keeping both invites accidental use
-- of the silver-blind version.
DROP FUNCTION IF EXISTS public.refinery_create_buysell(
  uuid, uuid, text, text, numeric, numeric, numeric, date, text
);

-- F4: refinery_reverse_transaction must explicitly reject transaction types
-- it does not know how to safely reverse. Previously it silently no-op'd for
-- 'buysell' (and returned the row), which could mislead callers into thinking
-- a reversal had happened.
CREATE OR REPLACE FUNCTION public.refinery_reverse_transaction(_tx_id uuid)
 RETURNS public.refinery_transactions
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

  -- Settlements have their own delete path
  IF tx.transaction_type = 'settlement' THEN
    RAISE EXCEPTION 'Use refinery_delete_settlement to reverse a settlement.';
  END IF;

  -- F4: Buy/Sell and stock adjustments cannot be safely reversed by this
  -- generic routine — they have different stock and counterparty semantics.
  IF tx.transaction_type = 'buysell' THEN
    RAISE EXCEPTION 'Buy/Sell transactions cannot be reversed here. Delete the transaction instead.';
  END IF;
  IF tx.transaction_type = 'stock_adjustment' THEN
    RAISE EXCEPTION 'Stock adjustments cannot be reversed here. Edit or delete the adjustment instead.';
  END IF;

  IF tx.transaction_type NOT IN ('gold','da') THEN
    RAISE EXCEPTION 'Unsupported transaction type for reversal: %', tx.transaction_type;
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