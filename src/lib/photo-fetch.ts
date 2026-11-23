import "server-only";
import { getSheetsConfig } from "@/lib/env";
import { GoogleAuthError, SCOPES, getAccessToken } from "@/lib/google-auth";
import type { PhotoSource } from "@/types/player";

/*
 * Fetches one registered player's photo for the /api/photos proxy.
 *
 * Drive files are read ONLY through the Drive API with the service account
 * (drive.readonly): the Form owner shares the photo-upload folder with it as Viewer.
 * Nothing is made public and no public Drive endpoints are used. Callers only pass
 * file IDs taken from column D of the registration sheet.
 */

export type PhotoFailure =
  | "not_configured" // no service-account credentials
  | "api_disabled" // Google Drive API not enabled in the Cloud project
  | "no_access" // file not shared with the service account (Drive answers 404/403)
  | "not_found" // deleted / trashed
  | "not_image" // file is not an image
  | "unsupported_format" // image Drive cannot convert and browsers cannot show
  | "too_large"
  | "rate_limited"
  | "upstream_error"; // transient Google / network failure

export type PhotoResult = { ok: true; body: ArrayBuffer; contentType: ImageType } | { ok: false; reason: PhotoFailure };

export type ImageType = "image/jpeg" | "image/png" | "image/webp";

const MAX_BYTES = 8 * 1024 * 1024;
const DIRECT_TYPES = new Set<string>(["image/jpeg", "image/png", "image/webp"]);

/** Identifies the image from its bytes; never trusts an upstream Content-Type. */
export function sniffImage(bytes: Uint8Array): ImageType | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.subarray(8, 12)) === "WEBP"
  )
    return "image/webp";
  return null;
}

async function readImage(response: Response): Promise<PhotoResult> {
  const declared = Number(response.headers.get("content-length") ?? 0);
  if (declared > MAX_BYTES) return { ok: false, reason: "too_large" };
  const body = await response.arrayBuffer();
  if (body.byteLength > MAX_BYTES) return { ok: false, reason: "too_large" };
  const type = sniffImage(new Uint8Array(body));
  return type ? { ok: true, body, contentType: type } : { ok: false, reason: "unsupported_format" };
}

async function get(url: string, token?: string): Promise<Response | null> {
  try {
    return await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      cache: "no-store",
      redirect: "follow",
    });
  } catch {
    return null;
  }
}

async function classifyDriveError(response: Response): Promise<PhotoFailure> {
  if (response.status === 404) return "no_access"; // Drive hides files the caller cannot see
  if (response.status === 429) return "rate_limited";
  if (response.status >= 500) return "upstream_error";
  let reason = "";
  try {
    const j = (await response.json()) as { error?: { errors?: { reason?: string }[]; status?: string; details?: { reason?: string }[] } };
    reason = [j.error?.errors?.[0]?.reason, j.error?.status, ...(j.error?.details ?? []).map((d) => d.reason)].join(" ");
  } catch {}
  if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason)) return "api_disabled";
  if (/rateLimit|userRateLimit|RESOURCE_EXHAUSTED/i.test(reason)) return "rate_limited";
  return "no_access";
}

async function fetchDrivePhoto(fileId: string, width: number): Promise<PhotoResult> {
  const config = getSheetsConfig();
  if (!config) return { ok: false, reason: "not_configured" };

  let token: string;
  try {
    token = await getAccessToken(config.clientEmail, config.privateKey, SCOPES.drive);
  } catch (error) {
    return { ok: false, reason: error instanceof GoogleAuthError && error.status ? "no_access" : "upstream_error" };
  }

  const id = encodeURIComponent(fileId);
  const meta = await get(
    `https://www.googleapis.com/drive/v3/files/${id}?fields=mimeType,size,trashed,thumbnailLink&supportsAllDrives=true`,
    token,
  );
  if (!meta) return { ok: false, reason: "upstream_error" };
  if (!meta.ok) return { ok: false, reason: await classifyDriveError(meta) };

  const info = (await meta.json()) as { mimeType?: string; size?: string; trashed?: boolean; thumbnailLink?: string };
  if (info.trashed) return { ok: false, reason: "not_found" };
  if (!info.mimeType?.startsWith("image/") || info.mimeType.includes("svg")) return { ok: false, reason: "not_image" };

  // 1. Drive's resized rendition: small, and already JPEG/PNG even for HEIC phone photos.
  if (info.thumbnailLink && /^https:\/\/[a-z0-9.-]+\.googleusercontent\.com\//.test(info.thumbnailLink)) {
    const sized = info.thumbnailLink.replace(/=s\d+(-[a-z0-9-]+)?$/i, `=w${width}`);
    const thumb = await get(sized, token);
    if (thumb?.ok) {
      const result = await readImage(thumb);
      if (result.ok) return result;
    }
  }

  // 2. Original file, only for formats browsers can display.
  if (!DIRECT_TYPES.has(info.mimeType)) return { ok: false, reason: "unsupported_format" };
  if (Number(info.size ?? 0) > MAX_BYTES) return { ok: false, reason: "too_large" };
  const original = await get(`https://www.googleapis.com/drive/v3/files/${id}?alt=media&supportsAllDrives=true`, token);
  if (!original) return { ok: false, reason: "upstream_error" };
  if (!original.ok) return { ok: false, reason: await classifyDriveError(original) };
  return readImage(original);
}

async function fetchDirectPhoto(url: string): Promise<PhotoResult> {
  const response = await get(url);
  if (!response) return { ok: false, reason: "upstream_error" };
  if (!response.ok) return { ok: false, reason: response.status >= 500 ? "upstream_error" : "not_found" };
  return readImage(response);
}

export function fetchPlayerPhoto(source: PhotoSource, width: number): Promise<PhotoResult> {
  return source.kind === "drive" ? fetchDrivePhoto(source.fileId, width) : fetchDirectPhoto(source.url);
}

/** How long a failure is remembered at the edge before Google is asked again. */
export function failureTtlSeconds(reason: PhotoFailure): number {
  switch (reason) {
    case "rate_limited":
    case "upstream_error":
      return 60;
    case "api_disabled":
    case "no_access":
    case "not_configured":
      return 300; // picks up a newly shared folder within 5 minutes
    default:
      return 3600;
  }
}
