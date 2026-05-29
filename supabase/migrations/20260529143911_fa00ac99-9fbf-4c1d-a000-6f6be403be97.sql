ALTER TABLE public.purity_pieces ADD COLUMN IF NOT EXISTS checked boolean NOT NULL DEFAULT false;
ALTER TABLE public.purity_trips ADD COLUMN IF NOT EXISTS is_settled boolean NOT NULL DEFAULT false;