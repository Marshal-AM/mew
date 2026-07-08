-- Phase 8: sanctions screening schema

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS screening_status text NOT NULL DEFAULT 'pending'
    CHECK (screening_status IN ('pending', 'cleared', 'blocked'));

ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS screened_at timestamptz;

CREATE TABLE IF NOT EXISTS public.sanctions_list_sync (
  list_source text PRIMARY KEY CHECK (list_source IN ('un_sc', 'uae_local')),
  last_synced_at timestamptz NOT NULL DEFAULT now(),
  entry_count integer NOT NULL DEFAULT 0
);

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
