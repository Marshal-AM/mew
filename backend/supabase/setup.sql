-- Moo Phase 6 Supabase setup
-- Paste into Supabase SQL Editor (Dashboard -> SQL -> New query)

-- Phase 6: core + compliance schema
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";

CREATE TABLE public.merchants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  wallet_address text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.merchant_users (
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants (id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'merchant' CHECK (role IN ('merchant', 'admin')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, merchant_id)
);

CREATE INDEX merchant_users_merchant_id_idx ON public.merchant_users (merchant_id);

CREATE TABLE public.pos_devices (
  pos_id text PRIMARY KEY,
  merchant_id uuid NOT NULL REFERENCES public.merchants (id) ON DELETE CASCADE,
  payout_address text NOT NULL,
  label text NOT NULL DEFAULT '',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX pos_devices_merchant_id_idx ON public.pos_devices (merchant_id);

CREATE TABLE public.transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_id text NOT NULL REFERENCES public.pos_devices (pos_id),
  merchant_id uuid NOT NULL REFERENCES public.merchants (id) ON DELETE CASCADE,
  req_id text NOT NULL,
  pos_nonce text NOT NULL,
  auth_nonce text NOT NULL,
  amount numeric NOT NULL,
  token_address text NOT NULL,
  from_address text NOT NULL,
  to_address text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'declined', 'pending_review', 'held')),
  tx_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  confirmed_at timestamptz,
  UNIQUE (pos_id, pos_nonce),
  UNIQUE (token_address, from_address, auth_nonce)
);

CREATE INDEX transactions_merchant_id_idx ON public.transactions (merchant_id);
CREATE INDEX transactions_from_address_idx ON public.transactions (lower(from_address));
CREATE INDEX transactions_req_id_idx ON public.transactions (req_id);

CREATE TABLE public.products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants (id) ON DELETE CASCADE,
  name text NOT NULL,
  sku text,
  price numeric NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX products_merchant_id_idx ON public.products (merchant_id);

CREATE TABLE public.kb_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid NOT NULL REFERENCES public.merchants (id) ON DELETE CASCADE,
  content text NOT NULL,
  embedding vector(768),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX kb_embeddings_merchant_id_idx ON public.kb_embeddings (merchant_id);

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_address text NOT NULL UNIQUE,
  full_name text,
  id_doc_ref text,
  risk_rating text NOT NULL DEFAULT 'low'
    CHECK (risk_rating IN ('low', 'medium', 'high')),
  screening_status text NOT NULL DEFAULT 'pending'
    CHECK (screening_status IN ('pending', 'cleared', 'blocked')),
  screened_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sanctions_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_name text NOT NULL,
  list_source text NOT NULL CHECK (list_source IN ('un_sc', 'uae_local')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sanctions_cache_entity_name_idx ON public.sanctions_cache (lower(entity_name));

CREATE TABLE public.sanctions_list_sync (
  list_source text PRIMARY KEY CHECK (list_source IN ('un_sc', 'uae_local')),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  entry_count integer NOT NULL DEFAULT 0
);

CREATE TABLE public.fraud_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES public.merchants (id) ON DELETE CASCADE,
  rule_type text NOT NULL CHECK (rule_type IN ('max_per_tap', 'daily_amount', 'daily_tx_count')),
  threshold_value numeric NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.velocity_counters (
  wallet_address text NOT NULL,
  window_date date NOT NULL,
  tx_count integer NOT NULL DEFAULT 0,
  cumulative_amount numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (wallet_address, window_date)
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions (id) ON DELETE SET NULL,
  merchant_id uuid REFERENCES public.merchants (id) ON DELETE SET NULL,
  step text NOT NULL,
  result text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_log_merchant_id_idx ON public.audit_log (merchant_id);
CREATE INDEX audit_log_transaction_id_idx ON public.audit_log (transaction_id);

CREATE TABLE public.review_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid NOT NULL REFERENCES public.transactions (id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'assigned', 'resolved', 'escalated')),
  assigned_to uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  resolution text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX review_queue_status_idx ON public.review_queue (status);

CREATE TABLE public.str_filings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id uuid REFERENCES public.transactions (id) ON DELETE SET NULL,
  filing_ref text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'submitted', 'acknowledged')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.frozen_addresses (
  address text PRIMARY KEY,
  reason text NOT NULL,
  order_ref text,
  freeze_type text NOT NULL DEFAULT 'account'
    CHECK (freeze_type IN ('account', 'transaction')),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL
);

CREATE TABLE public.custody_wallets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  pool_type text NOT NULL CHECK (pool_type IN ('customer_funds', 'treasury', 'operational')),
  label text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.custody_reconciliation_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custody_wallet_id uuid NOT NULL REFERENCES public.custody_wallets (id) ON DELETE CASCADE,
  on_chain_balance numeric NOT NULL,
  ledger_balance numeric NOT NULL,
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.compliance_access_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  officer_user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  resource_table text NOT NULL,
  resource_id text,
  merchant_id uuid REFERENCES public.merchants (id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE VIEW public.pos_devices_public AS
  SELECT pos_id, payout_address, label, updated_at
  FROM public.pos_devices
  WHERE active = true;


-- Helpers + open access (RLS disabled for dev/testnet)
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

INSERT INTO public.fraud_rules (merchant_id, rule_type, threshold_value, active)
SELECT NULL, 'max_per_tap', 500, true
WHERE NOT EXISTS (
  SELECT 1 FROM public.fraud_rules WHERE merchant_id IS NULL AND rule_type = 'max_per_tap'
);

INSERT INTO public.frozen_addresses (address, reason, order_ref, freeze_type)
VALUES (
  '0x000000000000000000000000000000000000dead',
  'Pipeline test fixture',
  'TEST-FROZEN-001',
  'account'
)
ON CONFLICT (address) DO NOTHING;

INSERT INTO public.sanctions_cache (entity_name, list_source, metadata)
SELECT 'SANCTIONED TEST ENTITY', 'un_sc', '{"aliases":["Test Bad Actor"],"fixture":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.sanctions_cache
  WHERE list_source = 'un_sc' AND lower(entity_name) = lower('SANCTIONED TEST ENTITY')
);

INSERT INTO public.sanctions_cache (entity_name, list_source, metadata)
SELECT 'Test Bad Actor', 'un_sc', '{"alias_of":"SANCTIONED TEST ENTITY","fixture":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.sanctions_cache
  WHERE list_source = 'un_sc' AND lower(entity_name) = lower('Test Bad Actor')
);

INSERT INTO public.sanctions_cache (entity_name, list_source, metadata)
SELECT 'UAE TEST LISTED PERSON', 'uae_local', '{"fixture":true}'::jsonb
WHERE NOT EXISTS (
  SELECT 1 FROM public.sanctions_cache
  WHERE list_source = 'uae_local' AND lower(entity_name) = lower('UAE TEST LISTED PERSON')
);

INSERT INTO public.sanctions_list_sync (list_source, last_synced_at, entry_count)
VALUES ('un_sc', now(), 2), ('uae_local', now(), 1)
ON CONFLICT (list_source) DO UPDATE SET
  last_synced_at = EXCLUDED.last_synced_at,
  entry_count = EXCLUDED.entry_count;


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
