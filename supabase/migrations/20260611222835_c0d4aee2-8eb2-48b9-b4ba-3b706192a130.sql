-- 1. Revoke EXECUTE from anon on all SECURITY DEFINER functions in public
REVOKE EXECUTE ON FUNCTION public.can_access_refinery(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.has_module_permission(uuid, app_module, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_platform_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_purity_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_refinery_admin(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_swap_user(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_create_buysell(uuid, uuid, text, text, numeric, numeric, numeric, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_create_buysell(uuid, uuid, text, text, numeric, numeric, numeric, date, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_create_settlement(uuid, uuid, uuid, text, numeric, boolean, numeric, numeric, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_create_stock_adjustment(uuid, text, text, numeric, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_delete_settlement(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_delete_stock_adjustment(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_edit_settlement(uuid, uuid, uuid, text, numeric, boolean, numeric, numeric, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_edit_stock_adjustment(uuid, text, text, numeric, date, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_generate_client_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_restore_from_payload(uuid, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_reverse_transaction(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_settle_transaction(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_tx_auto_settle() FROM anon;
REVOKE EXECUTE ON FUNCTION public.refinery_users_prevent_self_escalation() FROM anon;
REVOKE EXECUTE ON FUNCTION public.user_refinery_id(uuid) FROM anon;

-- 2. Document swap_settings — RLS enabled with zero policies is intentional.
COMMENT ON TABLE public.swap_settings IS
  'Server-only configuration table. RLS is enabled with NO policies on purpose: '
  'this denies all access through the Data API for both anon and authenticated roles. '
  'Reads/writes must go through trusted server-side code using the service_role key '
  '(e.g. createServerFn handlers loading @/integrations/supabase/client.server). '
  'Do NOT add a permissive policy without a security review.';