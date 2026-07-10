-- Phase 17: voice query audit + storage for POS mic uploads

CREATE TABLE IF NOT EXISTS public.voice_queries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pos_id text NOT NULL REFERENCES public.pos_devices(pos_id) ON DELETE CASCADE,
  merchant_id uuid NOT NULL REFERENCES public.merchants(id) ON DELETE CASCADE,
  samples integer NOT NULL CHECK (samples > 0),
  duration_ms integer NOT NULL CHECK (duration_ms > 0),
  byte_size integer NOT NULL CHECK (byte_size > 0),
  storage_path text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS voice_queries_pos_id_created_at_idx
  ON public.voice_queries (pos_id, created_at DESC);

ALTER TABLE public.voice_queries ENABLE ROW LEVEL SECURITY;

-- Edge functions use service_role (bypasses RLS). No anon/authenticated policies yet.

INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('voice-clips', 'voice-clips', false, 5242880)
ON CONFLICT (id) DO NOTHING;
