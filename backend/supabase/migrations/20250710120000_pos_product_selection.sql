-- POS product selection: catalog slots + transaction linkage (POS → backend only)

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pos_slot smallint CHECK (pos_slot IS NULL OR (pos_slot >= 1 AND pos_slot <= 9));

CREATE UNIQUE INDEX IF NOT EXISTS products_merchant_pos_slot_idx
  ON public.products (merchant_id, pos_slot)
  WHERE pos_slot IS NOT NULL AND active = true;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS product_id uuid REFERENCES public.products (id) ON DELETE SET NULL;

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS product_name text;

CREATE INDEX IF NOT EXISTS transactions_product_id_idx ON public.transactions (product_id);

-- Demo merchant catalog (keypad slots 1–3)
INSERT INTO public.products (id, merchant_id, name, sku, price, active, pos_slot)
VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    '11111111-1111-4111-8111-111111111111',
    'Coffee',
    'COF-001',
    5.00,
    true,
    1
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    '11111111-1111-4111-8111-111111111111',
    'Sandwich',
    'SND-001',
    12.00,
    true,
    2
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    '11111111-1111-4111-8111-111111111111',
    'Water',
    'WTR-001',
    2.00,
    true,
    3
  )
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  sku = EXCLUDED.sku,
  price = EXCLUDED.price,
  active = EXCLUDED.active,
  pos_slot = EXCLUDED.pos_slot,
  updated_at = now();
