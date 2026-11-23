import { failureTtlSeconds, fetchPlayerPhoto, type PhotoResult } from "@/lib/photo-fetch";
import { findPlayer, getPlayerDirectory } from "@/lib/players";

/*
 * Secure photo proxy: /api/photos/<player key>?w=<width>
 * - Serves only photos referenced in column D for a registered player key; never an arbitrary Drive file.
 * - The browser never sees Drive URLs, file IDs, tokens or credentials.
 * - Responses are image bytes verified as JPEG, PNG or WebP.
 * - Results (including "unavailable") are cached in the Cloudflare edge cache, shared by all Worker
 *   instances in a location; concurrent requests for the same photo share one Google fetch.
 * - Disabled (404, no Google calls) unless PLAYER_PHOTOS=on.
 */

const WIDTHS = [240, 480, 960] as const; // few variants = few Google fetches per photo
const SUCCESS_CACHE = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";

type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

const edgeCache = (): EdgeCache | null => (globalThis as { caches?: { default?: EdgeCache } }).caches?.default ?? null;

const inflight: Map<string, Promise<PhotoResult>> = ((globalThis as unknown as {
  __fplPhotoInflight?: Map<string, Promise<PhotoResult>>;
}).__fplPhotoInflight ??= new Map());

const pickWidth = (raw: string | null): number => WIDTHS.find((w) => w >= Number(raw)) ?? 960;

const notFound = (cacheSeconds = 0) =>
  new Response(null, { status: 404, headers: { "Cache-Control": cacheSeconds ? `public, max-age=${cacheSeconds}` : "no-store" } });

export async function GET(request: Request, ctx: RouteContext<"/api/photos/[key]">) {
  if (process.env.PLAYER_PHOTOS !== "on") return notFound();

  const { key } = await ctx.params;
  if (!/^[0-9a-f]{8}$/.test(key)) return notFound();

  const width = pickWidth(new URL(request.url).searchParams.get("w"));
  const cacheKey = new Request(new URL(`/api/photos/${key}?w=${width}`, request.url).toString());
  const cache = edgeCache();
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  const directory = await getPlayerDirectory();
  if (!directory.ok) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });

  const player = findPlayer(directory.data, key);
  if (!player?.photoSource) return notFound(3600);

  const flightKey = `${key}:${width}`;
  let job = inflight.get(flightKey);
  if (!job) {
    job = fetchPlayerPhoto(player.photoSource, width).finally(() => inflight.delete(flightKey));
    inflight.set(flightKey, job);
  }
  const result = await job;

  if (!result.ok) {
    console.warn(`[photos] ${key} unavailable: ${result.reason}`);
    const ttl = failureTtlSeconds(result.reason);
    // Next.js forces no-store on 404s it returns, so remember the miss at the edge explicitly.
    if (cache) await cache.put(cacheKey, notFound(ttl)).catch(() => undefined);
    return notFound(ttl);
  }

  const response = new Response(result.body.slice(0), {
    headers: {
      "Content-Type": result.contentType,
      "Content-Length": String(result.body.byteLength),
      "Cache-Control": SUCCESS_CACHE,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
  if (cache) await cache.put(cacheKey, response.clone()).catch(() => undefined);
  return response;
}
