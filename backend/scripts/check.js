const fs = require("fs");
const path = require("path");

const configPath = path.join(__dirname, "..", "supabase", "config.toml");
if (!fs.existsSync(configPath)) {
  console.error("Missing supabase/config.toml — run: npx supabase init");
  process.exit(1);
}

console.log("Backend stub OK — Supabase config present");
