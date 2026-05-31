DROP TABLE IF EXISTS public.purity_swaps;

-- Swap users
CREATE TABLE public.swap_profiles (
  id UUID NOT NULL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  is_admin BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT ON public.swap_profiles TO authenticated;
GRANT ALL ON public.swap_profiles TO service_role;

ALTER TABLE public.swap_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap_profiles_select" ON public.swap_profiles
  FOR SELECT TO authenticated USING (true);

-- Helper: is the caller a Swap user?
CREATE OR REPLACE FUNCTION public.is_swap_user(_uid UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.swap_profiles WHERE id = _uid)
$$;

-- Swap entries
CREATE TABLE public.swap_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  client_name TEXT NOT NULL,
  usd_amount NUMERIC NOT NULL,
  annual_rate NUMERIC NOT NULL DEFAULT 5.4,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  end_date DATE,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_entries TO authenticated;
GRANT ALL ON public.swap_entries TO service_role;

ALTER TABLE public.swap_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap_entries_select" ON public.swap_entries
  FOR SELECT TO authenticated
  USING (public.is_swap_user(auth.uid()));

CREATE POLICY "swap_entries_insert" ON public.swap_entries
  FOR INSERT TO authenticated
  WITH CHECK (public.is_swap_user(auth.uid()) AND auth.uid() = user_id);

CREATE POLICY "swap_entries_update" ON public.swap_entries
  FOR UPDATE TO authenticated
  USING (public.is_swap_user(auth.uid()))
  WITH CHECK (public.is_swap_user(auth.uid()));

CREATE POLICY "swap_entries_delete" ON public.swap_entries
  FOR DELETE TO authenticated
  USING (public.is_swap_user(auth.uid()));