CREATE TABLE public.swap_xau_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price numeric NOT NULL,
  source text NOT NULL DEFAULT 'live',
  created_by uuid,
  username text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX swap_xau_snapshots_created_at_idx ON public.swap_xau_snapshots (created_at DESC);

GRANT SELECT, INSERT ON public.swap_xau_snapshots TO authenticated;
GRANT ALL ON public.swap_xau_snapshots TO service_role;

ALTER TABLE public.swap_xau_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap_xau_snapshots_select"
  ON public.swap_xau_snapshots
  FOR SELECT TO authenticated
  USING (is_swap_user(auth.uid()));

CREATE POLICY "swap_xau_snapshots_insert"
  ON public.swap_xau_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (is_swap_user(auth.uid()));
