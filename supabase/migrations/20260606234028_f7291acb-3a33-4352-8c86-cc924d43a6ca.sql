
ALTER FUNCTION public.refinery_touch_updated_at() SET search_path = public;
ALTER FUNCTION public.is_refinery_admin(uuid) SET search_path = public;
ALTER FUNCTION public.user_refinery_id(uuid) SET search_path = public;
ALTER FUNCTION public.can_access_refinery(uuid, uuid) SET search_path = public;
ALTER FUNCTION public.refinery_settle_transaction(uuid) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.is_refinery_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_refinery_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.can_access_refinery(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refinery_settle_transaction(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.is_refinery_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.user_refinery_id(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_refinery(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refinery_settle_transaction(uuid) TO authenticated;
