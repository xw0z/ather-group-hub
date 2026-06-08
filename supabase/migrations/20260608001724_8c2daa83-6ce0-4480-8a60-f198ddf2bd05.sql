-- 1. Remove publicly-readable SELECT policy on swap_settings (server uses service role)
DROP POLICY IF EXISTS "Platform admins can view settings" ON public.swap_settings;

-- 2. Remove self-update policy on refinery_users (privilege escalation risk).
-- All legitimate self-updates go through SECURITY DEFINER server functions using service role.
DROP POLICY IF EXISTS ru_self_update ON public.refinery_users;

-- 3. Add is_admin flag to purity_profiles and seed from current 'admin' username
ALTER TABLE public.purity_profiles
  ADD COLUMN IF NOT EXISTS is_admin boolean NOT NULL DEFAULT false;

UPDATE public.purity_profiles
  SET is_admin = true
  WHERE lower(username) = 'admin';