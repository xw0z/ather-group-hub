
-- Shared data: all authenticated users can read/write the team's data
DROP POLICY IF EXISTS clients_owner_select ON public.purity_clients;
DROP POLICY IF EXISTS clients_owner_insert ON public.purity_clients;
DROP POLICY IF EXISTS clients_owner_update ON public.purity_clients;
DROP POLICY IF EXISTS clients_owner_delete ON public.purity_clients;

CREATE POLICY clients_shared_select ON public.purity_clients FOR SELECT TO authenticated USING (true);
CREATE POLICY clients_shared_insert ON public.purity_clients FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY clients_shared_update ON public.purity_clients FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY clients_shared_delete ON public.purity_clients FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS trips_owner_select ON public.purity_trips;
DROP POLICY IF EXISTS trips_owner_insert ON public.purity_trips;
DROP POLICY IF EXISTS trips_owner_update ON public.purity_trips;
DROP POLICY IF EXISTS trips_owner_delete ON public.purity_trips;

CREATE POLICY trips_shared_select ON public.purity_trips FOR SELECT TO authenticated USING (true);
CREATE POLICY trips_shared_insert ON public.purity_trips FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY trips_shared_update ON public.purity_trips FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY trips_shared_delete ON public.purity_trips FOR DELETE TO authenticated USING (true);

DROP POLICY IF EXISTS pieces_owner_select ON public.purity_pieces;
DROP POLICY IF EXISTS pieces_owner_insert ON public.purity_pieces;
DROP POLICY IF EXISTS pieces_owner_update ON public.purity_pieces;
DROP POLICY IF EXISTS pieces_owner_delete ON public.purity_pieces;

CREATE POLICY pieces_shared_select ON public.purity_pieces FOR SELECT TO authenticated USING (true);
CREATE POLICY pieces_shared_insert ON public.purity_pieces FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY pieces_shared_update ON public.purity_pieces FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE POLICY pieces_shared_delete ON public.purity_pieces FOR DELETE TO authenticated USING (true);
