import "server-only";
import { cookies } from "next/headers";
import type { AuctionEnv } from "./cf";
import { superAdminNames } from "./reset";

/*
 * Admin authentication for the auction control room.
 *
 * - Accounts live in the Worker secret AUCTION_ADMINS:
 *     "name:pbkdf2:<iterations>:<saltHex>:<hashHex>[;…]"  (PBKDF2-HMAC-SHA256, 256-bit)
 *   produced by `node scripts/auction-admin.mjs <name>`, which also generates a long
 *   random password. Only the hash is stored; passwords never reach the browser.
 * - Sessions: a random 256-bit token, signed with HMAC-SHA256 using the Worker secret
 *   AUCTION_SESSION_SECRET, in an HttpOnly, Secure, SameSite=Strict, __Host- cookie.
 *   The signature is checked first; D1 then holds only a SHA-256 of the token with a
 *   12-hour expiry, so sessions can be revoked (logout, or an account being removed).
 * - Every mutation must come from this site's Origin and carry the session's CSRF token.
 * - Failed logins are rate-limited per client IP (stored hashed).
 */

export const SESSION_COOKIE = "__Host-fpl_auction";
const SESSION_HOURS = 12;
const LOGIN_WINDOW_MIN = 15;
const LOGIN_MAX_FAILURES = 6;
const PBKDF2_MIN = 10_000;
const PBKDF2_MAX = 100_000; // Workers' PBKDF2 limit
const DUMMY_ITERATIONS = 50_000;

export interface AdminSession {
  adminId: string;
  csrfToken: string;
  expiresAt: string;
}

const enc = new TextEncoder();

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

const b64url = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function randomToken(bytes = 32): string {
  return b64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

const hexToBytes = (hex: string) => new Uint8Array(hex.match(/../g)?.map((h) => parseInt(h, 16)) ?? []);

async function pbkdf2Hex(password: string, saltHex: string, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: hexToBytes(saltHex), iterations }, key, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function sessionSecret(): string | null {
  const s = process.env.AUCTION_SESSION_SECRET ?? "";
  return s.length >= 32 ? s : null;
}

async function hmacKey(secret: string) {
  return crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}

async function signToken(token: string, secret: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(token));
  return `${token}.${b64url(new Uint8Array(sig))}`;
}

/** Returns the token if the cookie's signature is valid (constant-time check). */
async function verifySignedToken(value: string, secret: string): Promise<string | null> {
  const [token, sig, extra] = value.split(".");
  if (!token || !sig || extra !== undefined || token.length !== 43 || !/^[A-Za-z0-9_-]+$/.test(sig)) return null;
  const raw = Uint8Array.from(atob(sig.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (sig.length % 4)) % 4)), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify("HMAC", await hmacKey(secret), raw, enc.encode(token));
  return ok ? token : null;
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type Account = { iterations: number; salt: string; hash: string };

function admins(): Map<string, Account> {
  const map = new Map<string, Account>();
  for (const entry of (process.env.AUCTION_ADMINS ?? "").split(";")) {
    const [name, scheme, iter, salt, hash] = entry.trim().split(":");
    const iterations = Number(iter);
    if (
      name && scheme === "pbkdf2" && salt && hash &&
      /^[a-z0-9_-]{2,32}$/i.test(name) && /^[0-9a-f]{32,}$/.test(salt) && /^[0-9a-f]{64}$/.test(hash) &&
      Number.isInteger(iterations) && iterations >= PBKDF2_MIN && iterations <= PBKDF2_MAX
    ) {
      map.set(name.toLowerCase(), { iterations, salt, hash });
    }
  }
  return map;
}

/** Super-admins (may HARD RESET): an existing account that is also listed in AUCTION_SUPER_ADMINS. */
export function isSuperAdmin(adminId: string): boolean {
  const name = adminId.toLowerCase();
  return admins().has(name) && superAdminNames(process.env.AUCTION_SUPER_ADMINS).has(name);
}

/** Login needs at least one account and a session-signing secret. */
export function adminLoginConfigured(): boolean {
  return admins().size > 0 && sessionSecret() !== null;
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? request.headers.get("x-real-ip") ?? "local";
}

export type LoginResult = { ok: true } | { ok: false; status: number; message: string };

export async function login(env: AuctionEnv, request: Request, name: string, password: string): Promise<LoginResult> {
  const ipHash = await sha256Hex(`login|${clientIp(request)}`);
  const since = new Date(Date.now() - LOGIN_WINDOW_MIN * 60_000).toISOString();
  const recent = await env.AUCTION_DB.prepare("SELECT COUNT(*) AS n FROM admin_login_attempts WHERE ip_hash = ?1 AND created_at > ?2").bind(ipHash, since).first<{ n: number }>();
  if ((recent?.n ?? 0) >= LOGIN_MAX_FAILURES) {
    return { ok: false, status: 429, message: `Too many failed attempts. Try again in ${LOGIN_WINDOW_MIN} minutes.` };
  }

  const secret = sessionSecret();
  if (!secret) return { ok: false, status: 503, message: "Admin login is not configured." };
  const account = admins().get(name.trim().toLowerCase());
  // Derive even for unknown accounts so timing does not reveal which names exist.
  const candidate = await pbkdf2Hex(password, account?.salt ?? "0".repeat(32), account?.iterations ?? DUMMY_ITERATIONS);
  if (!account || !password || !safeEqual(candidate, account.hash)) {
    await env.AUCTION_DB.batch([
      env.AUCTION_DB.prepare("INSERT INTO admin_login_attempts (ip_hash, created_at) VALUES (?1, ?2)").bind(ipHash, new Date().toISOString()),
      env.AUCTION_DB.prepare("DELETE FROM admin_login_attempts WHERE created_at < ?1").bind(new Date(Date.now() - 24 * 3600_000).toISOString()),
    ]);
    return { ok: false, status: 401, message: "Incorrect name or password." };
  }

  const token = randomToken();
  const created = new Date();
  const expires = new Date(created.getTime() + SESSION_HOURS * 3600_000);
  await env.AUCTION_DB.prepare("INSERT INTO admin_sessions (token_hash, admin_id, csrf_token, created_at, expires_at) VALUES (?1, ?2, ?3, ?4, ?5)")
    .bind(await sha256Hex(token), name.trim().toLowerCase(), randomToken(24), created.toISOString(), expires.toISOString())
    .run();

  (await cookies()).set(SESSION_COOKIE, await signToken(token, secret), { httpOnly: true, secure: true, sameSite: "strict", path: "/", expires });
  return { ok: true };
}

async function cookieToken(): Promise<string | null> {
  const value = (await cookies()).get(SESSION_COOKIE)?.value;
  const secret = sessionSecret();
  if (!value || !secret || value.length > 128) return null;
  return verifySignedToken(value, secret);
}

export async function getAdminSession(env: AuctionEnv): Promise<AdminSession | null> {
  const token = await cookieToken(); // forged or tampered cookies never reach the database
  if (!token) return null;
  const row = await env.AUCTION_DB.prepare(
    "SELECT admin_id, csrf_token, expires_at FROM admin_sessions WHERE token_hash = ?1 AND revoked_at IS NULL AND expires_at > ?2",
  )
    .bind(await sha256Hex(token), new Date().toISOString())
    .first<{ admin_id: string; csrf_token: string; expires_at: string }>();
  // An account removed from AUCTION_ADMINS loses access immediately.
  if (!row || !admins().has(row.admin_id)) return null;
  return { adminId: row.admin_id, csrfToken: row.csrf_token, expiresAt: row.expires_at };
}

export async function logout(env: AuctionEnv): Promise<void> {
  const jar = await cookies();
  const token = await cookieToken();
  if (token) {
    await env.AUCTION_DB.prepare("UPDATE admin_sessions SET revoked_at = ?2 WHERE token_hash = ?1 AND revoked_at IS NULL")
      .bind(await sha256Hex(token), new Date().toISOString())
      .run();
  }
  jar.delete(SESSION_COOKIE);
}

/** Same-origin check for state-changing requests (defence in depth with SameSite=Strict). */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("Origin");
  if (!origin) return false;
  try {
    return new URL(origin).host === new URL(request.url).host;
  } catch {
    return false;
  }
}

export type MutationAuth = { ok: true; session: AdminSession } | { ok: false; status: number; message: string };

/** Session + Origin + CSRF token. Call at the top of every admin mutation. */
export async function authorizeMutation(env: AuctionEnv, request: Request): Promise<MutationAuth> {
  if (!sameOrigin(request)) return { ok: false, status: 403, message: "Request blocked: wrong origin." };
  const session = await getAdminSession(env);
  if (!session) return { ok: false, status: 401, message: "Your session has ended. Sign in again." };
  const csrf = request.headers.get("X-CSRF-Token") ?? "";
  if (!safeEqual(csrf, session.csrfToken)) return { ok: false, status: 403, message: "Request blocked: invalid security token. Reload the page." };
  return { ok: true, session };
}
