
-- Module permissions infrastructure for unified Ather platform

-- 1. Backfill purity-only users into unified swap_profiles (skip conflicts on username)
INSERT INTO public.swap_profiles (id, username, email, is_admin)
SELECT p.id, p.username, p.email, false
FROM public.purity_profiles p
WHERE NOT EXISTS (SELECT 1 FROM public.swap_profiles s WHERE s.id = p.id)
  AND NOT EXISTS (SELECT 1 FROM public.swap_profiles s WHERE s.username = p.username);

-- 2. Modules enum
DO $$ BEGIN
  CREATE TYPE public.app_module AS ENUM (
    'purity','margin','swap','premium','reports','audit','users','settings'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Permissions table
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

-- Security-definer helpers
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

-- RLS: users read own; admins read/write all
CREATE POLICY ump_select_self ON public.user_module_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_admin(auth.uid()));
CREATE POLICY ump_admin_write ON public.user_module_permissions FOR ALL TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

-- 4. Seed permissions per spec
-- Admin already is_admin=true → implicit full access. Mark explicitly too.
UPDATE public.swap_profiles SET is_admin = true WHERE username IN ('admin','khalil');

-- Salah: purity + margin + swap + reports (view/create/edit/export/share, no delete)
INSERT INTO public.user_module_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export, can_share)
SELECT s.id, m::public.app_module, true, true, true, false, true, true
FROM public.swap_profiles s
CROSS JOIN unnest(ARRAY['purity','margin','swap','reports']) AS m
WHERE s.username IN ('salah')
ON CONFLICT (user_id, module) DO UPDATE SET
  can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_edit=EXCLUDED.can_edit,
  can_delete=EXCLUDED.can_delete, can_export=EXCLUDED.can_export, can_share=EXCLUDED.can_share;

-- Wassim, SIF, Moussa: purity only
INSERT INTO public.user_module_permissions (user_id, module, can_view, can_create, can_edit, can_delete, can_export, can_share)
SELECT s.id, 'purity'::public.app_module, true, true, true, false, true, true
FROM public.swap_profiles s
WHERE lower(s.username) IN ('wassim','sif','moussa')
ON CONFLICT (user_id, module) DO UPDATE SET
  can_view=EXCLUDED.can_view, can_create=EXCLUDED.can_create, can_edit=EXCLUDED.can_edit,
  can_export=EXCLUDED.can_export, can_share=EXCLUDED.can_share;
