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

CREATE TABLE public.fraud_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id uuid REFERENCES public.merchants (id) ON DELETE CASCADE,
  rule_type text NOT NULL,
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
