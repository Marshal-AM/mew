-- Phase 7: transaction pipeline schema additions

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS to_address text NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS transactions_req_id_idx ON public.transactions (req_id);

-- Global fraud rules (merchant_id IS NULL = applies to all merchants)
INSERT INTO public.fraud_rules (merchant_id, rule_type, threshold_value, active)
SELECT NULL, 'daily_tx_count', 50, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.fraud_rules WHERE merchant_id IS NULL AND rule_type = 'daily_tx_count'
);

INSERT INTO public.fraud_rules (merchant_id, rule_type, threshold_value, active)
SELECT NULL, 'daily_amount', 10000, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.fraud_rules WHERE merchant_id IS NULL AND rule_type = 'daily_amount'
);

-- Test-only frozen address for pipeline adversarial tests
INSERT INTO public.frozen_addresses (address, reason, order_ref, freeze_type)
VALUES (
  '0x000000000000000000000000000000000000dead',
  'Pipeline test fixture',
  'TEST-FROZEN-001',
  'account'
)
ON CONFLICT (address) DO NOTHING;
