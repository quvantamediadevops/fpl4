import { getSheetsConfig } from "@/lib/env";
import { SCOPES, getAccessToken } from "@/lib/google-auth";
import { findPlayer, getPlayerDirectory } from "@/lib/players";
import type { PhotoSource } from "@/types/player";

const WIDTHS = [96, 160, 240, 360, 480, 720, 960, 1200] as const;
const MAX_BYTES = 8 * 1024 * 1024;
const CACHE_CONTROL = "public, max-age=86400, s-maxage=604800, stale-while-revalidate=604800";

type EdgeCache = { match(req: Request): Promise<Response | undefined>; put(req: Request, res: Response): Promise<void> };

function edgeCache(): EdgeCache | null {
  const c = (globalThis as { caches?: { default?: EdgeCache } }).caches;
  return c?.default ?? null;
}

function pickWidth(raw: string | null): number {
  const n = Number(raw);
  return WIDTHS.find((w) => w >= n) ?? 480;
}

async function asImage(response: Response | null): Promise<Response | null> {
  if (!response?.ok) return null;
  const type = response.headers.get("content-type") ?? "";
  // HTML (e.g. a Drive sign-in page) means the file is not accessible. SVG is
  // refused because it can carry script and would be served from our origin.
  if (!type.startsWith("image/") || type.includes("svg")) return null;
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return null;
  const body = await response.arrayBuffer();
  if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null;
  return new Response(body, { headers: { "Content-Type": type } });
}

async function safeFetch(url: string, init?: RequestInit): Promise<Response | null> {
  try {
    return await fetch(url, { ...init, cache: "no-store", redirect: "follow" });
  } catch {
    return null;
  }
}

/**
 * Drive strategy, in order:
 * 1. Service account (works when the photo upload folder is shared with it):
 *    resized thumbnail, then the original file.
 * 2. Public "anyone with the link" thumbnail endpoint.
 * Anything that does not come back as an image is treated as inaccessible.
 */
async function fetchDrivePhoto(fileId: string, width: number): Promise<Response | null> {
  const config = getSheetsConfig();
  if (config) {
    try {
      const token = await getAccessToken(config.clientEmail, config.privateKey, SCOPES.drive);
      const auth = { headers: { Authorization: `Bearer ${token}` } };
      const meta = await safeFetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=mimeType,thumbnailLink&supportsAllDrives=true`,
        auth,
      );
      if (meta?.ok) {
        const info = (await meta.json()) as { mimeType?: string; thumbnailLink?: string };
        if (info.mimeType?.startsWith("image/")) {
          if (info.thumbnailLink) {
            const sized = info.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=w${width}`);
            const thumb = (await asImage(await safeFetch(sized))) ?? (await asImage(await safeFetch(sized, auth)));
            if (thumb) return thumb;
          }
          const original = await asImage(
            await safeFetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&supportsAllDrives=true`, auth),
          );
          if (original) return original;
        } else if (info.mimeType) {
          return null; // not an image: never proxy it
        }
      }
    } catch {
      // fall through to the public endpoint
    }
  }
  return asImage(await safeFetch(`https://drive.google.com/thumbnail?id=${fileId}&sz=w${width}`));
}

async function fetchPhoto(source: PhotoSource, width: number): Promise<Response | null> {
  if (source.kind === "drive") return fetchDrivePhoto(source.fileId, width);
  return asImage(await safeFetch(source.url));
}

export async function GET(request: Request, ctx: RouteContext<"/api/photos/[key]">) {
  const { key } = await ctx.params;
  if (!/^[0-9a-f]{8}$/.test(key)) return new Response(null, { status: 404 });

  const width = pickWidth(new URL(request.url).searchParams.get("w"));
  const cacheKey = new Request(new URL(`/api/photos/${key}?w=${width}`, request.url).toString());
  const cache = edgeCache();
  const hit = await cache?.match(cacheKey).catch(() => undefined);
  if (hit) return hit;

  // Negative results are cached at the edge too (Next.js forces no-store on 404
  // responses, so browsers would otherwise re-ask Google on every view).
  const unavailable = async () => {
    const miss = new Response(null, { status: 404, headers: { "Cache-Control": "public, max-age=300" } });
    if (cache) await cache.put(cacheKey, miss.clone()).catch(() => undefined);
    return miss;
  };

  const directory = await getPlayerDirectory();
  if (!directory.ok) return new Response(null, { status: 503, headers: { "Cache-Control": "no-store" } });

  const player = findPlayer(directory.data, key);
  if (!player?.photoSource) return unavailable();

  const image = await fetchPhoto(player.photoSource, width);
  // Private, deleted or not an image. Cached for 5 minutes so a fixed share setting shows up soon.
  if (!image) return unavailable();

  const response = new Response(image.body, {
    headers: {
      "Content-Type": image.headers.get("Content-Type") ?? "image/jpeg",
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
    },
  });
  if (cache) await cache.put(cacheKey, response.clone()).catch(() => undefined);
  return response;
}
