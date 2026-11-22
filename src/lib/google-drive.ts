import type { PhotoSource } from "@/types/player";

const FILE_ID = /^[A-Za-z0-9_-]{20,}$/;

const DRIVE_HOSTS = new Set([
  "drive.google.com",
  "docs.google.com",
  "drive.usercontent.google.com",
]);

/**
 * Turns a PLAYER PHOTO cell into a photo source.
 * Google Forms upload cells look like https://drive.google.com/open?id=FILE_ID
 * (several files are comma separated; the first is used).
 */
export function parsePhotoSource(raw: string): PhotoSource | null {
  const first = raw.split(/[\s,]+/).find((part) => part.trim().length > 0)?.trim();
  if (!first) return null;

  let url: URL;
  try {
    url = new URL(first);
  } catch {
    return FILE_ID.test(first) ? { kind: "drive", fileId: first } : null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;

  const host = url.hostname.toLowerCase();

  if (DRIVE_HOSTS.has(host)) {
    const fromQuery = url.searchParams.get("id");
    if (fromQuery && FILE_ID.test(fromQuery)) return { kind: "drive", fileId: fromQuery };
    const fromPath = url.pathname.match(/\/(?:file\/)?d\/([A-Za-z0-9_-]{20,})/);
    if (fromPath?.[1]) return { kind: "drive", fileId: fromPath[1] };
    return null; // folders, forms and other Drive pages are not images
  }

  if (host === "lh3.googleusercontent.com") {
    const match = url.pathname.match(/^\/d\/([A-Za-z0-9_-]{20,})/);
    if (match?.[1]) return { kind: "drive", fileId: match[1] };
  }

  return { kind: "direct", url: url.toString() };
}

/** Stable identity for a photo, used for de-duplication and IDs. */
export function photoIdentity(source: PhotoSource | null): string {
  if (!source) return "";
  return source.kind === "drive" ? `drive:${source.fileId}` : `url:${source.url}`;
}
