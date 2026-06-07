CREATE TABLE public.refinery_client_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES public.refinery_clients(id) ON DELETE CASCADE,
  author_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  author_name text NOT NULL DEFAULT '',
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_refinery_client_notes_client ON public.refinery_client_notes(client_id, created_at DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.refinery_client_notes TO authenticated;
GRANT ALL ON public.refinery_client_notes TO service_role;

ALTER TABLE public.refinery_client_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rcn_all"
  ON public.refinery_client_notes FOR ALL
  TO authenticated
  USING (can_access_refinery(auth.uid(), refinery_id))
  WITH CHECK (can_access_refinery(auth.uid(), refinery_id));
