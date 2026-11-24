#!/bin/bash
# FPL Season 4 — Cloudflare one-time setup: login, KV namespace, Worker secrets.
# Does NOT deploy, change DNS or touch domains. Never prints secret values.
# Writes non-secret results to .cloudflare-setup.log (git-ignored).

cd "$(dirname "$0")" || exit 1
LOG=".cloudflare-setup.log"
OLD_KEY_PREFIX="3e4ad9d7"
KV_TITLE="NEXT_INC_CACHE_KV"
WORKER="fpl4"
# NOTE: production (fpl4) already has its Google Sheets configuration as dashboard runtime
# variables. Do not re-run this script against production: putting secrets with the same
# names would clash with those variables.
: > "$LOG"
log() { echo "$1" | tee -a "$LOG"; }
fail() { log "FAILED: $1"; echo; read -n 1 -s -r -p "Press any key to close…"; exit 1; }

echo "=== FPL Season 4 · Cloudflare setup ==="

# 1. New service-account key (never the old one)
KEY_FILE=$(node -e '
const fs=require("fs");
for (const f of fs.readdirSync(".")) {
  if (!f.endsWith(".json") || ["package.json","package-lock.json","tsconfig.json"].includes(f)) continue;
  try { const k=JSON.parse(fs.readFileSync(f,"utf8"));
    if (k.type==="service_account" && k.client_email==="fpl-sheets-reader@deeptiranjan-wp.iam.gserviceaccount.com" && !k.private_key_id.startsWith(process.argv[1])) { console.log(f); process.exit(0); }
  } catch {}
}' "$OLD_KEY_PREFIX")
[ -n "$KEY_FILE" ] || fail "new service-account key JSON not found in this folder (only the old ${OLD_KEY_PREFIX}… key is allowed to be absent)."
log "key_file: $KEY_FILE"

# 2. Login (browser opens — click Allow)
if ! npx wrangler whoami --json >/dev/null 2>&1; then
  echo; echo "A browser window will open. Sign in to Cloudflare and click Allow."
  npx wrangler login || fail "wrangler login"
fi
ACCOUNTS=$(npx wrangler whoami --json 2>/dev/null) || fail "not authenticated after login"
ACCOUNT_ID=$(node -e '
const j=JSON.parse(process.argv[1]); const a=j.accounts||[];
if (a.length!==1) { console.error("ACCOUNTS:"+a.map(x=>x.name+"="+x.id).join(" | ")); process.exit(2); }
console.log(a[0].id);' "$ACCOUNTS") || fail "expected exactly one Cloudflare account — see list above; tell Claude which to use."
export CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID"
log "account_id: $ACCOUNT_ID"
log "user: $(node -e 'console.log(JSON.parse(process.argv[1]).email||"")' "$ACCOUNTS")"

# 3. KV namespace (reuse if it already exists — never duplicate)
KV_ID=$(npx wrangler kv namespace list 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=s.indexOf("[");const l=i<0?[]:JSON.parse(s.slice(i));
const m=l.find(n=>n.title===process.argv[1]); if(m) console.log(m.id);});' "$KV_TITLE")
if [ -z "$KV_ID" ]; then
  echo "Creating KV namespace $KV_TITLE…"
  npx wrangler kv namespace create "$KV_TITLE" >/dev/null 2>&1 || fail "kv namespace create"
  KV_ID=$(npx wrangler kv namespace list 2>/dev/null | node -e '
let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const i=s.indexOf("[");const l=JSON.parse(s.slice(i));
const m=l.find(n=>n.title===process.argv[1]); if(m) console.log(m.id);});' "$KV_TITLE")
  log "kv_created: yes"
else
  log "kv_created: no (reused existing)"
fi
[ -n "$KV_ID" ] || fail "could not read KV namespace id"
log "kv_id: $KV_ID"

# 4. Worker secrets — values piped from files, never shown
put() { node -e "$2" "$KEY_FILE" | npx wrangler secret put "$1" --name "$WORKER" >/dev/null 2>&1 && log "secret_set: $1" || fail "secret put $1"; }
put GOOGLE_SHEETS_SPREADSHEET_ID 'const s=require("fs").readFileSync(".env.local","utf8").match(/^GOOGLE_SHEETS_SPREADSHEET_ID=(.+)$/m); process.stdout.write(s[1].trim())'
put GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).client_email)'
put GOOGLE_SHEETS_PRIVATE_KEY 'process.stdout.write(JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).private_key)'
log "secret_names_on_worker: $(npx wrangler secret list --name "$WORKER" --format json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s.slice(s.indexOf("["))).map(x=>x.name).join(","))}catch{console.log("?")}})')"

# 5. workers.dev subdomain (token read from Wrangler config, never printed)
CFG="$HOME/Library/Preferences/.wrangler/config/default.toml"
TOKEN=$(sed -n 's/^oauth_token = "\(.*\)"$/\1/p' "$CFG" 2>/dev/null)
SUB=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACCOUNT_ID/workers/subdomain" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).result?.subdomain||"")}catch{console.log("")}})')
unset TOKEN
log "workers_dev_subdomain: ${SUB:-NOT_REGISTERED}"

log "status: OK"
echo; echo "Done. Nothing was deployed. Return to Claude."
read -n 1 -s -r -p "Press any key to close…"
