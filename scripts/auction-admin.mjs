#!/usr/bin/env node
/**
 * Creates auction admin accounts for the AUCTION_ADMINS Worker secret.
 *
 *   node scripts/auction-admin.mjs <name> [<name> …]
 *
 * For each name it generates a long random password and shows it ONCE in this
 * terminal. It then prints two secret values:
 *
 *   npx wrangler secret put AUCTION_ADMINS          (paste the accounts line)
 *   npx wrangler secret put AUCTION_SESSION_SECRET  (paste the session key; only needed once —
 *                                                     changing it signs every admin out)
 *
 * Only a PBKDF2-SHA256 hash (50,000 iterations, random salt) of each password is stored.
 * To rotate passwords, run this again and replace AUCTION_ADMINS.
 */
import { pbkdf2Sync, randomBytes } from "node:crypto";

const ITERATIONS = 50_000; // Workers allow at most 100,000; this keeps login well within CPU limits.

const names = process.argv.slice(2);
if (!names.length || names.some((n) => !/^[a-z0-9_-]{2,32}$/i.test(n))) {
  console.error("Usage: node scripts/auction-admin.mjs <name> [<name> …]   (letters, digits, - or _, 2–32 chars)");
  process.exit(1);
}

const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no look-alikes
const password = () => {
  let out = "";
  while (out.length < 24) for (const b of randomBytes(32)) if (b < 220 && out.length < 24) out += alphabet[b % alphabet.length]; // 220 = 4 × 55: unbiased
  return out.replace(/(.{6})(?!$)/g, "$1-");
};

const entries = names.map((raw) => {
  const name = raw.toLowerCase();
  const pw = password();
  const salt = randomBytes(16).toString("hex");
  const hash = pbkdf2Sync(pw, Buffer.from(salt, "hex"), ITERATIONS, 32, "sha256").toString("hex");
  console.log(`\n  Admin: ${name}\n  Password: ${pw}`);
  return `${name}:pbkdf2:${ITERATIONS}:${salt}:${hash}`;
});

console.log("\nAUCTION_ADMINS (npx wrangler secret put AUCTION_ADMINS):\n");
console.log(entries.join(";"));
console.log("\nAUCTION_SESSION_SECRET (npx wrangler secret put AUCTION_SESSION_SECRET — set once):\n");
console.log(randomBytes(32).toString("hex"));
console.log("");
