-- Add margin-related fields to swap_clients
ALTER TABLE public.swap_clients
  ADD COLUMN IF NOT EXISTS gold_kg numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS xauusd_price numeric,
  ADD COLUMN IF NOT EXISTS margin_requirement_pct numeric NOT NULL DEFAULT 20;

-- Margin history table
CREATE TABLE IF NOT EXISTS public.swap_margin_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL,
  user_id uuid NOT NULL,
  username text NOT NULL,
  changed_field text NOT NULL,
  old_usd_balance numeric,
  new_usd_balance numeric,
  old_gold_kg numeric,
  new_gold_kg numeric,
  old_xauusd_price numeric,
  new_xauusd_price numeric,
  old_margin_pct numeric,
  new_margin_pct numeric,
  old_required_margin numeric,
  new_required_margin numeric,
  old_available_margin numeric,
  new_available_margin numeric,
  old_status text,
  new_status text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.swap_margin_history TO authenticated;
GRANT ALL ON public.swap_margin_history TO service_role;

ALTER TABLE public.swap_margin_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "swap_margin_history_select"
  ON public.swap_margin_history
  FOR SELECT
  TO authenticated
  USING (is_swap_user(auth.uid()));

CREATE POLICY "swap_margin_history_insert"
  ON public.swap_margin_history
  FOR INSERT
  TO authenticated
  WITH CHECK (is_swap_user(auth.uid()) AND auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_swap_margin_history_client_id
  ON public.swap_margin_history(client_id, created_at DESC);