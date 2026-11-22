import "server-only";
import type { SheetsConfig } from "@/lib/env";
import { GoogleAuthError, SCOPES, getAccessToken } from "@/lib/google-auth";

export type SheetsErrorCode =
  | "auth"
  | "forbidden"
  | "not_found"
  | "rate_limited"
  | "unavailable"
  | "network"
  | "columns"
  | "bad_response";

export class SheetsError extends Error {
  constructor(
    readonly code: SheetsErrorCode,
    message: string,
    readonly status?: number,
    /** Seconds Google asked us to wait (Retry-After), when known. */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "SheetsError";
  }
}

/** One cell per sheet row, index 0 = sheet row 2. */
export interface PublicColumns {
  names: string[];
  photos: string[];
  roles: string[];
}

// Headers are read only to confirm the configured columns are still the public
// ones. If someone inserts a column in the sheet, the site fails closed instead
// of publishing whatever moved into B, D or E (e.g. mobile numbers).
const EXPECTED_HEADERS: Record<keyof PublicColumns, RegExp> = {
  names: /name/i,
  photos: /photo|picture|image/i,
  roles: /type|role/i,
};

const RETRYABLE = new Set([429, 500, 502, 503, 504]);
const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 600;
/** Total time one Google call may spend waiting between retries. */
const RETRY_BUDGET_MS = 8_000;

function quoteSheet(name: string): string {
  return `'${name.replace(/'/g, "''")}'`;
}

function statusToCode(status: number): SheetsErrorCode {
  if (status === 401) return "auth";
  if (status === 403) return "forbidden";
  if (status === 404 || status === 400) return "not_found";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "unavailable";
  return "bad_response";
}

/** Retry-After as seconds (delta-seconds or HTTP date). */
function parseRetryAfter(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds;
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, Math.ceil((date - Date.now()) / 1000));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * GET with a bounded retry policy:
 * - retries only 429 and transient 5xx / network failures, never 4xx auth or permission errors
 * - honours Retry-After, otherwise exponential backoff with full jitter
 * - gives up (and reports Retry-After) rather than exceeding the time budget
 */
async function googleGet(url: string, token: string): Promise<Response> {
  let waited = 0;
  for (let attempt = 1; ; attempt++) {
    let response: Response | undefined;
    try {
      response = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    } catch {
      response = undefined;
    }

    if (response?.ok) return response;

    const status = response?.status;
    const retryable = status === undefined || RETRYABLE.has(status);
    const retryAfter = parseRetryAfter(response?.headers.get("retry-after") ?? null);
    const fail = () =>
      status === undefined
        ? new SheetsError("network", "Sheets API unreachable")
        : new SheetsError(statusToCode(status), `Sheets API responded ${status}`, status, retryAfter);

    if (!retryable || attempt >= MAX_ATTEMPTS) throw fail();

    const backoff = BASE_DELAY_MS * 2 ** (attempt - 1);
    const delay = retryAfter !== undefined ? retryAfter * 1000 : Math.round(Math.random() * backoff + backoff / 2);
    if (waited + delay > RETRY_BUDGET_MS) throw fail();
    waited += delay;
    await sleep(delay);
  }
}

// GID → tab title, cached per isolate. The title rarely changes; a failed
// range read clears it so a renamed tab is picked up on the next attempt.
const TITLE_TTL_MS = 6 * 60 * 60 * 1000;
const titleCache: Map<string, { title: string; expires: number }> = ((globalThis as unknown as {
  __fplSheetTitles?: Map<string, { title: string; expires: number }>;
}).__fplSheetTitles ??= new Map());

async function resolveSheetTitle(config: SheetsConfig, token: string): Promise<string> {
  if (config.sheetGid === null) return config.sheetName!;
  const cacheKey = `${config.spreadsheetId}:${config.sheetGid}`;
  const cached = titleCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) return cached.title;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    config.spreadsheetId,
  )}?fields=sheets.properties(sheetId,title)`;
  const json = (await (await googleGet(url, token)).json()) as {
    sheets?: { properties?: { sheetId?: number; title?: string } }[];
  };
  const title = json.sheets?.find((s) => s.properties?.sheetId === config.sheetGid)?.properties?.title;
  if (!title) throw new SheetsError("not_found", "No tab with the configured GID");
  if (config.sheetName && config.sheetName !== title) {
    console.warn("[sheets] GOOGLE_SHEETS_SHEET_NAME differs from the tab found by GID; using the GID");
  }
  titleCache.set(cacheKey, { title, expires: Date.now() + TITLE_TTL_MS });
  return title;
}

/**
 * Fetches ONLY the three public columns with a single batchGet request
 * (plus a GID lookup at most every few hours). Timestamp, mobile, registration
 * and payment columns are never requested.
 */
export async function fetchPublicColumns(config: SheetsConfig): Promise<PublicColumns> {
  let token: string;
  try {
    token = await getAccessToken(config.clientEmail, config.privateKey, SCOPES.sheets);
  } catch (error) {
    const status = error instanceof GoogleAuthError ? error.status : undefined;
    throw new SheetsError("auth", (error as Error).message, status);
  }

  const title = await resolveSheetTitle(config, token);
  const sheet = quoteSheet(title);
  const { name, photo, role } = config.columns;
  const params = new URLSearchParams({ majorDimension: "COLUMNS", valueRenderOption: "FORMATTED_VALUE" });
  for (const col of [name, photo, role]) params.append("ranges", `${sheet}!${col}1:${col}`);

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(
    config.spreadsheetId,
  )}/values:batchGet?${params.toString()}`;

  let response: Response;
  try {
    response = await googleGet(url, token);
  } catch (error) {
    if (error instanceof SheetsError && error.status === 400) titleCache.clear(); // tab may have been renamed
    throw error;
  }

  const json = (await response.json()) as { valueRanges?: { values?: unknown[][] }[] };
  const ranges = json.valueRanges;
  if (!Array.isArray(ranges) || ranges.length !== 3) {
    throw new SheetsError("bad_response", "Unexpected batchGet response shape");
  }

  const toColumn = (index: number): string[] =>
    (ranges[index]?.values?.[0] ?? []).map((v) => (typeof v === "string" ? v : String(v ?? "")));

  const columns = { names: toColumn(0), photos: toColumn(1), roles: toColumn(2) };

  for (const key of Object.keys(EXPECTED_HEADERS) as (keyof PublicColumns)[]) {
    if (!EXPECTED_HEADERS[key].test(columns[key][0] ?? "")) {
      throw new SheetsError("columns", `Column for ${key} has unexpected header`);
    }
  }

  return { names: columns.names.slice(1), photos: columns.photos.slice(1), roles: columns.roles.slice(1) };
}
