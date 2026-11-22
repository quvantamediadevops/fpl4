/**
 * Pre-deploy guard. Run automatically by `npm run deploy`.
 * Fails fast instead of publishing a misconfigured Worker. Prints no secret values.
 */
import { readFileSync } from "node:fs";

const problems = [];

// 1. Public site URL is baked into Open Graph share previews (absolute image URLs) at build time.
const url = process.env.NEXT_PUBLIC_SITE_URL ?? "";
if (!/^https:\/\/[^/]+\.[^/]+/.test(url) || /localhost|127\.0\.0\.1|example\.com/.test(url)) {
  problems.push(
    "NEXT_PUBLIC_SITE_URL must be the production https URL (e.g. https://fpl-season-4.<subdomain>.workers.dev or your domain). " +
      "Set it in .env.production or in the shell for this command.",
  );
}

// 2. KV namespace for the data cache must be a real id.
const wrangler = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
if (/REPLACE_WITH_KV_NAMESPACE_ID/.test(wrangler)) {
  problems.push("wrangler.jsonc: kv_namespaces[0].id is still a placeholder. Run: npx wrangler kv namespace create NEXT_INC_CACHE_KV");
}

if (problems.length) {
  console.error("✗ Not ready to deploy:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`✓ Deploy config OK (site URL ${url})`);
console.log("  Reminder: Worker secrets must exist: GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY (check with: npx wrangler secret list)");
