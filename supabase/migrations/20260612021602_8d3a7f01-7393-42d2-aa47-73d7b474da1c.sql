CREATE TABLE public.swap_fee_locks (
  fee_date date PRIMARY KEY,
  locked_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  locked_by_email text,
  reason text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.swap_fee_locks TO authenticated;
GRANT ALL ON public.swap_fee_locks TO service_role;

ALTER TABLE public.swap_fee_locks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap users can view fee locks"
  ON public.swap_fee_locks
  FOR SELECT
  TO authenticated
  USING (public.is_swap_user(auth.uid()) OR public.is_platform_admin(auth.uid()));
