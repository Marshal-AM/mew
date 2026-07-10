import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !service) {
  console.log("test-kill-switch: SKIP (set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)");
  process.exit(0);
}

const admin = createClient(url, service, { auth: { autoRefreshToken: false, persistSession: false } });

await admin.from("system_settings").upsert({
  key: "system_suspended",
  value: { suspended: true, reason: "test-kill-switch" },
  updated_at: new Date().toISOString(),
});

const { data: on } = await admin.from("system_settings").select("value").eq("key", "system_suspended").single();
if (!(on?.value)?.suspended) {
  throw new Error("suspension not set");
}

await admin.from("system_settings").upsert({
  key: "system_suspended",
  value: { suspended: false, reason: null },
  updated_at: new Date().toISOString(),
});

const { data: off } = await admin.from("system_settings").select("value").eq("key", "system_suspended").single();
if (off?.value?.suspended) {
  throw new Error("suspension not cleared");
}

console.log("test-kill-switch: PASS");
