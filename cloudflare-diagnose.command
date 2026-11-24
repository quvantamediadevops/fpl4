#!/bin/bash
# FPL Season 4 — READ-ONLY production diagnosis. Changes nothing, deploys nothing.
# Prints no secret values (secret NAMES only). Output: .cloudflare-diagnose.log
cd "$(dirname "$0")" || exit 1
LOG=".cloudflare-diagnose.log"; W="fpl4"; : > "$LOG"
log() { echo "$1" | tee -a "$LOG"; }
echo "=== FPL production diagnosis (read-only) ==="

ME=$(npx wrangler whoami --json 2>/dev/null) || { log "auth: NOT LOGGED IN — run: npx wrangler login"; read -n1 -s -r -p "Press any key…"; exit 1; }
ACC=$(node -e 'const a=JSON.parse(process.argv[1]).accounts||[];console.log(a.length===1?a[0].id:"")' "$ME")
log "auth: $(node -e 'const j=JSON.parse(process.argv[1]);console.log(j.email+" | accounts: "+(j.accounts||[]).map(a=>a.name).join(", "))' "$ME")"
[ -n "$ACC" ] && export CLOUDFLARE_ACCOUNT_ID="$ACC"

log "--- deployments (latest 3)"
npx wrangler deployments list --name "$W" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const d=JSON.parse(s);const l=Array.isArray(d)?d:(d.deployments||[]);l.slice(-3).forEach(x=>console.log((x.created_on||"")+" | versions: "+(x.versions||[]).map(v=>v.version_id+" "+v.percentage+"%").join(", ")+" | source: "+(x.source||"")))}catch{console.log("could not read deployments: "+s.slice(0,200))}})' | tee -a "$LOG"

log "--- secret NAMES on $W"
npx wrangler secret list --name "$W" --format json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s.slice(s.indexOf("[")));console.log(l.length?l.map(x=>x.name).join(", "):"(none)")}catch{console.log("could not read secrets: "+s.slice(0,200))}})' | tee -a "$LOG"

log "--- bindings of the live version (names/types; plain vars shown, secrets never)"
VID=$(npx wrangler deployments status --name "$W" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);console.log((j.versions||[])[0]?.version_id||"")}catch{}})')
if [ -n "$VID" ]; then
  npx wrangler versions view "$VID" --name "$W" --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const j=JSON.parse(s);const b=j.resources?.bindings||j.bindings||[];b.forEach(x=>console.log("  "+x.name+" ["+x.type+"]"+(x.type==="plain_text"?" = "+x.text:x.type==="kv_namespace"?" -> "+x.namespace_id:"")))}catch{console.log("could not read version: "+s.slice(0,200))}})' | tee -a "$LOG"
else log "  (no live version id found)"; fi

log "--- KV namespaces"
npx wrangler kv namespace list 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{JSON.parse(s.slice(s.indexOf("["))).forEach(n=>console.log("  "+n.title+" -> "+n.id))}catch{console.log("  could not list")}})' | tee -a "$LOG"

CFG="$HOME/Library/Preferences/.wrangler/config/default.toml"
TOKEN=$(sed -n 's/^oauth_token = "\(.*\)"$/\1/p' "$CFG" 2>/dev/null)
SUB=$(curl -s -H "Authorization: Bearer $TOKEN" "https://api.cloudflare.com/client/v4/accounts/$ACC/workers/subdomain" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{console.log(JSON.parse(s).result?.subdomain||"")}catch{console.log("")}})')
unset TOKEN
URL="https://$W.$SUB.workers.dev"
log "--- live site: $URL"

npx wrangler tail "$W" --format json > .tail.tmp 2>/dev/null &
TP=$!; sleep 8
for p in /players /; do
  BODY=$(curl -s -H "Cache-Control: no-cache" "$URL$p")
  STATE=$(node -e 'const b=process.argv[1];console.log(/being set up/.test(b)?"SETUP STATE (not_configured)":/temporarily unavailable/.test(b)?"UNAVAILABLE STATE":(b.match(/>(\d+)<\/dd>/)||[])[1]?"OK — "+b.match(/>(\d+)<\/dd>/)[1]+" players":"other ("+b.length+" bytes)")' "$BODY")
  log "  GET $p -> $STATE"
done
sleep 6; kill $TP 2>/dev/null
log "--- worker logs during those requests (messages only)"
node -e 'const fs=require("fs");const lines=fs.readFileSync(".tail.tmp","utf8").split("\n").filter(Boolean);let n=0;for(const l of lines){try{const e=JSON.parse(l);for(const x of e.logs||[]){console.log("  ["+x.level+"] "+[].concat(x.message).join(" ").slice(0,300));n++}for(const x of e.exceptions||[]){console.log("  [exception] "+x.name+": "+String(x.message).slice(0,300));n++}if(e.outcome&&e.outcome!=="ok")console.log("  outcome: "+e.outcome)}catch{}}if(!n)console.log("  (no log lines — expected for the setup state, which returns before any logging)")' 2>/dev/null | tee -a "$LOG"
rm -f .tail.tmp
log "status: done"
echo; read -n 1 -s -r -p "Done (nothing changed). Press any key to close…"
