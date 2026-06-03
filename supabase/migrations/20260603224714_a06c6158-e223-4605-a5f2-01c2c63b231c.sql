
CREATE TABLE public.swap_premium_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_premium_companies TO authenticated;
GRANT ALL ON public.swap_premium_companies TO service_role;

ALTER TABLE public.swap_premium_companies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap users manage premium companies"
  ON public.swap_premium_companies FOR ALL
  TO authenticated
  USING (public.is_swap_user(auth.uid()))
  WITH CHECK (public.is_swap_user(auth.uid()));

CREATE TRIGGER swap_premium_companies_touch
  BEFORE UPDATE ON public.swap_premium_companies
  FOR EACH ROW EXECUTE FUNCTION public.swap_clients_touch();

-- Transaction kinds:
--   'add'      → adds grams to balance
--   'remove'   → removes grams from balance (grams stored as positive, subtracted in aggregates)
--   'adjust'   → balance adjustment (grams can be positive or negative)
--   'discount' → discount charge on N grams at $X/oz (does NOT change gold balance)
--   'premium'  → premium charge on N grams at $X/oz (does NOT change gold balance)
CREATE TABLE public.swap_premium_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.swap_premium_companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('add','remove','adjust','discount','premium')),
  grams NUMERIC NOT NULL DEFAULT 0,
  per_oz NUMERIC,
  amount_usd NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX swap_premium_tx_company_idx ON public.swap_premium_transactions(company_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_premium_transactions TO authenticated;
GRANT ALL ON public.swap_premium_transactions TO service_role;

ALTER TABLE public.swap_premium_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap users manage premium transactions"
  ON public.swap_premium_transactions FOR ALL
  TO authenticated
  USING (public.is_swap_user(auth.uid()))
  WITH CHECK (public.is_swap_user(auth.uid()));
