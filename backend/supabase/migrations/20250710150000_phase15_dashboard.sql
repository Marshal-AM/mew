-- Phase 15: dashboard RPCs, compliance controls, realtime, signed_payload

ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS signed_payload jsonb;

CREATE TABLE IF NOT EXISTS public.system_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.system_settings (key, value)
VALUES ('system_suspended', '{"suspended": false, "reason": null}'::jsonb)
ON CONFLICT (key) DO NOTHING;

CREATE OR REPLACE FUNCTION public.auth_jwt_role()
RETURNS text
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(auth.jwt() -> 'app_metadata' ->> 'role', 'merchant');
$$;

CREATE OR REPLACE FUNCTION public.require_compliance_officer()
RETURNS void
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  IF public.auth_jwt_role() <> 'compliance_officer' THEN
    RAISE EXCEPTION 'compliance_officer role required';
  END IF;
END;
$$;

-- Demo merchant analytics (hardcoded POC merchant)
CREATE OR REPLACE FUNCTION public.demo_merchant_fetch_transactions(
  p_limit integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS SETOF public.transactions
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.transactions t
  WHERE t.merchant_id = '11111111-1111-4111-8111-111111111111'::uuid
  ORDER BY t.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 50), 500))
  OFFSET greatest(coalesce(p_offset, 0), 0);
$$;

CREATE OR REPLACE FUNCTION public.demo_merchant_revenue_by_day(p_days integer DEFAULT 30)
RETURNS TABLE(day date, revenue numeric, tx_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    date_trunc('day', t.confirmed_at)::date AS day,
    coalesce(sum(t.amount), 0) AS revenue,
    count(*)::bigint AS tx_count
  FROM public.transactions t
  WHERE t.merchant_id = '11111111-1111-4111-8111-111111111111'::uuid
    AND t.status = 'confirmed'
    AND t.confirmed_at >= (now() - make_interval(days => greatest(1, least(coalesce(p_days, 30), 365))))
  GROUP BY 1
  ORDER BY 1;
$$;

CREATE OR REPLACE FUNCTION public.demo_merchant_fetch_products()
RETURNS SETOF public.products
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT *
  FROM public.products p
  WHERE p.merchant_id = '11111111-1111-4111-8111-111111111111'::uuid
  ORDER BY p.pos_slot NULLS LAST, p.name;
$$;

CREATE OR REPLACE FUNCTION public.compliance_fetch_review_queue(p_status text DEFAULT 'open')
RETURNS TABLE(
  queue_id uuid,
  queue_status text,
  resolution text,
  queue_created_at timestamptz,
  transaction_id uuid,
  amount numeric,
  product_name text,
  from_address text,
  to_address text,
  tx_status text,
  pos_id text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_compliance_officer();
  RETURN QUERY
  SELECT
    rq.id,
    rq.status,
    rq.resolution,
    rq.created_at,
    t.id,
    t.amount,
    t.product_name,
    t.from_address,
    t.to_address,
    t.status,
    t.pos_id
  FROM public.review_queue rq
  JOIN public.transactions t ON t.id = rq.transaction_id
  WHERE (p_status IS NULL OR rq.status = p_status)
  ORDER BY rq.created_at DESC
  LIMIT 200;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_resolve_review(
  p_queue_id uuid,
  p_action text,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tx_id uuid;
  v_action text := lower(trim(p_action));
BEGIN
  PERFORM public.require_compliance_officer();

  SELECT transaction_id INTO v_tx_id
  FROM public.review_queue
  WHERE id = p_queue_id AND status IN ('open', 'assigned');

  IF v_tx_id IS NULL THEN
    RAISE EXCEPTION 'review queue entry not found or already resolved';
  END IF;

  IF v_action = 'decline' THEN
    UPDATE public.transactions SET status = 'declined' WHERE id = v_tx_id;
    UPDATE public.review_queue
    SET status = 'resolved', resolution = coalesce(p_notes, 'declined by officer'), updated_at = now()
    WHERE id = p_queue_id;
    RETURN jsonb_build_object('action', 'decline', 'transaction_id', v_tx_id);
  ELSIF v_action = 'escalate_str' THEN
    INSERT INTO public.str_filings (transaction_id, status, filing_ref)
    VALUES (v_tx_id, 'draft', coalesce(p_notes, 'internal-str-draft'));
    UPDATE public.review_queue
    SET status = 'escalated', resolution = coalesce(p_notes, 'escalated to STR'), updated_at = now()
    WHERE id = p_queue_id;
    RETURN jsonb_build_object('action', 'escalate_str', 'transaction_id', v_tx_id);
  ELSIF v_action = 'release' THEN
    UPDATE public.review_queue
    SET status = 'assigned', resolution = coalesce(p_notes, 'release approved'), updated_at = now()
    WHERE id = p_queue_id;
    RETURN jsonb_build_object('action', 'release', 'transaction_id', v_tx_id, 'resume_required', true);
  ELSE
    RAISE EXCEPTION 'invalid action: %', p_action;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_fetch_frozen_addresses()
RETURNS SETOF public.frozen_addresses
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_compliance_officer();
  RETURN QUERY SELECT * FROM public.frozen_addresses ORDER BY created_at DESC;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_freeze_address(
  p_address text,
  p_reason text,
  p_order_ref text DEFAULT NULL
)
RETURNS public.frozen_addresses
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.frozen_addresses;
BEGIN
  PERFORM public.require_compliance_officer();
  INSERT INTO public.frozen_addresses (address, reason, order_ref, freeze_type, created_by)
  VALUES (lower(trim(p_address)), p_reason, p_order_ref, 'account', auth.uid())
  ON CONFLICT (address) DO UPDATE SET
    reason = EXCLUDED.reason,
    order_ref = EXCLUDED.order_ref
  RETURNING * INTO v_row;
  RETURN v_row;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_unfreeze_address(p_address text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_compliance_officer();
  DELETE FROM public.frozen_addresses WHERE address = lower(trim(p_address));
  RETURN found;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_get_system_suspension()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value jsonb;
BEGIN
  PERFORM public.require_compliance_officer();
  SELECT value INTO v_value FROM public.system_settings WHERE key = 'system_suspended';
  RETURN coalesce(v_value, '{"suspended": false}'::jsonb);
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_set_system_suspension(
  p_suspended boolean,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_value jsonb;
BEGIN
  PERFORM public.require_compliance_officer();
  v_value := jsonb_build_object(
    'suspended', p_suspended,
    'reason', p_reason,
    'updated_at', now(),
    'updated_by', auth.uid()::text
  );
  INSERT INTO public.system_settings (key, value, updated_at)
  VALUES ('system_suspended', v_value, now())
  ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();
  RETURN v_value;
END;
$$;

CREATE OR REPLACE FUNCTION public.compliance_fetch_audit_log(
  p_merchant_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 100,
  p_step text DEFAULT NULL,
  p_from timestamptz DEFAULT NULL,
  p_to timestamptz DEFAULT NULL
)
RETURNS SETOF public.audit_log
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.require_compliance_officer();
  INSERT INTO public.compliance_access_log (officer_user_id, resource_table, merchant_id, metadata)
  VALUES (
    auth.uid(),
    'audit_log',
    p_merchant_id,
    jsonb_build_object('step', p_step, 'from', p_from, 'to', p_to, 'limit', p_limit)
  );
  RETURN QUERY
  SELECT *
  FROM public.audit_log al
  WHERE (p_merchant_id IS NULL OR al.merchant_id = p_merchant_id)
    AND (p_step IS NULL OR al.step = p_step)
    AND (p_from IS NULL OR al.created_at >= p_from)
    AND (p_to IS NULL OR al.created_at <= p_to)
  ORDER BY al.created_at DESC
  LIMIT greatest(1, least(coalesce(p_limit, 100), 500));
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'transactions'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.transactions;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
  WHEN duplicate_object THEN NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.demo_merchant_fetch_transactions TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demo_merchant_revenue_by_day TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.demo_merchant_fetch_products TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_fetch_review_queue TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_resolve_review TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_fetch_frozen_addresses TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_freeze_address TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_unfreeze_address TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_get_system_suspension TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compliance_set_system_suspension TO anon, authenticated, service_role;
