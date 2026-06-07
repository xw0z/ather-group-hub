
-- Profile page enhancements: avatar, password change tracking, login history, notification prefs, user prefs

ALTER TABLE public.swap_profiles
  ADD COLUMN IF NOT EXISTS avatar_url text,
  ADD COLUMN IF NOT EXISTS password_changed_at timestamptz;

-- Login history
CREATE TABLE IF NOT EXISTS public.swap_login_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip text,
  user_agent text,
  device text,
  browser text,
  status text NOT NULL DEFAULT 'success',
  identifier text
);
CREATE INDEX IF NOT EXISTS swap_login_history_user_time ON public.swap_login_history(user_id, occurred_at DESC);
GRANT SELECT ON public.swap_login_history TO authenticated;
GRANT ALL ON public.swap_login_history TO service_role;
ALTER TABLE public.swap_login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users read own login history" ON public.swap_login_history
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

-- Notification preferences
CREATE TABLE IF NOT EXISTS public.swap_notification_prefs (
  user_id uuid PRIMARY KEY,
  email_enabled boolean NOT NULL DEFAULT true,
  margin_alerts boolean NOT NULL DEFAULT true,
  backup_notifications boolean NOT NULL DEFAULT true,
  security_notifications boolean NOT NULL DEFAULT true,
  system_announcements boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.swap_notification_prefs TO authenticated;
GRANT ALL ON public.swap_notification_prefs TO service_role;
ALTER TABLE public.swap_notification_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own notif prefs" ON public.swap_notification_prefs
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- User preferences (theme, formats)
CREATE TABLE IF NOT EXISTS public.swap_user_preferences (
  user_id uuid PRIMARY KEY,
  theme text NOT NULL DEFAULT 'system',
  number_format text NOT NULL DEFAULT 'en',
  date_format text NOT NULL DEFAULT 'DD/MM/YYYY',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.swap_user_preferences TO authenticated;
GRANT ALL ON public.swap_user_preferences TO service_role;
ALTER TABLE public.swap_user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users manage own prefs" ON public.swap_user_preferences
  FOR ALL TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
