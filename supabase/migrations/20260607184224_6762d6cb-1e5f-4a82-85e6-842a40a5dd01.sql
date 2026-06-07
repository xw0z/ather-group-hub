
CREATE TABLE public.refinery_price_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  gold_price numeric NOT NULL CHECK (gold_price >= 0),
  silver_price numeric NOT NULL CHECK (silver_price >= 0),
  set_by uuid,
  set_by_username text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX refinery_price_log_refinery_idx
  ON public.refinery_price_log (refinery_id, created_at DESC);

GRANT SELECT, INSERT ON public.refinery_price_log TO authenticated;
GRANT ALL ON public.refinery_price_log TO service_role;

ALTER TABLE public.refinery_price_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY refinery_price_log_select ON public.refinery_price_log
  FOR SELECT TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));

CREATE POLICY refinery_price_log_insert ON public.refinery_price_log
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_access_refinery(auth.uid(), refinery_id)
    AND (set_by IS NULL OR set_by = auth.uid())
  );
