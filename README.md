# Fertilizer Premier League – Season 4

Official tournament website. Next.js 16.4.6 (App Router, React Server Components), Tailwind CSS 4, Motion for React, deployed to **Cloudflare Workers** with the OpenNext adapter. Player data comes straight from the registration Google Sheet.

## What is public — and what never leaves the server

Only three columns are ever requested from Google, in a single `batchGet` call:

| Column | Header | Used for |
|---|---|---|
| B | PLAYER NAME | Name |
| D | PLAYER PHOTO | Photo (proxied, URL never sent to browsers) |
| E | PLAYER TYPE | Role |

Timestamp, mobile number, registration and payment columns are **never requested**, so they cannot leak through HTML, JSON, metadata or logs.

Extra safeguards:

- The header cells of B, D and E are checked on every refresh (`name`, `photo`, `type/role`). If someone inserts a column and different data moves into B/D/E, the site **fails closed** and shows "temporarily unavailable" instead of publishing the wrong column.
- Browsers never see Drive links. Photos load from `/api/photos/<key>`, which serves only files referenced in column D for a known player, only if Google returns an actual image (never SVG, HTML or documents).
- Logs contain error codes and counts only. They never include names, numbers or credentials.

## Architecture

```
Browser ──► Cloudflare Worker (OpenNext)
              ├─ Server Components render pages from one cached dataset
              ├─ unstable_cache ──► KV namespace (shared across all isolates)
              │      └─ on expiry: 1 × Sheets batchGet (B, D, E only)
              └─ /api/photos/[key] ──► Google Drive thumbnail ──► Cloudflare edge cache
```

- **Why Workers and not static Pages:** the service-account key must stay server-side and data must refresh without rebuilding. OpenNext on Workers is Cloudflare's supported way to run Next.js server features.
- **Auth** uses Web Crypto (RS256 JWT), not `googleapis`, so it runs natively on Workers with no Node-only APIs.
- **One fetch per interval:** all pages share one normalised dataset, cached in KV for `GOOGLE_SHEETS_CACHE_SECONDS`. If Google fails, the last good copy is served. With no copy available, a friendly error appears. Sample data is never shown.
- **Search, filters and pagination** run client-side over the public list (name, role, number, photo path). There are no extra requests, and the URL stays shareable (`/players?role=bowler&q=das&page=2`).

## 1. Google Sheets setup

1. **Spreadsheet ID**: open the sheet. The URL is `https://docs.google.com/spreadsheets/d/<SPREADSHEET_ID>/edit`.
2. **Tab (GID)**: open the tab; the URL ends in `#gid=<number>`. Set `GOOGLE_SHEETS_SHEET_GID` to that number. The site looks up the tab name from it on every refresh, so renaming the tab never breaks anything. (`GOOGLE_SHEETS_SHEET_NAME` still works as an alternative.)
3. **Google Cloud project**: go to https://console.cloud.google.com and create a project (e.g. `fpl-website`).
4. **Enable APIs**: under APIs & Services → Library, enable **Google Sheets API** and **Google Drive API** (Drive is for photos).
5. **Service account**: under IAM & Admin → Service Accounts → Create. No roles are needed. Open it → Keys → Add key → JSON, and download the file.
6. **Share the sheet** with the service account's `client_email` as **Viewer** (Share → paste the email → Viewer, and untick "Notify").
7. Put `client_email` and `private_key` from the JSON into your env file (see section 4).
8. **Test** (prints counts and header names only, no player data):

   ```bash
   npm run check:sheets
   ```

Do **not** make the sheet public. The service account is enough.

## 2. Player photos (Google Drive)

Photos are **off** (`PLAYER_PHOTOS=off`): every player shows an initials avatar and the photo proxy makes no Google calls. Turn them on only after `npm run check:photos` passes.

### How it works

```
browser ──► /api/photos/<player key>?w=240|480|960      (Worker)
              ├─ only keys of registered players; Drive IDs/URLs never reach the browser
              ├─ Cloudflare edge cache (7 days; misses 1–60 min) shared by all Worker instances
              ├─ one in-flight Google fetch per photo+size (concurrent requests share it)
              └─ Drive API with the service account (drive.readonly):
                   files.get metadata ─► Drive's resized rendition (JPEG/PNG, also for HEIC)
                                     └─► original file, only if JPEG/PNG/WebP and ≤ 8 MB
                   bytes are verified as JPEG/PNG/WebP before being served
```

Failures (API disabled, folder not shared, deleted file, not an image, unsupported format) return 404 → the initials avatar; the reason is logged server-side as `[photos] <key> unavailable: <reason>`. Nothing is made public and no public Drive endpoints are used.

### What the Form owner must do (their Google account)

1. Open Google Drive → the Form's upload folder → the **`PLAYER PHOTO (File responses)`** subfolder (only this one — never the payment screenshot folder).
2. Share → add `fpl-sheets-reader@deeptiranjan-wp.iam.gserviceaccount.com` → **Viewer** → untick "Notify people" → Share.
   Do **not** change General access; the folder stays private.

### What you must do (your Google Cloud project `deeptiranjan-wp`)

3. Google Cloud console → APIs & Services → Library → **Google Drive API** → **Enable**.

### Activate

4. Run `npm run check:photos`. It reports, by sheet row, which photos the service account can read and why others cannot (API disabled / not shared / not an image), then test-downloads one resized photo. Proceed when it ends with `✓ All 89/89 player photos readable`.
5. Set `PLAYER_PHOTOS` to `on` in `wrangler.jsonc` (production) and `.env.local` / `.dev.vars` (local).
6. Redeploy (`npm run deploy`). Photos appear immediately; each size is fetched from Google once and then served from the edge cache.

New registrations' photos work automatically as long as they land in the shared folder (Google Forms keeps using the same folder).

## 3. Run locally

Requires Node.js 22+.

```bash
npm install
cp .env.example .env.local      # fill in the values
npm run dev                     # http://localhost:3000
```

Quality checks:

```bash
npm run typecheck   # generates route types first
npm run lint
npm run build
npm run preview                 # builds the Worker and runs it locally in workerd
```

`npm run preview` reads secrets from `.dev.vars` (same keys as `.env.example`).

## 4. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `GOOGLE_SHEETS_SPREADSHEET_ID` | yes | From the sheet URL |
| `GOOGLE_SHEETS_SHEET_GID` | yes* | Tab id from `#gid=` in the URL (set as a var in `wrangler.jsonc`) |
| `GOOGLE_SHEETS_SHEET_NAME` | no* | Exact tab name, only if no GID is set |
| `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL` | yes | `client_email` from the JSON key |
| `GOOGLE_SHEETS_PRIVATE_KEY` | yes | `private_key` from the JSON key, with `\n` sequences, in double quotes |
| `GOOGLE_SHEETS_CACHE_SECONDS` | no | Refresh interval, default `300`, minimum `30` |
| `GOOGLE_SHEETS_NAME_COLUMN` / `_PHOTO_COLUMN` / `_ROLE_COLUMN` | no | Defaults `B` / `D` / `E` |
| `NEXT_PUBLIC_SITE_URL` | yes in production | e.g. `https://fpl.example.com` — Open Graph share-preview URLs (set at **build** time) |

Never commit `.env.local`, `.dev.vars` or the JSON key. They are git-ignored.

## 5. Updating player information

Edit the Google Sheet. The website follows it automatically:

- **New registrations** appear after the cache interval (default 5 minutes).
- **Fixing a name or role**: edit the cell. The profile URL stays the same, because the ID comes from the photo upload, not the name.
- **Roles** accepted (any case, spaces or hyphens): `BATSMAN`, `BOWLER`, `ALL ROUNDER` / `ALL-ROUNDER` / `ALLROUNDER`. Anything else is shown as "Role pending". It counts toward the total but not toward any role count, until corrected.
- **Rows without a name** are skipped. Empty rows are ignored.
- **Duplicates:** rows with the same name *and* the same photo are merged. Two rows that share only a name are kept, because two people can share a name. Delete a genuine double submission in the sheet.
- **Player numbers** (`#001`…) are generated by the website in sheet order. Deleting an earlier row renumbers later players.

### Teams, fixtures, results and tournament information

These pages read from `src/config/tournament.ts`. Each page shows an empty state until you add official entries there, then redeploy. The shapes are typed in `src/types/tournament.ts`. Team logos go in `public/teams/`.

## 6. How automatic refresh works

Implemented in `src/lib/player-cache.ts`:

```
request ──► memory (per Worker isolate) ──► Cloudflare KV (shared) ──► Google Sheets
```

1. **Fresh for `GOOGLE_SHEETS_CACHE_SECONDS`** (default 300). Every page, profile and photo request reuses the same cached dataset — no per-visitor Google calls.
2. **Stale-while-revalidate:** after expiry the cached copy is served instantly and exactly one background refresh runs (single-flight per isolate + a short KV lock across isolates).
3. **Stale-if-error:** if Google returns 429, 5xx or is unreachable, the last good copy (kept 7 days in KV) keeps being served and refreshes pause for `Retry-After` (or 60 s for 429, 20 s otherwise) across all isolates.
4. **Retries:** only 429 / 5xx / network errors, max 3 attempts, `Retry-After` honoured, otherwise exponential backoff with jitter, within an 8 s budget. 400/401/403/404 are never retried.
5. **Two Google calls per refresh at most:** one `batchGet` for columns B, D, E, plus the GID→tab lookup, which is cached for 6 hours.
6. **Visitors only see an error** ("Players are temporarily unavailable") when no cached copy exists at all; details stay in server logs.

The cache key includes the spreadsheet ID and tab GID, so changing either starts a fresh cache — data from an old tab is never served.

**If the registration tab is replaced** (e.g. a new "Form Responses" tab), its GID changes: update `GOOGLE_SHEETS_SHEET_GID` in `.env.local`, `.dev.vars` and `wrangler.jsonc`, then run `npm run check:sheets`.

## 7. Deploy to Cloudflare (Workers)

**Platform: Cloudflare Workers via the OpenNext adapter.** Cloudflare Pages static export is not suitable: player data, the photo proxy and the private service-account key all need server-side code on every request. Cloudflare's own guidance hosts full-stack Next.js on Workers.

Requires Node.js 22.9+.

### One-time setup (your machine)

```bash
npx wrangler login                                   # opens the browser; no token needed
npx wrangler kv namespace create NEXT_INC_CACHE_KV   # copy the printed id
```

Paste the id into `wrangler.jsonc` → the `NEXT_INC_CACHE_KV` entry's `id`. Create it **once**; reuse the same id afterwards. Configured: `001f67ffce054773abfd1ce0c77862a3`. Keep local development on simulated KV (no `"remote": true`) so tests never write to the production cache.

The production Worker is **`fpl4`** (serves `cricket.deeptiranjan.com`). On `fpl4` the Google Sheets values are set as runtime variables in the dashboard and are kept on every deploy by `"keep_vars": true`; do not also add them as secrets with the same names. For a new Worker, set them as secrets (each command prompts for the value; nothing is stored in files or shell history):

```bash
npx wrangler secret put GOOGLE_SHEETS_SPREADSHEET_ID
npx wrangler secret put GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL
npx wrangler secret put GOOGLE_SHEETS_PRIVATE_KEY      # paste private_key from the JSON key
```

`GOOGLE_SHEETS_SHEET_GID` and `GOOGLE_SHEETS_CACHE_SECONDS` are plain vars already set in `wrangler.jsonc`.

Production URL (build-time, not secret). Create `.env.production`:

```
NEXT_PUBLIC_SITE_URL=https://cricket.deeptiranjan.com
```

(the production custom domain). Do not put it in `.env.local` — that file overrides `.env.production` during deploy builds.

### Preview locally in the real Workers runtime

```bash
npm run preview          # builds, then serves on http://localhost:8787 using .dev.vars
```

### Deploy

```bash
npm run deploy           # check:deploy guard → opennextjs-cloudflare build → deploy
```

`check:deploy` refuses to continue if the Worker name is not `fpl4`, the KV or auction D1 id is a placeholder, or the site URL is missing/localhost.

### Git-connected builds (Workers Builds) — optional

Production is Git-connected: Worker **`fpl4`** ← `quvantamediadevops/fpl4`, branch `main`. The `name` in `wrangler.jsonc` must stay `fpl4`, or builds will not deploy to it. Settings:

| Setting | Value |
|---|---|
| Build command | `npx opennextjs-cloudflare build` |
| Deploy command | `npx opennextjs-cloudflare deploy` |
| Build variable | `NEXT_PUBLIC_SITE_URL` = production URL |
| Runtime variables / secrets | Google Sheets values (dashboard), `AUCTION_ADMINS`, `AUCTION_SESSION_SECRET` |

Before the first push: `git init`, then confirm `git status` does not list `.env.local`, `.dev.vars` or any `*.json` key file (all are git-ignored).

### Limits and caching

- Worker size ≈ 1.4 MB gzipped (free plan limit 3 MB).
- KV: player data is written at most once per cache interval (≈ 288 writes/day at 300 s; free plan allows 1,000/day).
- `/_next/static/*` is served `immutable` for a year via `public/_headers`. Player photos are edge-cached for 7 days; unavailable photos for 5 minutes.

## 8. Player auction (physical auction system)

Routes: `/auction/admin` (control room, sign-in required), `/auction/presenter` (big screen, public, read-only), `/auction/teams` (public squads). All are `noindex, nofollow`.

**How it works**
- Teams bid in the room; the admin records the result. There is no online bidding.
- Cloudflare D1 (`AUCTION_DB`) is the permanent record. The `AuctionRoom` Durable Object runs every admin action one at a time and pushes live state to the screens over WebSockets.
- Each sale is one D1 transaction. The database itself refuses a second live sale of a player, a reused confirmation, and any change or deletion of sales or audit events.
- Rules are stored in the database (`auction_settings`): budget ₹4,000, 11 auction players per team plus the pre-assigned icon (12 in total), any whole-rupee price from ₹100 to ₹3,000. The maximum price for a team's next player is `min(3000, remaining − 100 × slots left after this one)`.
- Icon players come from `src/config/tournament.ts` (`icon`). They are separate people from the registrations (a registered player with the same name stays in the auction), are pre-assigned to their team and cost nothing.

**One-time production setup on Worker `fpl4` (needs approval; not done yet)**
1. `npx wrangler d1 create fpl-auction --location apac` and paste its `database_id` into `wrangler.jsonc` (`AUCTION_DB`, replacing the placeholder).
2. `npx wrangler d1 migrations apply AUCTION_DB --remote`
3. Create admin accounts: `node scripts/auction-admin.mjs <name> [<name> …]`. It prints each password once, then two values to store as secrets: `npx wrangler secret put AUCTION_ADMINS --name fpl4` (PBKDF2 password hashes) and `npx wrangler secret put AUCTION_SESSION_SECRET --name fpl4` (session-signing key; set once).
4. `npm run check:deploy`, then commit and push to `main` (Git-connected deploy). The `AuctionRoom` Durable Object is created by the `auction-v1` migration in `wrangler.jsonc`. `check:deploy` blocks until step 1 is done.

**On the day**
1. Sign in at `/auction/admin`, press **Load pool from registrations** (copies the current registrations; must be exactly 8 × 11 = 88), check the icons, then **Start auction**.
2. Open `/auction/presenter` on the big screen and press **Fullscreen**.
3. Per player: select → physical bidding → choose the winning team and price → **Confirm sold** (or **Mark unsold**; unsold players can be selected again later).
4. Mistakes: **Correct** in the sales ledger, with a reason. The original sale is kept and marked reversed.
5. **Complete** only succeeds when all 88 are sold and every team has 11. Then download the CSV or print the team report.

**Local development**
- The auction needs the Workers runtime: its Durable Object and live channel are in `worker.ts`, which `next dev` does not load. Under `npm run dev` the auction pages show a notice instead.
- Run `npm run auction:local`. It applies the migration to the local D1 database (`.wrangler/state`, never `--remote`), builds, and starts the preview at http://localhost:8787 (`/auction/admin`, `/auction/presenter`, `/auction/teams`).
- Test login: put `AUCTION_ADMINS` and `AUCTION_SESSION_SECRET` from `node scripts/auction-admin.mjs local-admin` in `.dev.vars`. That file is gitignored and only used locally.

**Tests**
- `npm run test:auction`: rule tests (budget, reserve, limits, start and completion checks).
- `node scripts/auction-smoke.mjs`: a full auction against a local preview only (refuses non-local URLs). Needs a freshly migrated local database: `npx wrangler d1 migrations apply AUCTION_DB --local`.

## Search engines

The site is intentionally **not indexed**: every page sends `<meta name="robots" content="noindex, nofollow">` and every response (pages, API, photos, static files) sends `X-Robots-Tag: noindex, nofollow`. There is no sitemap, no canonical tags, no structured data and no Search Console verification. `robots.txt` allows crawling on purpose, so crawlers can read the noindex. Open Graph tags remain only for link previews when the URL is shared (e.g. WhatsApp). The site works normally for anyone with the link.

## Project structure

```
src/
  app/                     routes (players list lives in players/(directory) so profile 404s/redirects return real status codes)
    api/photos/[key]/      photo proxy
  components/{layout,home,players,teams,fixtures,results,ui}
  config/site.ts           brand, nav, page size
  config/tournament.ts     teams, fixtures, results, info (empty until supplied)
  lib/env.ts               config parsing
  lib/google-auth.ts       Web Crypto service-account auth
  lib/google-sheets.ts     batchGet of B, D, E + header guard
  lib/google-drive.ts      Drive URL parsing
  lib/players.ts           normalisation, IDs, stats, caching
  types/                   strict interfaces
scripts/check-sheets.ts    connection test
```
