
-- 1) Role-rank helper
CREATE OR REPLACE FUNCTION public.has_refinery_role(_uid uuid, _rid uuid, _min_role public.refinery_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    public.is_platform_admin(_uid)
    OR EXISTS (
      SELECT 1
      FROM public.refinery_users ru
      WHERE ru.user_id = _uid
        AND ru.refinery_id = _rid
        AND ru.status = 'active'
        AND (
          CASE ru.role
            WHEN 'viewer'  THEN 1
            WHEN 'staff'   THEN 2
            WHEN 'manager' THEN 3
          END
        ) >= (
          CASE _min_role
            WHEN 'viewer'  THEN 1
            WHEN 'staff'   THEN 2
            WHEN 'manager' THEN 3
          END
        )
    )
$$;

REVOKE EXECUTE ON FUNCTION public.has_refinery_role(uuid, uuid, public.refinery_role) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.has_refinery_role(uuid, uuid, public.refinery_role) TO authenticated, service_role;

-- 2) Lock down mutating RPCs so authenticated clients cannot bypass server functions
DO $$
DECLARE
  fn text;
  fns text[] := ARRAY[
    'refinery_settle_transaction(uuid)',
    'refinery_reverse_transaction(uuid)',
    'refinery_create_settlement(uuid,uuid,uuid,text,numeric,boolean,numeric,numeric,date,text)',
    'refinery_edit_settlement(uuid,uuid,uuid,text,numeric,boolean,numeric,numeric,date,text)',
    'refinery_delete_settlement(uuid)',
    'refinery_create_stock_adjustment(uuid,text,text,numeric,text)',
    'refinery_edit_stock_adjustment(uuid,text,text,numeric,date,text)',
    'refinery_delete_stock_adjustment(uuid)',
    'refinery_create_buysell(uuid,uuid,text,text,numeric,numeric,numeric,date,text)',
    'refinery_create_buysell(uuid,uuid,text,text,numeric,numeric,numeric,date,text,text)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', fn);
    EXECUTE format('GRANT  EXECUTE ON FUNCTION public.%s TO service_role', fn);
  END LOOP;
END $$;

-- 3) Tighten RLS on tables that the app reads from the user-scoped client

-- refinery_clients: split read (any member) from write (manager+)
DROP POLICY IF EXISTS rc_all ON public.refinery_clients;
CREATE POLICY rc_select ON public.refinery_clients
  FOR SELECT TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));
CREATE POLICY rc_insert ON public.refinery_clients
  FOR INSERT TO authenticated
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'manager'));
CREATE POLICY rc_update ON public.refinery_clients
  FOR UPDATE TO authenticated
  USING (public.has_refinery_role(auth.uid(), refinery_id, 'manager'))
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'manager'));
CREATE POLICY rc_delete ON public.refinery_clients
  FOR DELETE TO authenticated
  USING (public.has_refinery_role(auth.uid(), refinery_id, 'manager'));

-- refinery_client_notes: read any member, write staff+
DROP POLICY IF EXISTS rcn_all ON public.refinery_client_notes;
CREATE POLICY rcn_select ON public.refinery_client_notes
  FOR SELECT TO authenticated
  USING (public.can_access_refinery(auth.uid(), refinery_id));
CREATE POLICY rcn_insert ON public.refinery_client_notes
  FOR INSERT TO authenticated
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'staff'));
CREATE POLICY rcn_update ON public.refinery_client_notes
  FOR UPDATE TO authenticated
  USING (public.has_refinery_role(auth.uid(), refinery_id, 'staff'))
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'staff'));
CREATE POLICY rcn_delete ON public.refinery_client_notes
  FOR DELETE TO authenticated
  USING (public.has_refinery_role(auth.uid(), refinery_id, 'staff'));

-- refinery_price_log: insert staff+
DROP POLICY IF EXISTS refinery_price_log_insert ON public.refinery_price_log;
CREATE POLICY refinery_price_log_insert ON public.refinery_price_log
  FOR INSERT TO authenticated
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'staff'));

-- refinery_report_history: insert staff+
DROP POLICY IF EXISTS rrh_insert ON public.refinery_report_history;
CREATE POLICY rrh_insert ON public.refinery_report_history
  FOR INSERT TO authenticated
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'staff'));

-- refinery_position_snapshots: insert/update/delete manager+
DROP POLICY IF EXISTS "Refinery users can insert snapshots" ON public.refinery_position_snapshots;
DROP POLICY IF EXISTS "Refinery users can update snapshots" ON public.refinery_position_snapshots;
DROP POLICY IF EXISTS "Refinery users can delete snapshots" ON public.refinery_position_snapshots;
CREATE POLICY rps_insert ON public.refinery_position_snapshots
  FOR INSERT TO authenticated
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'manager'));
CREATE POLICY rps_update ON public.refinery_position_snapshots
  FOR UPDATE TO authenticated
  USING (public.has_refinery_role(auth.uid(), refinery_id, 'manager'))
  WITH CHECK (public.has_refinery_role(auth.uid(), refinery_id, 'manager'));
CREATE POLICY rps_delete ON public.refinery_position_snapshots
  FOR DELETE TO authenticated
  USING (public.has_refinery_role(auth.uid(), refinery_id, 'manager'));
