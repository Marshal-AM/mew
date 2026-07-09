UPDATE public.merchants
SET
  wallet_address = '0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844',
  updated_at = now()
WHERE id = '11111111-1111-4111-8111-111111111111';

UPDATE public.pos_devices
SET
  payout_address = '0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844',
  updated_at = now()
WHERE pos_id = 'POS-001';
