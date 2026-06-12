
-- Phase 3 audit fixtures (idempotent)
INSERT INTO public.refineries (name)
  VALUES ('TEST — DO NOT USE (AUDIT)')
  ON CONFLICT (name) DO NOTHING;

WITH r AS (SELECT id FROM public.refineries WHERE name = 'TEST — DO NOT USE (AUDIT)')
INSERT INTO public.refinery_stock (refinery_id)
  SELECT id FROM r
  ON CONFLICT DO NOTHING;

WITH r AS (SELECT id FROM public.refineries WHERE name = 'TEST — DO NOT USE (AUDIT)')
INSERT INTO public.refinery_clients (refinery_id, name, code, refining_fee_price)
SELECT r.id, 'TEST CLIENT A — AUDIT', 'TA0001', 1.5 FROM r
ON CONFLICT (code) WHERE code IS NOT NULL DO NOTHING;

WITH r AS (SELECT id FROM public.refineries WHERE name = 'TEST — DO NOT USE (AUDIT)')
INSERT INTO public.refinery_clients (refinery_id, name, code, refining_fee_price)
SELECT r.id, 'TEST CLIENT B — AUDIT', 'TB0001', 1.5 FROM r
ON CONFLICT (code) WHERE code IS NOT NULL DO NOTHING;

INSERT INTO public.swap_premium_companies (name, created_by)
SELECT 'TEST COMPANY — AUDIT', '2b520781-66ca-4e4e-b762-8ae6e0c3ef8c'::uuid
WHERE NOT EXISTS (SELECT 1 FROM public.swap_premium_companies WHERE name = 'TEST COMPANY — AUDIT');
