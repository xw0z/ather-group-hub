-- App-wide backup/restore audit + safety backups (purity, swap, margin, premium)

CREATE TABLE public.app_backup_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL CHECK (app IN ('purity','swap','margin','premium')),
  action text NOT NULL CHECK (action IN ('backup_created','backup_downloaded','restore_started','restore_completed','restore_failed')),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  user_email text,
  file_name text,
  safety_backup_id uuid,
  tables_affected text[],
  details jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_backup_audit_log TO authenticated;
GRANT ALL ON public.app_backup_audit_log TO service_role;
ALTER TABLE public.app_backup_audit_log ENABLE ROW LEVEL SECURITY;

-- Only platform admins can read the audit log; writes go through service_role
CREATE POLICY "Admins can read app backup audit log"
ON public.app_backup_audit_log FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

-- Append-only: block any direct mutation outside service_role
CREATE OR REPLACE FUNCTION public.app_backup_audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  RAISE EXCEPTION 'app_backup_audit_log is append-only: % is not permitted', TG_OP;
END $$;

CREATE TRIGGER app_backup_audit_log_no_update
BEFORE UPDATE OR DELETE ON public.app_backup_audit_log
FOR EACH ROW EXECUTE FUNCTION public.app_backup_audit_log_immutable();

-- Mandatory safety backups taken before every restore
CREATE TABLE public.app_safety_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  app text NOT NULL CHECK (app IN ('purity','swap','margin','premium')),
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  schema_version int NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.app_safety_backups TO authenticated;
GRANT ALL ON public.app_safety_backups TO service_role;
ALTER TABLE public.app_safety_backups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can read app safety backups"
ON public.app_safety_backups FOR SELECT
TO authenticated
USING (public.is_platform_admin(auth.uid()));

CREATE INDEX idx_app_backup_audit_log_app_created ON public.app_backup_audit_log(app, created_at DESC);
CREATE INDEX idx_app_safety_backups_app_created ON public.app_safety_backups(app, created_at DESC);