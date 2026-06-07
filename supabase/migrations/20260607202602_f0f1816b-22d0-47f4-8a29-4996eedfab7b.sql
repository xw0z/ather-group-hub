
-- Add locale to user preferences
ALTER TABLE public.swap_user_preferences
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'en'
  CHECK (locale IN ('en','fr','ar'));

-- Translation overrides table for admin-editable translations
CREATE TABLE IF NOT EXISTS public.swap_translation_overrides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('en','fr','ar')),
  value text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, locale)
);

GRANT SELECT ON public.swap_translation_overrides TO authenticated;
GRANT ALL ON public.swap_translation_overrides TO service_role;

ALTER TABLE public.swap_translation_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read translation overrides"
  ON public.swap_translation_overrides
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Platform admins can manage translation overrides"
  ON public.swap_translation_overrides
  FOR ALL
  TO authenticated
  USING (public.is_platform_admin(auth.uid()))
  WITH CHECK (public.is_platform_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS swap_translation_overrides_locale_idx
  ON public.swap_translation_overrides(locale);

CREATE OR REPLACE FUNCTION public.swap_translation_overrides_touch()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS swap_translation_overrides_touch ON public.swap_translation_overrides;
CREATE TRIGGER swap_translation_overrides_touch
  BEFORE UPDATE ON public.swap_translation_overrides
  FOR EACH ROW EXECUTE FUNCTION public.swap_translation_overrides_touch();
