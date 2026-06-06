ALTER TABLE public.swap_settings
  ADD COLUMN IF NOT EXISTS default_additional_exposure_pct numeric NOT NULL DEFAULT 5;