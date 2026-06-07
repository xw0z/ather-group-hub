
CREATE TABLE public.refinery_position_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  pure_gold_stock numeric NOT NULL DEFAULT 0,
  silver_stock numeric NOT NULL DEFAULT 0,
  da_cash_balance numeric NOT NULL DEFAULT 0,
  net_gold_position numeric NOT NULL DEFAULT 0,
  gold_price numeric,
  silver_price numeric,
  created_by uuid,
  created_by_username text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (refinery_id, snapshot_date)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refinery_position_snapshots TO authenticated;
GRANT ALL ON public.refinery_position_snapshots TO service_role;

ALTER TABLE public.refinery_position_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Refinery users can view snapshots"
  ON public.refinery_position_snapshots
  FOR SELECT
  TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));

CREATE POLICY "Refinery users can insert snapshots"
  ON public.refinery_position_snapshots
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_refinery(auth.uid(), refinery_id));

CREATE POLICY "Refinery users can update snapshots"
  ON public.refinery_position_snapshots
  FOR UPDATE
  TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id))
  WITH CHECK (public.can_access_refinery(auth.uid(), refinery_id));

CREATE POLICY "Refinery users can delete snapshots"
  ON public.refinery_position_snapshots
  FOR DELETE
  TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));

CREATE TRIGGER refinery_position_snapshots_touch_updated_at
  BEFORE UPDATE ON public.refinery_position_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.refinery_touch_updated_at();

CREATE INDEX refinery_position_snapshots_refinery_date_idx
  ON public.refinery_position_snapshots (refinery_id, snapshot_date DESC);
