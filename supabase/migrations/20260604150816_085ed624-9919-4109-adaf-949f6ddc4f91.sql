ALTER TABLE public.swap_profiles ADD COLUMN IF NOT EXISTS is_manager boolean NOT NULL DEFAULT false;
UPDATE public.swap_profiles SET is_manager = true WHERE username = 'salah';