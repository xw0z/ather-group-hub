
-- Clients table
CREATE TABLE public.purity_clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL,
  phone text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purity_clients TO authenticated;
GRANT ALL ON public.purity_clients TO service_role;

ALTER TABLE public.purity_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY clients_owner_select ON public.purity_clients FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY clients_owner_insert ON public.purity_clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY clients_owner_update ON public.purity_clients FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY clients_owner_delete ON public.purity_clients FOR DELETE TO authenticated USING (auth.uid() = user_id);

-- Update trips: rename delivery_date -> departure_date, add arrival_date, purities
ALTER TABLE public.purity_trips RENAME COLUMN delivery_date TO departure_date;
ALTER TABLE public.purity_trips ADD COLUMN arrival_date date;
ALTER TABLE public.purity_trips ADD COLUMN declared_purity numeric NOT NULL DEFAULT 999;
ALTER TABLE public.purity_trips ADD COLUMN actual_purity numeric;

-- Update pieces: add client_id, drop per-piece purity (purity now lives at trip level)
ALTER TABLE public.purity_pieces ADD COLUMN client_id uuid REFERENCES public.purity_clients(id) ON DELETE SET NULL;
ALTER TABLE public.purity_pieces DROP COLUMN purity;

CREATE INDEX idx_pieces_trip ON public.purity_pieces(trip_id);
CREATE INDEX idx_pieces_client ON public.purity_pieces(client_id);
CREATE INDEX idx_pieces_weight ON public.purity_pieces(weight_grams);
