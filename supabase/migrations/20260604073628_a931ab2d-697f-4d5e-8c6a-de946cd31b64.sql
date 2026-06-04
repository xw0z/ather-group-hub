
-- ============ 1. swap_clients margin columns + swap_margin_history ============
ALTER TABLE public.swap_clients
  ADD COLUMN IF NOT EXISTS gold_kg numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xauusd_price numeric,
  ADD COLUMN IF NOT EXISTS margin_requirement_pct numeric NOT NULL DEFAULT 20;

CREATE TABLE IF NOT EXISTS public.swap_margin_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  username text NOT NULL,
  changed_field text NOT NULL,
  old_usd_balance numeric, new_usd_balance numeric,
  old_gold_kg numeric, new_gold_kg numeric,
  old_xauusd_price numeric, new_xauusd_price numeric,
  old_margin_pct numeric, new_margin_pct numeric,
  old_required_margin numeric, new_required_margin numeric,
  old_available_margin numeric, new_available_margin numeric,
  old_status text, new_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.swap_margin_history TO authenticated;
GRANT ALL ON public.swap_margin_history TO service_role;
ALTER TABLE public.swap_margin_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "swap_margin_history_select" ON public.swap_margin_history;
CREATE POLICY "swap_margin_history_select" ON public.swap_margin_history
  FOR SELECT TO authenticated USING (is_swap_user(auth.uid()));
DROP POLICY IF EXISTS "swap_margin_history_insert" ON public.swap_margin_history;
CREATE POLICY "swap_margin_history_insert" ON public.swap_margin_history
  FOR INSERT TO authenticated WITH CHECK (is_swap_user(auth.uid()) AND auth.uid() = user_id);
CREATE INDEX IF NOT EXISTS idx_swap_margin_history_client_id
  ON public.swap_margin_history(client_id, created_at DESC);

-- ============ 2. swap_xau_snapshots ============
CREATE TABLE IF NOT EXISTS public.swap_xau_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  price numeric NOT NULL,
  source text NOT NULL DEFAULT 'live',
  created_by uuid,
  username text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swap_xau_snapshots_created_at_idx ON public.swap_xau_snapshots (created_at DESC);
GRANT SELECT, INSERT ON public.swap_xau_snapshots TO authenticated;
GRANT ALL ON public.swap_xau_snapshots TO service_role;
ALTER TABLE public.swap_xau_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "swap_xau_snapshots_select" ON public.swap_xau_snapshots;
CREATE POLICY "swap_xau_snapshots_select" ON public.swap_xau_snapshots
  FOR SELECT TO authenticated USING (is_swap_user(auth.uid()));
DROP POLICY IF EXISTS "swap_xau_snapshots_insert" ON public.swap_xau_snapshots;
CREATE POLICY "swap_xau_snapshots_insert" ON public.swap_xau_snapshots
  FOR INSERT TO authenticated WITH CHECK (is_swap_user(auth.uid()));

-- ============ 3. swap_settings ============
CREATE TABLE IF NOT EXISTS public.swap_settings (
  id text PRIMARY KEY DEFAULT 'global',
  default_long_annual_rate numeric NOT NULL DEFAULT 5.4,
  default_short_annual_rate numeric NOT NULL DEFAULT 2.5,
  wednesday_multiplier numeric NOT NULL DEFAULT 3,
  skip_saturday boolean NOT NULL DEFAULT true,
  skip_sunday boolean NOT NULL DEFAULT true,
  default_margin_requirement_pct numeric NOT NULL DEFAULT 10,
  safe_threshold_pct numeric NOT NULL DEFAULT 120,
  warning_threshold_pct numeric NOT NULL DEFAULT 100,
  xau_api_provider text,
  xau_api_key text,
  xau_auto_refresh_seconds integer NOT NULL DEFAULT 60,
  xau_manual_fallback_price numeric,
  company_name text NOT NULL DEFAULT 'ATHER GROUP',
  report_footer_text text,
  confidentiality_text text NOT NULL DEFAULT 'Confidential Client Report',
  show_logo_on_reports boolean NOT NULL DEFAULT true,
  default_report_format text NOT NULL DEFAULT 'PNG',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid,
  CONSTRAINT swap_settings_singleton CHECK (id = 'global')
);
ALTER TABLE public.swap_settings
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'
  CHECK (language IN ('en','ar','fr'));
GRANT SELECT ON public.swap_settings TO authenticated;
GRANT ALL ON public.swap_settings TO service_role;
ALTER TABLE public.swap_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Swap users can view settings" ON public.swap_settings;
CREATE POLICY "Swap users can view settings" ON public.swap_settings
  FOR SELECT TO authenticated USING (public.is_swap_user(auth.uid()));
INSERT INTO public.swap_settings (id) VALUES ('global') ON CONFLICT (id) DO NOTHING;
-- Security: hide API key columns from authenticated/anon
REVOKE SELECT (xau_api_key, xau_api_provider) ON public.swap_settings FROM authenticated;
REVOKE SELECT (xau_api_key, xau_api_provider) ON public.swap_settings FROM anon;

-- ============ 4. swap_report_history ============
CREATE TABLE IF NOT EXISTS public.swap_report_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_type text NOT NULL CHECK (report_type IN ('margin','swap_fee','combined','portfolio')),
  client_id uuid REFERENCES public.swap_clients(id) ON DELETE SET NULL,
  client_code text,
  format text NOT NULL CHECK (format IN ('PNG','PDF')),
  channel text NOT NULL CHECK (channel IN ('download','whatsapp','copy')),
  generated_by uuid NOT NULL,
  generated_by_username text NOT NULL,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swap_report_history_created_at_idx ON public.swap_report_history (created_at DESC);
CREATE INDEX IF NOT EXISTS swap_report_history_client_id_idx ON public.swap_report_history (client_id);
GRANT SELECT, INSERT ON public.swap_report_history TO authenticated;
GRANT ALL ON public.swap_report_history TO service_role;
ALTER TABLE public.swap_report_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Swap users can view all report history" ON public.swap_report_history;
CREATE POLICY "Swap users can view all report history" ON public.swap_report_history
  FOR SELECT TO authenticated USING (public.is_swap_user(auth.uid()));
DROP POLICY IF EXISTS "Swap users can insert their own report history" ON public.swap_report_history;
CREATE POLICY "Swap users can insert their own report history" ON public.swap_report_history
  FOR INSERT TO authenticated WITH CHECK (public.is_swap_user(auth.uid()) AND generated_by = auth.uid());

-- ============ 5. swap_premium_companies / transactions ============
CREATE TABLE IF NOT EXISTS public.swap_premium_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_premium_companies TO authenticated;
GRANT ALL ON public.swap_premium_companies TO service_role;
ALTER TABLE public.swap_premium_companies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "swap users manage premium companies" ON public.swap_premium_companies;
CREATE POLICY "swap users manage premium companies"
  ON public.swap_premium_companies FOR ALL TO authenticated
  USING (public.is_swap_user(auth.uid())) WITH CHECK (public.is_swap_user(auth.uid()));
DROP TRIGGER IF EXISTS swap_premium_companies_touch ON public.swap_premium_companies;
CREATE TRIGGER swap_premium_companies_touch
  BEFORE UPDATE ON public.swap_premium_companies
  FOR EACH ROW EXECUTE FUNCTION public.swap_clients_touch();

CREATE TABLE IF NOT EXISTS public.swap_premium_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.swap_premium_companies(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('add','remove','adjust','discount','premium')),
  grams NUMERIC NOT NULL DEFAULT 0,
  per_oz NUMERIC,
  amount_usd NUMERIC,
  notes TEXT,
  created_by UUID NOT NULL,
  username TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS swap_premium_tx_company_idx ON public.swap_premium_transactions(company_id, created_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_premium_transactions TO authenticated;
GRANT ALL ON public.swap_premium_transactions TO service_role;
ALTER TABLE public.swap_premium_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "swap users manage premium transactions" ON public.swap_premium_transactions;
CREATE POLICY "swap users manage premium transactions"
  ON public.swap_premium_transactions FOR ALL TO authenticated
  USING (public.is_swap_user(auth.uid())) WITH CHECK (public.is_swap_user(auth.uid()));

-- ============ 6. Module permissions ============
INSERT INTO public.swap_profiles (id, username, email, is_admin)
SELECT p.id, p.username, p.email, false
FROM public.purity_profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.swap_profiles s WHERE s.id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.swap_profiles s WHERE s.username = p.username);

DO $$ BEGIN
  CREATE TYPE public.app_module AS ENUM ('purity','margin','swap','premium','reports','audit','users','settings');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module public.app_module NOT NULL,
  can_view boolean NOT NULL DEFAULT false,
  can_create boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  can_delete boolean NOT NULL DEFAULT false,
  can_export boolean NOT NULL DEFAULT false,
  can_share boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, module)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_module_permissions TO authenticated;
GRANT ALL ON public.user_module_permissions TO service_role;
ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_admin(_uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.swap_profiles WHERE id = _uid AND is_admin = true) $$;

CREATE OR REPLACE FUNCTION public.has_module_permission(_uid uuid, _module public.app_module, _action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE row public.user_module_permissions; BEGIN
  IF public.is_platform_admin(_uid) THEN RETURN true; END IF;
  SELECT * INTO row FROM public.user_module_permissions WHERE user_id = _uid AND module = _module;
  IF NOT FOUND THEN RETURN false; END IF;
  RETURN CASE _action
    WHEN 'view' THEN row.can_view
    WHEN 'create' THEN row.can_create
    WHEN 'edit' THEN row.can_edit
    WHEN 'delete' THEN row.can_delete
    WHEN 'export' THEN row.can_export
    WHEN 'share' THEN row.can_share
    ELSE false END;
END $$;

DROP POLICY IF EXISTS ump_select_self ON public.user_module_permissions;
CREATE POLICY ump_select_self ON public.user_module_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
DROP POLICY IF EXISTS ump_admin_write ON public.user_module_permissions;
CREATE POLICY ump_admin_write ON public.user_module_permissions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid())) WITH CHECK (public.is_platform_admin(auth.uid()));

UPDATE public.swap_profiles SET is_admin = true WHERE username IN ('admin','khalil');

INSERT INTO public.user_module_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export, can_share)
SELECT s.id, m::public.app_module, true, true, true, false, true, true
FROM public.swap_profiles s
CROSS JOIN unnest(ARRAY['purity','margin','swap','reports']) AS m
WHERE s.username IN ('salah')
ON CONFLICT (user_id, module) DO UPDATE SET
  can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_edit=EXCLUDED.can_edit,
  can_delete=EXCLUDED.can_delete, can_export=EXCLUDED.can_export, can_share=EXCLUDED.can_share;

INSERT INTO public.user_module_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export, can_share)
SELECT s.id, 'purity'::public.app_module, true, true, true, false, true, true
FROM public.swap_profiles s
WHERE lower(s.username) IN ('wassim','sif','moussa')
ON CONFLICT (user_id, module) DO UPDATE SET
  can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_edit=EXCLUDED.can_edit,
  can_export=EXCLUDED.can_export, can_share=EXCLUDED.can_share;

-- ============ 7. Security: tighten profile SELECT policies ============
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.purity_profiles;
DROP POLICY IF EXISTS "Users can view own purity profile" ON public.purity_profiles;
CREATE POLICY "Users can view own purity profile"
  ON public.purity_profiles FOR SELECT TO authenticated USING (auth.uid() = id);

DROP POLICY IF EXISTS swap_profiles_select ON public.swap_profiles;
CREATE POLICY swap_profiles_select ON public.swap_profiles
  FOR SELECT TO authenticated USING (is_swap_user(auth.uid()) OR auth.uid() = id);

-- ============ 8. Purity FK hardening (ON DELETE SET NULL) ============
ALTER TABLE public.purity_trips ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.purity_clients ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.purity_activity_log ALTER COLUMN user_id DROP NOT NULL;

UPDATE public.purity_clients SET user_id = NULL
  WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM auth.users);
UPDATE public.purity_trips SET user_id = NULL
  WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM auth.users);
UPDATE public.purity_activity_log SET user_id = NULL
  WHERE user_id IS NOT NULL AND user_id NOT IN (SELECT id FROM auth.users);

ALTER TABLE public.purity_trips DROP CONSTRAINT IF EXISTS purity_trips_user_id_fkey;
ALTER TABLE public.purity_trips ADD CONSTRAINT purity_trips_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purity_clients DROP CONSTRAINT IF EXISTS purity_clients_user_id_fkey;
ALTER TABLE public.purity_clients ADD CONSTRAINT purity_clients_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;

ALTER TABLE public.purity_activity_log DROP CONSTRAINT IF EXISTS purity_activity_log_user_id_fkey;
ALTER TABLE public.purity_activity_log ADD CONSTRAINT purity_activity_log_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
