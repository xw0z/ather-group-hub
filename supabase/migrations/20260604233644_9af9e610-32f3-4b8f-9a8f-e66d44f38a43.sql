
-- Helper to check purity workspace membership
CREATE OR REPLACE FUNCTION public.is_purity_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.purity_profiles WHERE id = _uid) $$;

-- Tighten purity_* policies: only purity workspace members may read/modify
DROP POLICY IF EXISTS clients_shared_select ON public.purity_clients;
DROP POLICY IF EXISTS clients_shared_insert ON public.purity_clients;
DROP POLICY IF EXISTS clients_shared_update ON public.purity_clients;
DROP POLICY IF EXISTS clients_shared_delete ON public.purity_clients;
CREATE POLICY purity_clients_member_select ON public.purity_clients FOR SELECT TO authenticated USING (public.is_purity_user(auth.uid()));
CREATE POLICY purity_clients_member_insert ON public.purity_clients FOR INSERT TO authenticated WITH CHECK (public.is_purity_user(auth.uid()));
CREATE POLICY purity_clients_member_update ON public.purity_clients FOR UPDATE TO authenticated USING (public.is_purity_user(auth.uid())) WITH CHECK (public.is_purity_user(auth.uid()));
CREATE POLICY purity_clients_member_delete ON public.purity_clients FOR DELETE TO authenticated USING (public.is_purity_user(auth.uid()));

DROP POLICY IF EXISTS trips_shared_select ON public.purity_trips;
DROP POLICY IF EXISTS trips_shared_insert ON public.purity_trips;
DROP POLICY IF EXISTS trips_shared_update ON public.purity_trips;
DROP POLICY IF EXISTS trips_shared_delete ON public.purity_trips;
CREATE POLICY purity_trips_member_select ON public.purity_trips FOR SELECT TO authenticated USING (public.is_purity_user(auth.uid()));
CREATE POLICY purity_trips_member_insert ON public.purity_trips FOR INSERT TO authenticated WITH CHECK (public.is_purity_user(auth.uid()));
CREATE POLICY purity_trips_member_update ON public.purity_trips FOR UPDATE TO authenticated USING (public.is_purity_user(auth.uid())) WITH CHECK (public.is_purity_user(auth.uid()));
CREATE POLICY purity_trips_member_delete ON public.purity_trips FOR DELETE TO authenticated USING (public.is_purity_user(auth.uid()));

DROP POLICY IF EXISTS pieces_shared_select ON public.purity_pieces;
DROP POLICY IF EXISTS pieces_shared_insert ON public.purity_pieces;
DROP POLICY IF EXISTS pieces_shared_update ON public.purity_pieces;
DROP POLICY IF EXISTS pieces_shared_delete ON public.purity_pieces;
CREATE POLICY purity_pieces_member_select ON public.purity_pieces FOR SELECT TO authenticated USING (public.is_purity_user(auth.uid()));
CREATE POLICY purity_pieces_member_insert ON public.purity_pieces FOR INSERT TO authenticated WITH CHECK (public.is_purity_user(auth.uid()));
CREATE POLICY purity_pieces_member_update ON public.purity_pieces FOR UPDATE TO authenticated USING (public.is_purity_user(auth.uid())) WITH CHECK (public.is_purity_user(auth.uid()));
CREATE POLICY purity_pieces_member_delete ON public.purity_pieces FOR DELETE TO authenticated USING (public.is_purity_user(auth.uid()));

DROP POLICY IF EXISTS activity_log_shared_select ON public.purity_activity_log;
DROP POLICY IF EXISTS activity_log_shared_insert ON public.purity_activity_log;
CREATE POLICY purity_activity_log_member_select ON public.purity_activity_log FOR SELECT TO authenticated USING (public.is_purity_user(auth.uid()));
CREATE POLICY purity_activity_log_member_insert ON public.purity_activity_log FOR INSERT TO authenticated WITH CHECK (public.is_purity_user(auth.uid()));

-- Revoke column-level access to swap_settings secrets for authenticated role.
-- Re-grant SELECT on all other columns to keep client reads (via RLS) working.
REVOKE SELECT ON public.swap_settings FROM authenticated;
GRANT SELECT (
  id,
  default_long_annual_rate,
  default_short_annual_rate,
  wednesday_multiplier,
  skip_saturday,
  skip_sunday,
  default_margin_requirement_pct,
  safe_threshold_pct,
  warning_threshold_pct,
  xau_auto_refresh_seconds,
  xau_manual_fallback_price,
  company_name,
  report_footer_text,
  confidentiality_text,
  show_logo_on_reports,
  default_report_format,
  language,
  updated_at,
  updated_by
) ON public.swap_settings TO authenticated;
