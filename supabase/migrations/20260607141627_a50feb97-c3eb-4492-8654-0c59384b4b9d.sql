ALTER TABLE public.refinery_report_history
  ADD COLUMN IF NOT EXISTS client_id uuid REFERENCES public.refinery_clients(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_rrh_client ON public.refinery_report_history(client_id, created_at DESC);