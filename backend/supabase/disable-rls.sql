-- Run this in Supabase SQL Editor to remove ALL RLS (dev / testnet only).
-- Safe to re-run.

-- Drop all policies on public tables
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- Disable RLS on every public table
ALTER TABLE IF EXISTS public.merchants DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.merchant_users DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.pos_devices DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.products DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.kb_embeddings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.customers DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.sanctions_cache DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.fraud_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.velocity_counters DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.review_queue DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.str_filings DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.frozen_addresses DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.custody_wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.custody_reconciliation_snapshots DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.compliance_access_log DISABLE ROW LEVEL SECURITY;

-- Open API access for anon + authenticated (PostgREST)
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL ROUTINES IN SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.pos_devices_public TO anon, authenticated;

ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON ROUTINES TO anon, authenticated;

-- Restore full audit_log access (undo immutability revokes)
GRANT INSERT, UPDATE, DELETE, SELECT ON public.audit_log TO anon, authenticated;

-- Simplify helpers (no role checks)
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

GRANT EXECUTE ON FUNCTION public.insert_audit_log TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_fetch_audit_log TO anon, authenticated, service_role;

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

-- Replace merchant-only trigger with simple updated_at bump
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
