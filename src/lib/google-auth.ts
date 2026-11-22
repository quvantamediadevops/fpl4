import "server-only";

/**
 * Service-account OAuth using Web Crypto only, so it runs unchanged on
 * Cloudflare Workers and Node.js (no googleapis / Node crypto dependency).
 */

export const SCOPES = {
  sheets: "https://www.googleapis.com/auth/spreadsheets.readonly",
  drive: "https://www.googleapis.com/auth/drive.readonly",
} as const;

export class GoogleAuthError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "GoogleAuthError";
  }
}

// Isolate-wide (shared by every bundle) so one token serves all routes.
const tokenCache: Map<string, { token: string; expiresAt: number }> = ((globalThis as unknown as {
  __fplTokens?: Map<string, { token: string; expiresAt: number }>;
}).__fplTokens ??= new Map());
const keyCache = new Map<string, Promise<CryptoKey>>();

function base64UrlFromBytes(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlFromString(value: string): string {
  return base64UrlFromBytes(new TextEncoder().encode(value));
}

function importPrivateKey(pem: string): Promise<CryptoKey> {
  const cached = keyCache.get(pem);
  if (cached) return cached;

  const body = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "");

  let der: Uint8Array<ArrayBuffer>;
  try {
    der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
  } catch {
    throw new GoogleAuthError("Private key is not valid base64 PEM");
  }

  const promise = crypto.subtle
    .importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"])
    .catch(() => {
      keyCache.delete(pem);
      throw new GoogleAuthError("Private key could not be imported (expected PKCS#8 PEM)");
    });

  keyCache.set(pem, promise);
  return promise;
}

export async function getAccessToken(
  clientEmail: string,
  privateKey: string,
  scope: string,
): Promise<string> {
  const cacheKey = `${clientEmail}|${scope}`;
  const now = Math.floor(Date.now() / 1000);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt - 60 > now) return cached.token;

  const header = base64UrlFromString(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64UrlFromString(
    JSON.stringify({
      iss: clientEmail,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      iat: now,
      exp: now + 3600,
    }),
  );
  const unsigned = `${header}.${claims}`;
  const key = await importPrivateKey(privateKey);
  const signature = new Uint8Array(
    await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(unsigned)),
  );
  const assertion = `${unsigned}.${base64UrlFromBytes(signature)}`;

  let response: Response;
  try {
    response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }),
      cache: "no-store",
    });
  } catch {
    throw new GoogleAuthError("Token endpoint unreachable");
  }

  if (!response.ok) {
    throw new GoogleAuthError("Service account token request was rejected", response.status);
  }

  const json = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) throw new GoogleAuthError("Token response missing access_token");

  tokenCache.set(cacheKey, {
    token: json.access_token,
    expiresAt: now + (json.expires_in ?? 3600),
  });
  return json.access_token;
}
