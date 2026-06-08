ALTER TABLE public.refinery_transactions DROP CONSTRAINT refinery_transactions_refinery_id_transaction_number_key;

-- Non-settlement rows: tx number must be unique per refinery
CREATE UNIQUE INDEX refinery_transactions_refnum_nonsettlement_idx
  ON public.refinery_transactions (refinery_id, transaction_number)
  WHERE settlement_group_id IS NULL;

-- Settlement rows: From/To pair share the same number; uniqueness on (refinery, number, role)
CREATE UNIQUE INDEX refinery_transactions_refnum_settlement_idx
  ON public.refinery_transactions (refinery_id, transaction_number, settlement_role)
  WHERE settlement_group_id IS NOT NULL;