
-- =========================================
-- Backup module: tables + restore RPC
-- =========================================

-- 1) Backup snapshots
CREATE TABLE IF NOT EXISTS public.refinery_backups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid NOT NULL REFERENCES public.refineries(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size_bytes bigint NOT NULL DEFAULT 0,
  kind text NOT NULL DEFAULT 'manual' CHECK (kind IN ('manual','scheduled','safety')),
  schema_version int NOT NULL DEFAULT 1,
  payload jsonb NOT NULL,
  created_by uuid,
  created_by_email text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refinery_backups_refinery_idx
  ON public.refinery_backups(refinery_id, created_at DESC);

GRANT SELECT, INSERT, DELETE ON public.refinery_backups TO authenticated;
GRANT ALL ON public.refinery_backups TO service_role;

ALTER TABLE public.refinery_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage backups"
  ON public.refinery_backups FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 2) Per-refinery backup settings
CREATE TABLE IF NOT EXISTS public.refinery_backup_settings (
  refinery_id uuid PRIMARY KEY REFERENCES public.refineries(id) ON DELETE CASCADE,
  daily_enabled boolean NOT NULL DEFAULT false,
  daily_time time NOT NULL DEFAULT '02:00',
  keep_last int NOT NULL DEFAULT 30 CHECK (keep_last >= 1 AND keep_last <= 500),
  updated_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.refinery_backup_settings TO authenticated;
GRANT ALL ON public.refinery_backup_settings TO service_role;

ALTER TABLE public.refinery_backup_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins manage backup settings"
  ON public.refinery_backup_settings FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 3) Audit log for backup/restore actions
CREATE TABLE IF NOT EXISTS public.refinery_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinery_id uuid REFERENCES public.refineries(id) ON DELETE SET NULL,
  user_id uuid,
  user_email text,
  action text NOT NULL,
  file_name text,
  details jsonb,
  ip text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refinery_audit_log_refinery_idx
  ON public.refinery_audit_log(refinery_id, created_at DESC);

GRANT SELECT ON public.refinery_audit_log TO authenticated;
GRANT ALL ON public.refinery_audit_log TO service_role;

ALTER TABLE public.refinery_audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Platform admins read audit log"
  ON public.refinery_audit_log FOR SELECT TO authenticated
  USING (public.is_platform_admin(auth.uid()));

CREATE OR REPLACE FUNCTION public.refinery_audit_log_immutable()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $$
BEGIN
  RAISE EXCEPTION 'refinery_audit_log is append-only: % is not permitted', TG_OP;
END $$;

DROP TRIGGER IF EXISTS refinery_audit_log_no_update ON public.refinery_audit_log;
CREATE TRIGGER refinery_audit_log_no_update
  BEFORE UPDATE OR DELETE ON public.refinery_audit_log
  FOR EACH ROW EXECUTE FUNCTION public.refinery_audit_log_immutable();

-- 4) Atomic restore RPC
-- Wipes all data for the given refinery, then re-inserts from the payload.
-- Runs as a single transaction; raises on any failure for full rollback.
CREATE OR REPLACE FUNCTION public.refinery_restore_from_payload(
  _refinery_id uuid,
  _payload jsonb
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  payload_ref uuid;
BEGIN
  IF NOT public.is_platform_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  payload_ref := NULLIF(_payload->'refinery'->>'id','')::uuid;
  IF payload_ref IS NULL OR payload_ref <> _refinery_id THEN
    RAISE EXCEPTION 'Backup does not belong to this refinery';
  END IF;

  -- Wipe in FK-safe order
  DELETE FROM public.refinery_stock_movements WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_transaction_gold_bars
    WHERE transaction_id IN (SELECT id FROM public.refinery_transactions WHERE refinery_id = _refinery_id);
  DELETE FROM public.refinery_transactions WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_client_notes WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_position_snapshots WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_price_log WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_clients WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_stock WHERE refinery_id = _refinery_id;

  -- Restore stock
  IF jsonb_typeof(_payload->'stock') = 'object' THEN
    INSERT INTO public.refinery_stock
      SELECT * FROM jsonb_populate_record(NULL::public.refinery_stock, _payload->'stock');
  END IF;

  -- Restore clients
  IF jsonb_typeof(_payload->'clients') = 'array' THEN
    INSERT INTO public.refinery_clients
      SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_clients, _payload->'clients');
  END IF;

  -- Restore transactions
  IF jsonb_typeof(_payload->'transactions') = 'array' THEN
    INSERT INTO public.refinery_transactions
      SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_transactions, _payload->'transactions');
  END IF;

  -- Restore gold bars
  IF jsonb_typeof(_payload->'gold_bars') = 'array' THEN
    INSERT INTO public.refinery_transaction_gold_bars
      SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_transaction_gold_bars, _payload->'gold_bars');
  END IF;

  -- Restore stock movements
  IF jsonb_typeof(_payload->'stock_movements') = 'array' THEN
    INSERT INTO public.refinery_stock_movements
      SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_stock_movements, _payload->'stock_movements');
  END IF;

  -- Restore client notes
  IF jsonb_typeof(_payload->'client_notes') = 'array' THEN
    INSERT INTO public.refinery_client_notes
      SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_client_notes, _payload->'client_notes');
  END IF;

  -- Restore price log
  IF jsonb_typeof(_payload->'price_log') = 'array' THEN
    INSERT INTO public.refinery_price_log
      SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_price_log, _payload->'price_log');
  END IF;

  -- Restore position snapshots
  IF jsonb_typeof(_payload->'position_snapshots') = 'array' THEN
    INSERT INTO public.refinery_position_snapshots
      SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_position_snapshots, _payload->'position_snapshots');
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.refinery_restore_from_payload(uuid, jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.refinery_restore_from_payload(uuid, jsonb) TO service_role;
