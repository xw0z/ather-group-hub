
CREATE TABLE public.swap_report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL CHECK (report_type IN ('margin','swap_fee','combined','portfolio')),
  client_id uuid REFERENCES public.swap_clients(id) ON DELETE SET NULL,
  client_code text,
  format text NOT NULL CHECK (format IN ('PNG','PDF')),
  channel text NOT NULL CHECK (channel IN ('download','whatsapp','copy')),
  generated_by uuid NOT NULL,
  generated_by_username text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX swap_report_history_created_at_idx ON public.swap_report_history (created_at DESC);
CREATE INDEX swap_report_history_client_id_idx ON public.swap_report_history (client_id);

GRANT SELECT, INSERT ON public.swap_report_history TO authenticated;
GRANT ALL ON public.swap_report_history TO service_role;

ALTER TABLE public.swap_report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Swap users can view all report history"
  ON public.swap_report_history
  FOR SELECT
  TO authenticated
  USING (public.is_swap_user(auth.uid()));

CREATE POLICY "Swap users can insert their own report history"
  ON public.swap_report_history
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_swap_user(auth.uid()) AND generated_by = auth.uid());
