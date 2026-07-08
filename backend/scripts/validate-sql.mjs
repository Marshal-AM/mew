import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const setup = readFileSync(join(__dirname, "../supabase/setup.sql"), "utf8");

const required = [
  "CREATE TABLE public.merchants",
  "CREATE TABLE public.pos_devices",
  "CREATE TABLE public.audit_log",
  "compliance_fetch_audit_log",
  "GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated",
  "pos_devices_public",
  "POS-001",
  "to_address",
  "transactions_req_id_idx",
  "daily_tx_count",
  "daily_amount",
  "max_per_tap",
  "increment_velocity_counter",
  "compliance_fetch_fraud_rules",
  "0x000000000000000000000000000000000000dead",
  "screening_status",
  "sanctions_list_sync",
  "SANCTIONED TEST ENTITY",
  "UAE TEST LISTED PERSON",
];

for (const token of required) {
  if (!setup.includes(token)) {
    console.error("MISSING:", token);
    process.exit(1);
  }
}

console.log("validate-sql: PASS");
