UPDATE public.pos_devices
SET
  payout_address = '0x2514844F312c02Ae3C9d4fEb40db4eC8830b6844',
  updated_at = now()
WHERE pos_id = 'POS-001';
