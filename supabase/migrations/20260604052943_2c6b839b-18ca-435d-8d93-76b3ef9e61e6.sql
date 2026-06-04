-- Tighten purity_profiles SELECT to own row only (was readable by all authenticated users, exposing emails)
DROP POLICY IF EXISTS "Authenticated can view profiles" ON public.purity_profiles;
CREATE POLICY "Users can view own purity profile"
  ON public.purity_profiles
  FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

-- Tighten swap_profiles SELECT: only swap users can list profiles; any user can read their own row
DROP POLICY IF EXISTS swap_profiles_select ON public.swap_profiles;
CREATE POLICY swap_profiles_select
  ON public.swap_profiles
  FOR SELECT
  TO authenticated
  USING (is_swap_user(auth.uid()) OR auth.uid() = id);

-- Remove client read access to API key / provider columns on swap_settings.
-- These are still readable server-side via service-role (supabaseAdmin).
REVOKE SELECT (xau_api_key, xau_api_provider) ON public.swap_settings FROM authenticated;
REVOKE SELECT (xau_api_key, xau_api_provider) ON public.swap_settings FROM anon;