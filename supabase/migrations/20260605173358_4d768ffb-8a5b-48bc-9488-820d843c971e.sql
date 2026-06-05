
DROP POLICY IF EXISTS purity_trips_member_select ON public.purity_trips;
DROP POLICY IF EXISTS purity_trips_member_insert ON public.purity_trips;
DROP POLICY IF EXISTS purity_trips_member_update ON public.purity_trips;
DROP POLICY IF EXISTS purity_trips_member_delete ON public.purity_trips;
CREATE POLICY purity_trips_all ON public.purity_trips FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purity_clients_member_select ON public.purity_clients;
DROP POLICY IF EXISTS purity_clients_member_insert ON public.purity_clients;
DROP POLICY IF EXISTS purity_clients_member_update ON public.purity_clients;
DROP POLICY IF EXISTS purity_clients_member_delete ON public.purity_clients;
CREATE POLICY purity_clients_all ON public.purity_clients FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purity_pieces_member_select ON public.purity_pieces;
DROP POLICY IF EXISTS purity_pieces_member_insert ON public.purity_pieces;
DROP POLICY IF EXISTS purity_pieces_member_update ON public.purity_pieces;
DROP POLICY IF EXISTS purity_pieces_member_delete ON public.purity_pieces;
CREATE POLICY purity_pieces_all ON public.purity_pieces FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS purity_activity_log_member_select ON public.purity_activity_log;
DROP POLICY IF EXISTS purity_activity_log_member_insert ON public.purity_activity_log;
CREATE POLICY purity_activity_log_all ON public.purity_activity_log FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.purity_trips TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purity_clients TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purity_pieces TO anon, authenticated;
GRANT SELECT, INSERT ON public.purity_activity_log TO anon, authenticated;
