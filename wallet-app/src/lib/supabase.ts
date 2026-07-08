import { createClient, SupabaseClient } from "@supabase/supabase-js";
import Constants from "expo-constants";

let client: SupabaseClient | null = null;

export function isSupabaseConfigured(): boolean {
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? (Constants.expoConfig?.extra?.supabaseUrl as string);
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? (Constants.expoConfig?.extra?.supabaseAnonKey as string);
  return Boolean(url && key);
}

export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  const url = process.env.EXPO_PUBLIC_SUPABASE_URL ?? (Constants.expoConfig?.extra?.supabaseUrl as string);
  const key = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? (Constants.expoConfig?.extra?.supabaseAnonKey as string);
  if (!url || !key) return null;
  client = createClient(url, key);
  return client;
}
