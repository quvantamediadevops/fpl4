import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import kvIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/kv-incremental-cache";

// The player dataset is cached with unstable_cache. On Workers that cache is
// persisted in a single KV namespace (binding NEXT_INC_CACHE_KV), so every
// isolate shares one copy and Google is called at most once per interval.
export default defineCloudflareConfig({
  incrementalCache: kvIncrementalCache,
});
