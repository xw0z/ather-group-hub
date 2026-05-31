-- CLIENTS
CREATE TABLE public.swap_clients (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE,
  usd_balance numeric NOT NULL DEFAULT 0,
  annual_rate numeric NOT NULL DEFAULT 5.4,
  notes text,
  created_by uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.swap_clients TO authenticated;
GRANT ALL ON public.swap_clients TO service_role;

ALTER TABLE public.swap_clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY swap_clients_select ON public.swap_clients
  FOR SELECT TO authenticated USING (public.is_swap_user(auth.uid()));
CREATE POLICY swap_clients_insert ON public.swap_clients
  FOR INSERT TO authenticated
  WITH CHECK (public.is_swap_user(auth.uid()) AND auth.uid() = created_by);
CREATE POLICY swap_clients_update ON public.swap_clients
  FOR UPDATE TO authenticated
  USING (public.is_swap_user(auth.uid()))
  WITH CHECK (public.is_swap_user(auth.uid()));
CREATE POLICY swap_clients_delete ON public.swap_clients
  FOR DELETE TO authenticated USING (public.is_swap_user(auth.uid()));

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.swap_clients_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;
CREATE TRIGGER swap_clients_touch BEFORE UPDATE ON public.swap_clients
  FOR EACH ROW EXECUTE FUNCTION public.swap_clients_touch();

-- DAILY FEES
CREATE TABLE public.swap_daily_fees (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  client_id uuid NOT NULL REFERENCES public.swap_clients(id) ON DELETE CASCADE,
  fee_date date NOT NULL,
  xauusd_price numeric,
  usd_balance numeric NOT NULL,
  annual_rate numeric NOT NULL,
  daily_fee numeric NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (client_id, fee_date)
);

GRANT SELECT ON public.swap_daily_fees TO authenticated;
GRANT ALL ON public.swap_daily_fees TO service_role;

ALTER TABLE public.swap_daily_fees ENABLE ROW LEVEL SECURITY;

CREATE POLICY swap_daily_fees_select ON public.swap_daily_fees
  FOR SELECT TO authenticated USING (public.is_swap_user(auth.uid()));

CREATE INDEX idx_swap_daily_fees_date ON public.swap_daily_fees(fee_date DESC);
CREATE INDEX idx_swap_daily_fees_client ON public.swap_daily_fees(client_id);

-- ACTIVITY LOG
CREATE TABLE public.swap_activity_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  username text NOT NULL,
  action text NOT NULL,
  entity_type text,
  entity_id uuid,
  details jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.swap_activity_log TO authenticated;
GRANT ALL ON public.swap_activity_log TO service_role;

ALTER TABLE public.swap_activity_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY swap_activity_log_select ON public.swap_activity_log
  FOR SELECT TO authenticated USING (public.is_swap_user(auth.uid()));
CREATE POLICY swap_activity_log_insert ON public.swap_activity_log
  FOR INSERT TO authenticated
  WITH CHECK (public.is_swap_user(auth.uid()) AND auth.uid() = user_id);

CREATE INDEX idx_swap_activity_log_created ON public.swap_activity_log(created_at DESC);