ALTER TABLE public.purity_trips ADD COLUMN IF NOT EXISTS scrap_weight numeric;
ALTER TABLE public.purity_pieces ADD COLUMN IF NOT EXISTS purity numeric;