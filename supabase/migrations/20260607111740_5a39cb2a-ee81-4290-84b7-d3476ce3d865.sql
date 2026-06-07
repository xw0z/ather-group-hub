
CREATE TABLE IF NOT EXISTS public.refinery_report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  report_type text NOT NULL DEFAULT 'account_statement',
  date_from date NOT NULL,
  date_to date NOT NULL,
  statement_number text,
  format text NOT NULL CHECK (format IN ('PNG','PDF','PREVIEW')),
  channel text NOT NULL DEFAULT 'download' CHECK (channel IN ('download','whatsapp','preview','copy')),
  generated_by uuid,
  generated_by_username text,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.refinery_report_history TO authenticated;
GRANT ALL ON public.refinery_report_history TO service_role;

ALTER TABLE public.refinery_report_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rrh_select" ON public.refinery_report_history
  FOR SELECT TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));

CREATE POLICY "rrh_insert" ON public.refinery_report_history
  FOR INSERT TO authenticated
  WITH CHECK (public.can_access_refinery(auth.uid(), refinery_id));

CREATE INDEX IF NOT EXISTS idx_rrh_ref ON public.refinery_report_history (refinery_id, created_at DESC);
