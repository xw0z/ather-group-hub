
-- Fix 1: Lock down purity_* tables — replace public 'true' policies with authenticated + is_purity_user
DROP POLICY IF EXISTS purity_activity_log_all ON public.purity_activity_log;
CREATE POLICY purity_activity_log_select ON public.purity_activity_log
  FOR SELECT TO authenticated
  USING (public.is_purity_user(auth.uid()));
CREATE POLICY purity_activity_log_insert ON public.purity_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_purity_user(auth.uid()) AND auth.uid() = user_id);

DROP POLICY IF EXISTS purity_clients_all ON public.purity_clients;
CREATE POLICY purity_clients_all ON public.purity_clients
  FOR ALL TO authenticated
  USING (public.is_purity_user(auth.uid()))
  WITH CHECK (public.is_purity_user(auth.uid()));

DROP POLICY IF EXISTS purity_pieces_all ON public.purity_pieces;
CREATE POLICY purity_pieces_all ON public.purity_pieces
  FOR ALL TO authenticated
  USING (public.is_purity_user(auth.uid()))
  WITH CHECK (public.is_purity_user(auth.uid()));

DROP POLICY IF EXISTS purity_trips_all ON public.purity_trips;
CREATE POLICY purity_trips_all ON public.purity_trips
  FOR ALL TO authenticated
  USING (public.is_purity_user(auth.uid()))
  WITH CHECK (public.is_purity_user(auth.uid()));

-- Fix 2: Prevent privilege escalation on refinery_users self-update.
-- A trigger blocks non-admins from changing role/status/refinery_id/user_id.
CREATE OR REPLACE FUNCTION public.refinery_users_prevent_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public.is_platform_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.status IS DISTINCT FROM OLD.status
     OR NEW.refinery_id IS DISTINCT FROM OLD.refinery_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only platform admins can change role, status, refinery_id, or user_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refinery_users_prevent_escalation ON public.refinery_users;
CREATE TRIGGER trg_refinery_users_prevent_escalation
  BEFORE UPDATE ON public.refinery_users
  FOR EACH ROW EXECUTE FUNCTION public.refinery_users_prevent_self_escalation();

-- Fix 3: Restrict swap_settings reads (contains xau_api_key) to platform admins only.
-- Application server code uses the service role client to read settings.
DROP POLICY IF EXISTS "Swap users can view settings" ON public.swap_settings;
CREATE POLICY "Platform admins can view settings" ON public.swap_settings
  FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

-- Fix 4: Set immutable search_path on swap_activity_log_immutable function
CREATE OR REPLACE FUNCTION public.swap_activity_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  RAISE EXCEPTION 'swap_activity_log is append-only: % is not permitted', TG_OP;
END;
$$;
