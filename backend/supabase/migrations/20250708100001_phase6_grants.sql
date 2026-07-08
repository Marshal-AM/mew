-- Phase 6: helpers, open grants, seed (no RLS)
CREATE OR REPLACE FUNCTION public.insert_audit_log(
  p_transaction_id uuid,
  p_merchant_id uuid,
  p_step text,
  p_result text,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.audit_log (transaction_id, merchant_id, step, result, metadata)
  VALUES (p_transaction_id, p_merchant_id, p_step, p_result, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_fetch_audit_log(
  p_merchant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100
)
RETURNS SETOF public.audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT *
  FROM public.audit_log al
  WHERE (p_merchant_id IS NULL OR al.merchant_id = p_merchant_id)
  ORDER BY al.created_at DESC
  LIMIT greatest(1, least(p_limit, 500));
END;
$$;

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.pos_devices_public TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.insert_audit_log TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_fetch_audit_log TO anon, authenticated, service_role;

INSERT INTO public.merchants (id, name, wallet_address)
VALUES (
  '11111111-1111-4111-8111-111111111111',
  'Demo Merchant',
  '0x0000000000000000000000000000000000000001'
)
ON CONFLICT (wallet_address) DO NOTHING;

INSERT INTO public.pos_devices (pos_id, merchant_id, payout_address, label, active)
VALUES (
  'POS-001',
  '11111111-1111-4111-8111-111111111111',
  '0x0000000000000000000000000000000000000002',
  'Main counter',
  true
)
ON CONFLICT (pos_id) DO UPDATE SET
  payout_address = EXCLUDED.payout_address,
  label = EXCLUDED.label,
  active = EXCLUDED.active,
  updated_at = now();

CREATE OR REPLACE FUNCTION public.pos_devices_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pos_devices_set_merchant ON public.pos_devices;
CREATE TRIGGER pos_devices_set_updated_at
  BEFORE INSERT OR UPDATE ON public.pos_devices
  FOR EACH ROW EXECUTE FUNCTION public.pos_devices_set_updated_at();
