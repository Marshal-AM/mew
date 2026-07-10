type JsonRecord = Record<string, unknown>;

export async function fetchSupabaseFunction(
  functionName: string,
  init: RequestInit = {},
): Promise<{ response: Response; data: JsonRecord }> {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!baseUrl || !anonKey) {
    throw new Error(
      "Missing dashboard env. Create dashboard/.env with NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
  }

  const headers = new Headers(init.headers);
  headers.set("apikey", anonKey);
  if (!headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${anonKey}`);
  }

  const response = await fetch(`${baseUrl}/functions/v1/${functionName}`, {
    ...init,
    headers,
  });

  const text = await response.text();
  let data: JsonRecord;
  try {
    data = text ? (JSON.parse(text) as JsonRecord) : {};
  } catch {
    if (text.trimStart().startsWith("<")) {
      throw new Error(
        `Supabase returned HTML instead of JSON (HTTP ${response.status}). Check NEXT_PUBLIC_SUPABASE_URL and redeploy ${functionName}.`,
      );
    }
    throw new Error(text.slice(0, 240) || `HTTP ${response.status}`);
  }

  return { response, data };
}
