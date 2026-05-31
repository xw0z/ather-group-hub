CREATE TABLE public.purity_swaps (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  usd_amount NUMERIC NOT NULL,
  annual_rate NUMERIC NOT NULL DEFAULT 5.4,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purity_swaps TO authenticated;
GRANT ALL ON public.purity_swaps TO service_role;

ALTER TABLE public.purity_swaps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swaps_shared_select" ON public.purity_swaps FOR SELECT TO authenticated USING (true);
CREATE POLICY "swaps_shared_insert" ON public.purity_swaps FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "swaps_shared_update" ON public.purity_swaps FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY "swaps_shared_delete" ON public.purity_swaps FOR DELETE TO authenticated USING (true);