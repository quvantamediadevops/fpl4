/**
 * Player-photo access check (read-only).
 *   npm run check:photos
 * Reads column D (photo links) only, then asks the Drive API for each file's metadata
 * with the service account. Prints counts and sheet row numbers — never file contents,
 * Drive IDs, tokens or keys. Finishes with one test download of a resized photo.
 */
const env = process.env;
for (const k of ["GOOGLE_SHEETS_SPREADSHEET_ID", "GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL", "GOOGLE_SHEETS_PRIVATE_KEY"]) {
  if (!env[k]?.trim()) {
    console.error(`✗ Missing ${k}`);
    process.exit(1);
  }
}

const b64 = (b: Uint8Array) => Buffer.from(b).toString("base64url");
const pem = env.GOOGLE_SHEETS_PRIVATE_KEY!.replace(/\\n/g, "\n");
const key = await crypto.subtle.importKey(
  "pkcs8",
  Buffer.from(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, ""), "base64"),
  { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
  false,
  ["sign"],
);
async function token(scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const enc = (o: object) => b64(new TextEncoder().encode(JSON.stringify(o)));
  const unsigned = `${enc({ alg: "RS256", typ: "JWT" })}.${enc({ iss: env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL!.trim(), scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 600 })}`;
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)));
  const r = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${unsigned}.${b64(sig)}` }),
  });
  if (!r.ok) {
    console.error(`✗ Service-account authentication failed (${r.status})`);
    process.exit(1);
  }
  return ((await r.json()) as { access_token: string }).access_token;
}

// 1. Tab from GID, then column D only
const sheetsToken = await token("https://www.googleapis.com/auth/spreadsheets.readonly");
const base = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEETS_SPREADSHEET_ID!.trim())}`;
const auth = (t: string) => ({ headers: { Authorization: `Bearer ${t}` } });
let tab = env.GOOGLE_SHEETS_SHEET_NAME?.trim() ?? "";
if (env.GOOGLE_SHEETS_SHEET_GID?.trim()) {
  const meta = (await (await fetch(`${base}?fields=sheets.properties(sheetId,title)`, auth(sheetsToken))).json()) as {
    sheets?: { properties: { sheetId: number; title: string } }[];
  };
  tab = meta.sheets?.find((s) => String(s.properties.sheetId) === env.GOOGLE_SHEETS_SHEET_GID!.trim())?.properties.title ?? "";
}
if (!tab) {
  console.error("✗ Registration tab not found (check GOOGLE_SHEETS_SHEET_GID)");
  process.exit(1);
}
const col = env.GOOGLE_SHEETS_PHOTO_COLUMN ?? "D";
const range = encodeURIComponent(`'${tab.replace(/'/g, "''")}'!${col}1:${col}`);
const values = ((await (await fetch(`${base}/values/${range}?majorDimension=COLUMNS`, auth(sheetsToken))).json()) as { values?: string[][] }).values?.[0] ?? [];
if (!/photo|picture|image/i.test(values[0] ?? "")) {
  console.error(`✗ Column ${col} header is not a photo column`);
  process.exit(1);
}
const rows = values.slice(1).map((cell, i) => {
  const first = cell.split(/[\s,]+/).find(Boolean) ?? "";
  const id = first.match(/[?&]id=([\w-]{20,})/)?.[1] ?? first.match(/\/d\/([\w-]{20,})/)?.[1] ?? null;
  return { row: i + 2, id };
});
console.log(`✓ Tab "${tab}": ${rows.length} photo cells, ${rows.filter((r) => r.id).length} with a Drive file ID`);

// 2. Drive metadata for every file (4 at a time)
const driveToken = await token("https://www.googleapis.com/auth/drive.readonly");
type Outcome = { row: number; status: string; mime?: string; id?: string };
const outcomes: Outcome[] = [];
let apiDisabledMessage = "";
const queue = [...rows];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let r = queue.shift(); r; r = queue.shift()) {
      if (!r.id) {
        outcomes.push({ row: r.row, status: "no Drive link in cell" });
        continue;
      }
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(r.id)}?fields=mimeType,trashed,thumbnailLink&supportsAllDrives=true`,
        auth(driveToken),
      );
      if (res.ok) {
        const j = (await res.json()) as { mimeType?: string; trashed?: boolean; thumbnailLink?: string };
        const status = j.trashed ? "trashed" : !j.mimeType?.startsWith("image/") ? "not an image" : j.thumbnailLink || /jpeg|png|webp/.test(j.mimeType) ? "accessible" : "image without preview";
        outcomes.push({ row: r.row, status, mime: j.mimeType, id: r.id });
      } else {
        const j = (await res.json().catch(() => ({}))) as { error?: { errors?: { reason?: string }[]; message?: string } };
        const reason = j.error?.errors?.[0]?.reason ?? String(res.status);
        if (/accessNotConfigured/i.test(reason)) apiDisabledMessage = (j.error?.message ?? "").split(". ")[0] ?? "";
        outcomes.push({
          row: r.row,
          status: /accessNotConfigured/i.test(reason) ? "Drive API disabled" : res.status === 404 || res.status === 403 ? "no access (not shared)" : `error ${res.status}`,
        });
      }
    }
  }),
);

const groups = new Map<string, number[]>();
for (const o of outcomes.sort((a, b) => a.row - b.row)) groups.set(o.status, [...(groups.get(o.status) ?? []), o.row]);
console.log("\nDrive access by sheet row:");
for (const [status, list] of groups) {
  const mark = status === "accessible" ? "✓" : "✗";
  console.log(`  ${mark} ${status}: ${list.length}${status === "accessible" ? "" : `  (rows ${list.slice(0, 30).join(", ")}${list.length > 30 ? ", …" : ""})`}`);
}
const mimes = new Map<string, number>();
for (const o of outcomes) if (o.mime) mimes.set(o.mime, (mimes.get(o.mime) ?? 0) + 1);
if (mimes.size) console.log("  file types:", [...mimes].map(([m, n]) => `${m} ×${n}`).join(", "));

if (apiDisabledMessage) {
  console.log(`\n→ ${apiDisabledMessage}.`);
  console.log("  Enable it: Google Cloud console → APIs & Services → Library → Google Drive API → Enable (project of the service account).");
}

// 3. One real download through the same path the website uses
const sample = outcomes.find((o) => o.status === "accessible");
if (sample?.id) {
  const meta = (await (await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(sample.id)}?fields=thumbnailLink`, auth(driveToken))).json()) as { thumbnailLink?: string };
  const img = meta.thumbnailLink ? await fetch(meta.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, "=w480"), auth(driveToken)) : null;
  const bytes = img?.ok ? new Uint8Array(await img.arrayBuffer()) : new Uint8Array();
  const kind = bytes[0] === 0xff && bytes[1] === 0xd8 ? "JPEG" : bytes[0] === 0x89 && bytes[1] === 0x50 ? "PNG" : String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP" ? "WebP" : null;
  console.log(kind ? `\n✓ Test download (row ${sample.row}, 480px): ${kind}, ${Math.round(bytes.length / 1024)} KB` : `\n✗ Test download (row ${sample.row}) did not return an image`);
}

const ok = groups.get("accessible")?.length ?? 0;
console.log(`\n${ok === rows.length ? "✓ All" : ok ? "◐" : "✗"} ${ok}/${rows.length} player photos readable by the service account.`);
if (ok && ok === rows.length) console.log("  Ready: set PLAYER_PHOTOS=on (see README → Player photos).");
process.exit(ok === rows.length ? 0 : 2);
