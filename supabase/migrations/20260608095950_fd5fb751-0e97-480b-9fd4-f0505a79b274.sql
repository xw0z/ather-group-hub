CREATE OR REPLACE FUNCTION public.is_purity_user(_uid uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.purity_profiles WHERE id = _uid)
    OR EXISTS (
      SELECT 1 FROM public.user_module_permissions
      WHERE user_id = _uid AND module = 'purity' AND can_view = true
    )
    OR public.is_platform_admin(_uid)
$function$;