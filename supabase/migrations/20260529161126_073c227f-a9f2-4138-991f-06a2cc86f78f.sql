
CREATE TABLE public.purity_profiles (
  id UUID NOT NULL PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT NOT NULL UNIQUE,
  email TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_purity_profiles_username_lower ON public.purity_profiles (lower(username));

GRANT SELECT ON public.purity_profiles TO authenticated;
GRANT ALL ON public.purity_profiles TO service_role;

ALTER TABLE public.purity_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view profiles"
ON public.purity_profiles FOR SELECT
TO authenticated
USING (true);
