-- Extend transaction type enum with Buy/Sell
ALTER TYPE public.refinery_tx_type ADD VALUE IF NOT EXISTS 'buysell';

-- Extend movement type enum
ALTER TYPE public.refinery_movement_type ADD VALUE IF NOT EXISTS 'buy_gold';
ALTER TYPE public.refinery_movement_type ADD VALUE IF NOT EXISTS 'sell_gold';

-- Metadata columns for buy/sell transactions
ALTER TABLE public.refinery_transactions
  ADD COLUMN IF NOT EXISTS buysell_kind text,                    -- 'buy' | 'sell'
  ADD COLUMN IF NOT EXISTS buysell_settlement text,              -- 'settlement' | 'cash'
  ADD COLUMN IF NOT EXISTS buysell_weight numeric,               -- grams
  ADD COLUMN IF NOT EXISTS buysell_purity numeric,               -- 0-1000
  ADD COLUMN IF NOT EXISTS buysell_price_per_gram numeric,       -- DA / g
  ADD COLUMN IF NOT EXISTS buysell_total numeric;                -- DA