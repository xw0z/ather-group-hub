ALTER TABLE public.purity_clients
  ADD COLUMN purity_format text NOT NULL DEFAULT '3'
  CHECK (purity_format IN ('3', '4'));