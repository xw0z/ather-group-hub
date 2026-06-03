
CREATE TABLE public.swap_settings (
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

GRANT SELECT ON public.swap_settings TO authenticated;
GRANT ALL ON public.swap_settings TO service_role;

ALTER TABLE public.swap_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Swap users can view settings"
  ON public.swap_settings
  FOR SELECT
  TO authenticated
  USING (public.is_swap_user(auth.uid()));

INSERT INTO public.swap_settings (id) VALUES ('global')
  ON CONFLICT (id) DO NOTHING;
