
-- 1. Columns
ALTER TABLE public.refineries
  ADD COLUMN IF NOT EXISTS code text,
  ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS icon_name text NOT NULL DEFAULT 'factory',
  ADD COLUMN IF NOT EXISTS icon_color text NOT NULL DEFAULT '#f59e0b',
  ADD COLUMN IF NOT EXISTS badge_color text NOT NULL DEFAULT '#fef3c7',
  ADD COLUMN IF NOT EXISTS default_fee_price numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS report_footer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_footer text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- 2. Backfill codes from existing names + per-refinery colors
UPDATE public.refineries SET code='3601', icon_color='#f97316', badge_color='#fed7aa'
  WHERE name='Refinery 3601' AND (code IS NULL OR code='');
UPDATE public.refineries SET code='3602', icon_color='#3b82f6', badge_color='#bfdbfe'
  WHERE name='Refinery 3602' AND (code IS NULL OR code='');
UPDATE public.refineries SET code='3604', icon_color='#22c55e', badge_color='#bbf7d0'
  WHERE name='Refinery 3604' AND (code IS NULL OR code='');

-- 3. Archive the test refinery
UPDATE public.refineries
   SET status='archived', archived_at=COALESCE(archived_at, now()),
       code = COALESCE(NULLIF(code,''), 'TEST')
 WHERE name='TEST — DO NOT USE (AUDIT)';

-- 4. For any remaining rows without a code, derive one from name
UPDATE public.refineries
   SET code = upper(regexp_replace(name, '[^A-Za-z0-9]', '', 'g'))
 WHERE code IS NULL OR code = '';

-- 5. Constraints
ALTER TABLE public.refineries
  ALTER COLUMN code SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS refineries_code_unique
  ON public.refineries (lower(code));

-- 6. Admin delete with dependency check + audit entry
CREATE OR REPLACE FUNCTION public.refinery_admin_delete(_refinery_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  uemail text;
  rname text;
  rcode text;
  cnt_clients int;
  cnt_tx int;
  cnt_mv int;
BEGIN
  IF NOT public.is_platform_admin(uid) THEN
    RAISE EXCEPTION 'Admin only';
  END IF;

  SELECT name, code INTO rname, rcode FROM public.refineries WHERE id = _refinery_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Refinery not found'; END IF;

  SELECT count(*) INTO cnt_clients FROM public.refinery_clients WHERE refinery_id = _refinery_id;
  SELECT count(*) INTO cnt_tx FROM public.refinery_transactions WHERE refinery_id = _refinery_id;
  SELECT count(*) INTO cnt_mv FROM public.refinery_stock_movements WHERE refinery_id = _refinery_id;
  IF (cnt_clients + cnt_tx + cnt_mv) > 0 THEN
    RAISE EXCEPTION 'Refinery has data (% clients, % transactions, % stock movements). Archive it instead.',
      cnt_clients, cnt_tx, cnt_mv;
  END IF;

  SELECT email INTO uemail FROM auth.users WHERE id = uid;

  DELETE FROM public.refinery_users WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_stock WHERE refinery_id = _refinery_id;
  DELETE FROM public.refinery_backup_settings WHERE refinery_id = _refinery_id;
  DELETE FROM public.refineries WHERE id = _refinery_id;

  INSERT INTO public.refinery_audit_log(refinery_id, user_id, user_email, action, details)
  VALUES (
    _refinery_id, uid, uemail, 'refinery.deleted',
    jsonb_build_object('name', rname, 'code', rcode)
  );
END $$;

REVOKE ALL ON FUNCTION public.refinery_admin_delete(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refinery_admin_delete(uuid) TO authenticated;
