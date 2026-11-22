import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { SheetsError } from "@/lib/google-sheets";
import type { PlayerDataset } from "@/types/player";

/*
 * Shared cache for the public player dataset.
 *
 *   memory (per isolate) ──► Cloudflare KV (shared by every isolate) ──► Google Sheets
 *
 * - Fresh for `ttlSeconds` (default 300). After that the cached copy is still served
 *   immediately and ONE background refresh runs (stale-while-revalidate).
 * - Concurrent callers share a single in-flight refresh (single-flight), and a short KV
 *   lock stops several isolates refreshing at once.
 * - If Google fails (429, 5xx, network) the last known good copy keeps being served for
 *   up to 7 days (stale-if-error), and refreshes pause for Retry-After or a cooldown so
 *   no isolate hammers Google while it is rate limiting.
 * Only the public dataset (name, role, photo reference) is stored. No credentials.
 */

// Keys include a hash of spreadsheet id + tab GID, so data cached from one source
// is never served after the configuration points at another tab.
const keys = (source: string) => ({
  data: `fpl:s4:players:v2:${source}`,
  lock: `fpl:s4:players:refresh-lock:${source}`,
  cooldown: `fpl:s4:players:cooldown:${source}`,
});
const KEEP_SECONDS = 7 * 24 * 60 * 60;
const LOCK_SECONDS = 60; // KV minimum TTL
const DEFAULT_COOLDOWN_SECONDS = { rate_limited: 60, other: 20 } as const;

interface Entry {
  v: 2;
  storedAt: number;
  data: PlayerDataset;
}

interface KV {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

// Kept on globalThis: OpenNext bundles pages and route handlers as separate module
// graphs, so plain module variables would exist once per bundle, not once per isolate.
interface IsolateState {
  source: string;
  memory: Entry | null;
  inflight: Promise<Entry> | null;
  cooldownUntil: number;
}
const state: IsolateState = ((globalThis as unknown as { __fplPlayerCache?: IsolateState }).__fplPlayerCache ??= {
  source: "",
  memory: null,
  inflight: null,
  cooldownUntil: 0,
});

function cf(): { kv: KV | null; waitUntil: ((p: Promise<unknown>) => void) | null } {
  try {
    const { env, ctx } = getCloudflareContext();
    const kv = (env as unknown as Record<string, KV | undefined>).NEXT_INC_CACHE_KV ?? null;
    return { kv, waitUntil: ctx ? (p) => ctx.waitUntil(p) : null };
  } catch {
    return { kv: null, waitUntil: null }; // plain `next start`: memory only
  }
}

function isEntry(value: unknown): value is Entry {
  const e = value as Entry | null;
  return !!e && e.v === 2 && typeof e.storedAt === "number" && Array.isArray(e.data?.players) && !!e.data.stats;
}

async function readShared(kv: KV | null, key: string): Promise<Entry | null> {
  if (!kv) return null;
  try {
    const raw = await kv.get(key, "text");
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    return isEntry(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

async function coolingDown(kv: KV | null, key: string): Promise<boolean> {
  if (Date.now() < state.cooldownUntil) return true;
  if (!kv) return false;
  const until = Number((await kv.get(key, "text").catch(() => null)) ?? 0);
  if (until > Date.now()) {
    state.cooldownUntil = until;
    return true;
  }
  return false;
}

function refresh(loader: () => Promise<PlayerDataset>, kv: KV | null, k: ReturnType<typeof keys>): Promise<Entry> {
  if (state.inflight) return state.inflight;
  const started = Date.now();
  state.inflight = (async () => {
    try {
      const data = await loader();
      const entry: Entry = { v: 2, storedAt: Date.now(), data };
      state.memory = entry;
      state.cooldownUntil = 0;
      if (kv) {
        await Promise.all([
          kv.put(k.data, JSON.stringify(entry), { expirationTtl: KEEP_SECONDS }),
          kv.delete(k.cooldown),
        ]).catch(() => console.warn("[players] KV write failed; serving from memory"));
      }
      console.log(`[players] refreshed from Google Sheets in ${Date.now() - started}ms (${data.players.length} players)`);
      return entry;
    } catch (error) {
      const code = error instanceof SheetsError ? error.code : "unknown";
      const status = error instanceof SheetsError && error.status ? ` (${error.status})` : "";
      const wait =
        error instanceof SheetsError && error.retryAfter !== undefined
          ? Math.max(error.retryAfter, 5)
          : code === "rate_limited"
            ? DEFAULT_COOLDOWN_SECONDS.rate_limited
            : DEFAULT_COOLDOWN_SECONDS.other;
      state.cooldownUntil = Date.now() + wait * 1000;
      if (kv) {
        await kv
          .put(k.cooldown, String(state.cooldownUntil), { expirationTtl: Math.max(LOCK_SECONDS, wait) })
          .catch(() => undefined);
      }
      console.error(`[players] Google Sheets refresh failed: ${code}${status}; pausing refreshes for ${wait}s`);
      throw error;
    } finally {
      if (kv) await kv.delete(k.lock).catch(() => undefined);
    }
  })().finally(() => {
    state.inflight = null;
  });
  return state.inflight;
}

export interface CachedDataset {
  data: PlayerDataset;
  /** true when the copy is older than the TTL (being refreshed, or Google unavailable). */
  stale: boolean;
}

/**
 * Returns the dataset with as few Google calls as possible.
 * Throws only when there is no cached copy at all and Google cannot be reached.
 */
export async function getCachedDataset(
  loader: () => Promise<PlayerDataset>,
  ttlSeconds: number,
  /** Identifies the data source (spreadsheet + tab); changing it starts a fresh cache. */
  source: string,
): Promise<CachedDataset> {
  const ttl = ttlSeconds * 1000;
  if (state.source !== source) {
    state.source = source;
    state.memory = null;
    state.cooldownUntil = 0;
  }
  const k = keys(source);
  const isFresh = (e: Entry | null) => !!e && Date.now() - e.storedAt < ttl;

  if (isFresh(state.memory)) return { data: state.memory!.data, stale: false };

  const { kv, waitUntil } = cf();
  const shared = await readShared(kv, k.data);
  if (shared && (!state.memory || shared.storedAt > state.memory.storedAt)) state.memory = shared;
  if (isFresh(state.memory)) return { data: state.memory!.data, stale: false };

  if (state.memory) {
    // Stale: answer now, refresh once in the background.
    if (!state.inflight && !(await coolingDown(kv, k.cooldown))) {
      const locked = kv ? await kv.get(k.lock, "text").catch(() => null) : null;
      if (!locked) {
        const job = (async () => {
          if (kv) await kv.put(k.lock, "1", { expirationTtl: LOCK_SECONDS }).catch(() => undefined);
          await refresh(loader, kv, k);
        })().catch(() => undefined);
        if (waitUntil) waitUntil(job);
      }
    }
    return { data: state.memory.data, stale: true };
  }

  // Nothing cached anywhere: callers wait for a single shared refresh.
  if (!state.inflight && (await coolingDown(kv, k.cooldown))) {
    throw new SheetsError("rate_limited", "Refresh paused after a recent Google error");
  }
  const entry = await refresh(loader, kv, k);
  return { data: entry.data, stale: false };
}
