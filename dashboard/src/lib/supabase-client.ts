import type { SupabaseClient } from "@supabase/supabase-js";
import { loadSession } from "@/lib/session";
import { getSupabaseWithSession } from "@/lib/supabase";

export function getAuthenticatedClient(): SupabaseClient | null {
  const session = loadSession();
  if (!session) return null;
  return getSupabaseWithSession(session.access_token, session.refresh_token);
}
