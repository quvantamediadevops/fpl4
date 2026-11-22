import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

// OpenNext's incremental cache and the player-data cache (src/lib/player-cache.ts)
// share one KV namespace, bound as NEXT_INC_CACHE_KV in wrangler.jsonc. This
// override reads that exact binding name.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
