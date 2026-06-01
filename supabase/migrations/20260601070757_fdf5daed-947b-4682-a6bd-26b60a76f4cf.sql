
ALTER TABLE public.swap_clients
  ADD COLUMN IF NOT EXISTS position_type text NOT NULL DEFAULT 'long',
  ADD COLUMN IF NOT EXISTS short_annual_rate numeric NOT NULL DEFAULT 2.5;

ALTER TABLE public.swap_clients
  ADD CONSTRAINT swap_clients_position_type_chk CHECK (position_type IN ('long','short'));

ALTER TABLE public.swap_daily_fees
  ADD COLUMN IF NOT EXISTS position_type text NOT NULL DEFAULT 'long';
