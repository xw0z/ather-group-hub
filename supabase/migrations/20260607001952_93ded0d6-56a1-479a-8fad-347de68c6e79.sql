
CREATE OR REPLACE FUNCTION public.refinery_settle_transaction(_tx_id uuid)
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
  IF uid IS NOT NULL AND NOT public.can_access_refinery(uid, tx.refinery_id) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
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
END $function$;
