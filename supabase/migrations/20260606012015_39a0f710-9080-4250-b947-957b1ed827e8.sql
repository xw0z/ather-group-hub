-- 1) Extend audit log with new compliance columns
ALTER TABLE public.swap_activity_log
  ADD COLUMN IF NOT EXISTS module text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text,
  ADD COLUMN IF NOT EXISTS old_values jsonb,
  ADD COLUMN IF NOT EXISTS new_values jsonb;

-- 2) Helpful indexes for filters
CREATE INDEX IF NOT EXISTS idx_swap_activity_log_module ON public.swap_activity_log(module);
CREATE INDEX IF NOT EXISTS idx_swap_activity_log_action ON public.swap_activity_log(action);
CREATE INDEX IF NOT EXISTS idx_swap_activity_log_user ON public.swap_activity_log(user_id);
CREATE INDEX IF NOT EXISTS idx_swap_activity_log_entity ON public.swap_activity_log(entity_type, entity_id);

-- 3) Immutability: block any UPDATE or DELETE via Postgres triggers
CREATE OR REPLACE FUNCTION public.swap_activity_log_immutable()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'swap_activity_log is append-only: % is not permitted', TG_OP;
END;
$$;

DROP TRIGGER IF EXISTS trg_swap_activity_log_no_update ON public.swap_activity_log;
CREATE TRIGGER trg_swap_activity_log_no_update
  BEFORE UPDATE ON public.swap_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.swap_activity_log_immutable();

DROP TRIGGER IF EXISTS trg_swap_activity_log_no_delete ON public.swap_activity_log;
CREATE TRIGGER trg_swap_activity_log_no_delete
  BEFORE DELETE ON public.swap_activity_log
  FOR EACH ROW EXECUTE FUNCTION public.swap_activity_log_immutable();

-- 4) Belt-and-suspenders: revoke UPDATE/DELETE/TRUNCATE from app roles.
--    service_role keeps INSERT/SELECT only.
REVOKE UPDATE, DELETE, TRUNCATE ON public.swap_activity_log FROM PUBLIC;
REVOKE UPDATE, DELETE, TRUNCATE ON public.swap_activity_log FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.swap_activity_log FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.swap_activity_log FROM service_role;
GRANT INSERT, SELECT ON public.swap_activity_log TO authenticated;
GRANT INSERT, SELECT ON public.swap_activity_log TO service_role;