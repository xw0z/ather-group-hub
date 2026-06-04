
ALTER TABLE public.swap_settings
  ADD COLUMN IF NOT EXISTS language text NOT NULL DEFAULT 'en'
  CHECK (language IN ('en','ar','fr'));
