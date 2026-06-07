
-- Restore Refinery 3601 stock + audit movements from the safety backup
-- taken at 2026-06-07 20:37:06 (id: 16b997cd-e41d-4adf-9265-18ea51b69e21)

DO $$
DECLARE
  rid uuid := 'c8145e9f-26a8-45da-9556-a2d611252d45';
  payload jsonb;
BEGIN
  SELECT b.payload INTO payload
  FROM public.refinery_backups b
  WHERE b.id = '16b997cd-e41d-4adf-9265-18ea51b69e21';

  IF payload IS NULL THEN
    RAISE EXCEPTION 'Safety backup not found';
  END IF;

  -- Restore stock row
  UPDATE public.refinery_stock
     SET pure_gold_stock = (payload->'stock'->>'pure_gold_stock')::numeric,
         silver_stock    = (payload->'stock'->>'silver_stock')::numeric,
         da_stock        = (payload->'stock'->>'da_stock')::numeric,
         updated_at      = now()
   WHERE refinery_id = rid;

  -- Restore stock movements (skip ones already present)
  INSERT INTO public.refinery_stock_movements
  SELECT * FROM jsonb_populate_recordset(NULL::public.refinery_stock_movements, payload->'stock_movements')
  ON CONFLICT (id) DO NOTHING;
END $$;
