/**
 * Verifies the Google Sheets connection end to end.
 *   npm run check:sheets
 * Reads only the configured public columns (default B, D, E). Prints the tab
 * name, headers, counts and the first three player names — nothing else.
 */
const env = process.env;
const missing = ["GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SHEETS_PRIVATE_KEY"].filter(
  (k) => !env[k]?.trim(),
);
if (!env.GOOGLE_SHEETS_SHEET_GID?.trim() && !env.GOOGLE_SHEETS_SHEET_NAME?.trim()) missing.push("GOOGLE_SHEETS_SHEET_GID or GOOGLE_SHEETS_SHEET_NAME");
if (missing.length) {
  console.error(`✗ Missing: ${missing.join(", ")}`);
  process.exit(1);
}

const fail = (msg: string): never => {
  console.error(`✗ ${msg}`);
  process.exit(1);
};

const b64url = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const pem = env.GOOGLE_SHEETS_PRIVATE_KEY!.replace(/\\n/g, "\n");
const der = Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64");
const key = await crypto.subtle
  .importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
  .catch(() => fail("Private key could not be read. Paste private_key from the JSON key, keeping the \\n sequences."));
const now = Math.floor(Date.now() / 1000);
const enc = (o: object) => b64url(new TextEncoder().encode(JSON.stringify(o)));
const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({
  iss: env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL!.trim(),
  scope: "https://www.googleapis.com/auth/spreadsheets.readonly",
  aud: "https://oauth2.googleapis.com/token",
  iat: now,
  exp: now + 600,
})}`;
const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
  method: "POST",
  body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64url(sig)}` }),
});
if (!tokenRes.ok) fail(`Service account auth failed (${tokenRes.status}). The email and private key must come from the same JSON key.`);
console.log(`✓ Authenticated as ${env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL}`);
const { access_token } = (await tokenRes.json()) as { access_token: string };
const auth = { headers: { Authorization: `Bearer ${access_token}` } };
const id = env.GOOGLE_SHEETS_SPREADSHEET_ID!.trim();
const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(id)}`;
const hint = (s: number) =>
  s === 403
    ? "Share the sheet with the service account as Viewer, and enable the Google Sheets API in its Cloud project."
    : s === 404 || s === 400
      ? "Check the spreadsheet ID."
      : "";

// 1. Tab name from GID (metadata only: sheet ids and titles).
let title = env.GOOGLE_SHEETS_SHEET_NAME?.trim() ?? "";
const gid = env.GOOGLE_SHEETS_SHEET_GID?.trim();
if (gid) {
  const meta = await fetch(`${base}?fields=properties(title),sheets.properties(sheetId,title)`, auth);
  if (!meta.ok) fail(`Spreadsheet metadata request returned ${meta.status}. ${hint(meta.status)}`);
  const json = (await meta.json()) as { properties?: { title?: string }; sheets?: { properties?: { sheetId?: number; title?: string } }[] };
  const tab = json.sheets?.find((s) => String(s.properties?.sheetId) === gid)?.properties?.title;
  if (!tab) fail(`No tab with GID ${gid}. Tabs: ${json.sheets?.map((s) => `${s.properties?.title} (${s.properties?.sheetId})`).join(", ")}`);
  console.log(`✓ Spreadsheet "${json.properties?.title}" – GID ${gid} is tab "${tab}"`);
  if (title && title !== tab) console.warn(`! GOOGLE_SHEETS_SHEET_NAME is "${title}" but the GID points to "${tab}" – the site uses the GID.`);
  title = tab!;
}

// 2. Only the three public columns.
const sheet = `'${title.replace(/'/g, "''")}'`;
const cols = [env.GOOGLE_SHEETS_NAME_COLUMN ?? "B", env.GOOGLE_SHEETS_PHOTO_COLUMN ?? "D", env.GOOGLE_SHEETS_ROLE_COLUMN ?? "E"];
const params = new URLSearchParams({ majorDimension: "COLUMNS" });
cols.forEach((c) => params.append("ranges", `${sheet}!${c}1:${c}`));
const res = await fetch(`${base}/values:batchGet?${params}`, auth);
if (!res.ok) fail(`Sheets API returned ${res.status}. ${hint(res.status)}`);
const json = (await res.json()) as { valueRanges: { values?: string[][] }[] };
const [names = [], photos = [], roles = []] = json.valueRanges.map((r) => r.values?.[0] ?? []);

const headers = [names[0] ?? "", photos[0] ?? "", roles[0] ?? ""];
console.log(`✓ Columns ${cols.join(", ")} – headers: ${headers.map((h) => `"${h}"`).join(", ")}`);
const checks = [/name/i, /photo|picture|image/i, /type|role/i];
if (!headers.every((h, i) => checks[i]!.test(h))) fail("Headers do not match name / photo / type. The site will refuse to publish until columns are correct.");

const rows = Math.max(names.length, photos.length, roles.length) - 1;
const roleKey = (r: string) => {
  const k = r.toUpperCase().replace(/[^A-Z]/g, "");
  return ({ BATSMAN: "BATSMAN", BATSMEN: "BATSMAN", BATTER: "BATSMAN", BOWLER: "BOWLER", ALLROUNDER: "ALL ROUNDER" } as Record<string, string>)[k] ?? null;
};
let players = 0;
let drive = 0;
let direct = 0;
let noPhoto = 0;
const counts: Record<string, number> = { BATSMAN: 0, BOWLER: 0, "ALL ROUNDER": 0, unrecognised: 0 };
const unknownRoles = new Set<string>();
const sample: string[] = [];
for (let i = 1; i <= rows; i++) {
  const name = (names[i] ?? "").replace(/\s+/g, " ").trim();
  if (!name) continue;
  players++;
  if (sample.length < 3) sample.push(name);
  const role = roleKey(roles[i] ?? "");
  if (role) counts[role]!++;
  else {
    counts.unrecognised!++;
    unknownRoles.add((roles[i] ?? "").trim() || "(blank)");
  }
  const photo = (photos[i] ?? "").trim();
  if (!photo) noPhoto++;
  else if (/drive\.google\.com|docs\.google\.com|googleusercontent\.com/.test(photo)) drive++;
  else direct++;
}
if (players === 0) fail("Connected, but no player rows with a name were found.");
console.log(`✓ ${players} player records`);
console.log(`  Batsmen ${counts.BATSMAN} · Bowlers ${counts.BOWLER} · All Rounders ${counts["ALL ROUNDER"]} · Unrecognised role ${counts.unrecognised}`);
if (unknownRoles.size) console.log(`  Unrecognised role values: ${[...unknownRoles].join(", ")}`);
console.log(`  Photos: ${drive} Drive · ${direct} other URL · ${noPhoto} missing`);
console.log(`  First records: ${sample.join(" | ")}`);
