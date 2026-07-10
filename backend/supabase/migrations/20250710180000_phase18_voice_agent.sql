-- Phase 18: voice agent — product embeddings, job queue, audit columns, vector match RPC

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS embedding vector(768);

CREATE INDEX IF NOT EXISTS products_embedding_hnsw_idx
  ON public.products
  USING hnsw (embedding vector_cosine_ops)
  WHERE embedding IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.embedding_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (table_name, record_id)
);

CREATE INDEX IF NOT EXISTS embedding_jobs_pending_idx
  ON public.embedding_jobs (status, created_at)
  WHERE status IN ('pending', 'failed');

ALTER TABLE public.voice_queries
  ADD COLUMN IF NOT EXISTS reply_text text,
  ADD COLUMN IF NOT EXISTS tools_called jsonb,
  ADD COLUMN IF NOT EXISTS latency_ms integer,
  ADD COLUMN IF NOT EXISTS model text;

CREATE OR REPLACE FUNCTION public.enqueue_product_embedding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.embedding_jobs (table_name, record_id, status)
  VALUES ('products', NEW.id, 'pending')
  ON CONFLICT (table_name, record_id)
  DO UPDATE SET
    status = 'pending',
    attempts = 0,
    last_error = NULL,
    updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS products_enqueue_embedding ON public.products;
CREATE TRIGGER products_enqueue_embedding
  AFTER INSERT OR UPDATE OF name, sku ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_product_embedding();

-- Enqueue existing active products for initial backfill
INSERT INTO public.embedding_jobs (table_name, record_id, status)
SELECT 'products', p.id, 'pending'
FROM public.products p
WHERE p.active = true
ON CONFLICT (table_name, record_id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.agent_match_products(
  p_merchant_id uuid,
  p_embedding vector(768),
  p_limit integer DEFAULT 5
)
RETURNS TABLE(
  id uuid,
  name text,
  sku text,
  price numeric,
  pos_slot smallint,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    p.id,
    p.name,
    p.sku,
    p.price,
    p.pos_slot,
    1 - (p.embedding <=> p_embedding) AS similarity
  FROM public.products p
  WHERE p.merchant_id = p_merchant_id
    AND p.active = true
    AND p.embedding IS NOT NULL
  ORDER BY p.embedding <=> p_embedding
  LIMIT greatest(1, least(coalesce(p_limit, 5), 20));
$$;

REVOKE ALL ON FUNCTION public.agent_match_products(uuid, vector, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.agent_match_products(uuid, vector, integer) TO service_role;
