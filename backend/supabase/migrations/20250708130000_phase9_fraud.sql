-- Phase 9: fraud/velocity engine schema additions

ALTER TABLE public.fraud_rules
  DROP CONSTRAINT IF EXISTS fraud_rules_rule_type_check;

ALTER TABLE public.fraud_rules
  ADD CONSTRAINT fraud_rules_rule_type_check
  CHECK (rule_type IN ('max_per_tap', 'daily_amount', 'daily_tx_count'));

INSERT INTO public.fraud_rules (merchant_id, rule_type, threshold_value, active)
SELECT NULL, 'max_per_tap', 500, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.fraud_rules WHERE merchant_id IS NULL AND rule_type = 'max_per_tap'
);

CREATE OR REPLACE FUNCTION public.increment_velocity_counter(
  p_wallet text,
  p_window date,
  p_amount numeric
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  INSERT INTO public.velocity_counters (wallet_address, window_date, tx_count, cumulative_amount)
  VALUES (lower(p_wallet), p_window, 1, p_amount)
  ON CONFLICT (wallet_address, window_date) DO UPDATE SET
    tx_count = public.velocity_counters.tx_count + 1,
    cumulative_amount = public.velocity_counters.cumulative_amount + EXCLUDED.cumulative_amount,
    updated_at = now();
$$;

CREATE OR REPLACE FUNCTION public.compliance_fetch_fraud_rules()
RETURNS SETOF public.fraud_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.fraud_rules fr
  ORDER BY fr.merchant_id NULLS FIRST, fr.rule_type;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_upsert_fraud_rule(
  p_rule_type text,
  p_threshold numeric,
  p_merchant_id uuid DEFAULT NULL,
  p_active boolean DEFAULT true
)
RETURNS public.fraud_rules
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.fraud_rules;
BEGIN
  IF p_rule_type NOT IN ('max_per_tap', 'daily_amount', 'daily_tx_count') THEN
    RAISE EXCEPTION 'invalid rule_type: %', p_rule_type;
  END IF;

  UPDATE public.fraud_rules
  SET threshold_value = p_threshold, active = p_active
  WHERE rule_type = p_rule_type
    AND (
      (p_merchant_id IS NULL AND merchant_id IS NULL)
      OR merchant_id = p_merchant_id
    )
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    INSERT INTO public.fraud_rules (merchant_id, rule_type, threshold_value, active)
    VALUES (p_merchant_id, p_rule_type, p_threshold, p_active)
    RETURNING * INTO v_row;
  END IF;

  RETURN v_row;
END;
$$;

GRANT EXECUTE ON FUNCTION public.increment_velocity_counter TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_fetch_fraud_rules TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_upsert_fraud_rule TO anon, authenticated, service_role;
