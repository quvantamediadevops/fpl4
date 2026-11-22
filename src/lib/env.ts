import "server-only";

export interface SheetsConfig {
  spreadsheetId: string;
  /** Tab title. Optional when sheetGid is set (the GID is authoritative). */
  sheetName: string | null;
  /** Numeric tab id from the sheet URL (#gid=...). Survives tab renames. */
  sheetGid: number | null;
  clientEmail: string;
  privateKey: string;
  columns: { name: string; photo: string; role: string };
  cacheSeconds: number;
}

const COLUMN = /^[A-Z]{1,3}$/;

function column(value: string | undefined, fallback: string): string {
  const v = (value ?? "").trim().toUpperCase();
  return COLUMN.test(v) ? v : fallback;
}

/** Reads configuration at call time (Workers populate process.env per request). */
export function getSheetsConfig(): SheetsConfig | null {
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID?.trim();
  const sheetName = process.env.GOOGLE_SHEETS_SHEET_NAME?.trim() || null;
  const gidRaw = process.env.GOOGLE_SHEETS_SHEET_GID?.trim();
  const sheetGid = gidRaw && /^\d+$/.test(gidRaw) ? Number(gidRaw) : null;
  const clientEmail = process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SHEETS_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();

  if (!spreadsheetId || (!sheetName && sheetGid === null) || !clientEmail || !privateKey) return null;

  const seconds = Number.parseInt(process.env.GOOGLE_SHEETS_CACHE_SECONDS ?? "", 10);

  return {
    spreadsheetId,
    sheetName,
    sheetGid,
    clientEmail,
    privateKey,
    columns: {
      name: column(process.env.GOOGLE_SHEETS_NAME_COLUMN, "B"),
      photo: column(process.env.GOOGLE_SHEETS_PHOTO_COLUMN, "D"),
      role: column(process.env.GOOGLE_SHEETS_ROLE_COLUMN, "E"),
    },
    cacheSeconds: Number.isFinite(seconds) && seconds >= 30 ? seconds : 300,
  };
}
