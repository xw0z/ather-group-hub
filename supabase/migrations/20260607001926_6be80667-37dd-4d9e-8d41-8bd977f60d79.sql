
-- Auto-settle refinery transactions on insert and support reversal for edit/delete

-- Reverse a settled transaction: undo balance & stock changes, delete movement rows, set status back to 'pending'.
CREATE OR REPLACE FUNCTION public.refinery_reverse_transaction(_tx_id uuid)
RETURNS public.refinery_transactions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  IF tx.status <> 'settled' THEN
    RETURN tx; -- nothing to reverse
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
END $$;

-- Trigger: auto-settle on insert (operational entry, no approval needed)
CREATE OR REPLACE FUNCTION public.refinery_tx_auto_settle()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public.refinery_settle_transaction(NEW.id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_refinery_tx_auto_settle ON public.refinery_transactions;
CREATE TRIGGER trg_refinery_tx_auto_settle
AFTER INSERT ON public.refinery_transactions
FOR EACH ROW EXECUTE FUNCTION public.refinery_tx_auto_settle();
