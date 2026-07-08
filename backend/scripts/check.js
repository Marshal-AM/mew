const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const configPath = path.join(__dirname, "..", "supabase", "config.toml");
const setupPath = path.join(__dirname, "..", "supabase", "setup.sql");
const submitTxPath = path.join(__dirname, "..", "supabase", "functions", "submit-transaction", "index.ts");
const pipelinePath = path.join(__dirname, "..", "supabase", "functions", "_shared", "pipeline", "runPipeline.ts");
const screenEntityPath = path.join(__dirname, "..", "supabase", "functions", "screen-entity", "index.ts");
const syncListsPath = path.join(__dirname, "..", "supabase", "functions", "sync-sanctions-lists", "index.ts");
const registerCustomerPath = path.join(__dirname, "..", "supabase", "functions", "register-customer", "index.ts");
if (!fs.existsSync(configPath)) {
  console.error("Missing supabase/config.toml");
  process.exit(1);
}
if (!fs.existsSync(setupPath)) {
  console.error("Missing supabase/setup.sql");
  process.exit(1);
}
if (!fs.existsSync(submitTxPath)) {
  console.error("Missing submit-transaction edge function");
  process.exit(1);
}
if (!fs.existsSync(pipelinePath)) {
  console.error("Missing pipeline runPipeline.ts");
  process.exit(1);
}
if (!fs.existsSync(screenEntityPath)) {
  console.error("Missing screen-entity edge function");
  process.exit(1);
}
if (!fs.existsSync(syncListsPath)) {
  console.error("Missing sync-sanctions-lists edge function");
  process.exit(1);
}
if (!fs.existsSync(registerCustomerPath)) {
  console.error("Missing register-customer edge function");
  process.exit(1);
}

execSync("node scripts/validate-sql.mjs", { stdio: "inherit", cwd: path.join(__dirname, "..") });
console.log("Backend OK");
