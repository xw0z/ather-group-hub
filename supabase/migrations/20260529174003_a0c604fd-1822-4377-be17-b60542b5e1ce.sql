CREATE TABLE public.purity_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  username text NOT NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid NULL,
  details jsonb NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.purity_activity_log TO authenticated;
GRANT ALL ON public.purity_activity_log TO service_role;

ALTER TABLE public.purity_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "activity_log_shared_select"
ON public.purity_activity_log
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "activity_log_shared_insert"
ON public.purity_activity_log
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_purity_activity_log_created_at ON public.purity_activity_log (created_at DESC);