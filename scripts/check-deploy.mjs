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
    "NEXT_PUBLIC_SITE_URL must be the production https URL (e.g. https://cricket.deeptiranjan.com). " +
      "Set it in .env.production or in the shell for this command.",
  );
}

// 2. KV namespace for the data cache must be a real id.
const raw = readFileSync(new URL("../wrangler.jsonc", import.meta.url), "utf8");
let wrangler = null;
try {
  // strip // and /* */ comments (outside strings) and trailing commas, then parse
  const json = raw
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, str) => str ?? "")
    .replace(/,(\s*[}\]])/g, "$1");
  wrangler = JSON.parse(json);
} catch {
  problems.push("wrangler.jsonc could not be parsed.");
}
if (wrangler) {
  const kv = (wrangler.kv_namespaces ?? []).filter((n) => n.binding === "NEXT_INC_CACHE_KV");
  if (kv.length !== 1) {
    problems.push(`wrangler.jsonc: expected exactly one kv_namespaces entry with binding "NEXT_INC_CACHE_KV", found ${kv.length}.`);
  } else if (!/^[0-9a-f]{32}$/.test(kv[0].id ?? "")) {
    problems.push("wrangler.jsonc: NEXT_INC_CACHE_KV id is not a real namespace id (32 hex characters). Run: npx wrangler kv namespace create NEXT_INC_CACHE_KV");
  } else {
    console.log(`✓ KV binding NEXT_INC_CACHE_KV → ${kv[0].id}${kv[0].remote ? " (remote: true — local dev would use production KV)" : ""}`);
  }
}

// 3. Production Worker name: Git-connected builds deploy only when this matches the dashboard Worker.
const PRODUCTION_WORKER = "fpl4";
if (wrangler && wrangler.name !== PRODUCTION_WORKER) {
  problems.push(`wrangler.jsonc: "name" is "${wrangler.name}" but the production Worker is "${PRODUCTION_WORKER}".`);
}

// 4. Auction: D1 database id must be real, and the custom entry must be in place.
if (wrangler) {
  const d1 = (wrangler.d1_databases ?? []).filter((d) => d.binding === "AUCTION_DB");
  if (d1.length !== 1) {
    problems.push('wrangler.jsonc: expected exactly one d1_databases entry with binding "AUCTION_DB".');
  } else if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(d1[0].database_id ?? "")) {
    problems.push(
      "wrangler.jsonc: AUCTION_DB database_id is still the placeholder — the production D1 database has not been created yet. " +
        "With approval: npx wrangler d1 create fpl-auction --location apac, paste its database_id into wrangler.jsonc, " +
        "then npx wrangler d1 migrations apply AUCTION_DB --remote. Do not push until this is done.",
    );
  } else {
    console.log(`✓ D1 binding AUCTION_DB → ${d1[0].database_name} (${d1[0].database_id})`);
  }
  const dob = (wrangler.durable_objects?.bindings ?? []).some((b) => b.name === "AUCTION_ROOM" && b.class_name === "AuctionRoom");
  if (!dob) problems.push('wrangler.jsonc: Durable Object binding AUCTION_ROOM → AuctionRoom is missing.');
  if (wrangler.main !== "worker.ts") problems.push('wrangler.jsonc: "main" must be "worker.ts" (it wraps OpenNext and exports AuctionRoom).');
  if (wrangler.keep_vars !== true) problems.push('wrangler.jsonc: "keep_vars": true is missing (dashboard variables would be removed on deploy).');
}

if (problems.length) {
  console.error("✗ Not ready to deploy:\n  - " + problems.join("\n  - "));
  process.exit(1);
}
console.log(`✓ Deploy config OK (Worker ${wrangler.name}, site URL ${url})`);
console.log(`  Reminder: these must exist on ${PRODUCTION_WORKER} (secrets or dashboard runtime variables): GOOGLE_SHEETS_SPREADSHEET_ID, GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL, GOOGLE_SHEETS_PRIVATE_KEY, AUCTION_ADMINS, AUCTION_SESSION_SECRET (check: npx wrangler secret list --name ${PRODUCTION_WORKER}).`);
console.log("  Reminder: apply auction migrations before deploying: npx wrangler d1 migrations apply AUCTION_DB --remote");
