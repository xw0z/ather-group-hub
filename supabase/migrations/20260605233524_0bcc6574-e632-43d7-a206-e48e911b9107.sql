
ALTER TABLE public.swap_daily_fees
  ADD COLUMN IF NOT EXISTS additional_exposure_pct numeric NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS effective_balance numeric,
  ADD COLUMN IF NOT EXISTS day_multiplier integer;

-- Backfill effective_balance using 5% default exposure (existing default).
UPDATE public.swap_daily_fees
SET effective_balance = usd_balance * (1 + COALESCE(additional_exposure_pct, 5) / 100)
WHERE effective_balance IS NULL;

-- Backfill day_multiplier from the snapshot date (UTC weekday).
-- extract(dow) -> Sun=0..Sat=6.  Wed=3 -> 3x; Sat/Sun -> 0; else 1.
UPDATE public.swap_daily_fees
SET day_multiplier = CASE EXTRACT(DOW FROM fee_date)::int
  WHEN 0 THEN 0
  WHEN 6 THEN 0
  WHEN 3 THEN 3
  ELSE 1
END
WHERE day_multiplier IS NULL;
