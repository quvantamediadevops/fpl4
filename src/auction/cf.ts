/*
 * Minimal Cloudflare runtime types used by the auction (the project does not
 * depend on @cloudflare/workers-types). Only the members the auction calls.
 */

export interface D1Result<T = Record<string, unknown>> {
  results: T[];
  success: boolean;
  meta: { changes?: number; last_row_id?: number };
}

export interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run(): Promise<D1Result>;
}

export interface D1Database {
  prepare(sql: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

export type DurableObjectId = object;

export interface DurableObjectStub {
  fetch(input: string | Request, init?: RequestInit): Promise<Response>;
}

export interface DurableObjectNamespace {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): DurableObjectStub;
}

export interface SqlStorageCursor<T> {
  toArray(): T[];
}

/** SQLite storage private to the Durable Object (SQLite-backed class). */
export interface SqlStorage {
  exec<T = Record<string, unknown>>(query: string, ...bindings: unknown[]): SqlStorageCursor<T>;
}

export interface DurableObjectStorage {
  sql: SqlStorage;
  transactionSync<T>(fn: () => T): T;
}

export interface DurableObjectState {
  acceptWebSocket(ws: WebSocket, tags?: string[]): void;
  getWebSockets(tag?: string): WebSocket[];
  storage: DurableObjectStorage;
}

export interface AuctionEnv {
  AUCTION_DB: D1Database;
  AUCTION_ROOM: DurableObjectNamespace;
  PLAYER_PHOTOS?: string;
  /** Admin names allowed to HARD RESET the auction. Unset or empty: nobody. */
  AUCTION_SUPER_ADMINS?: string;
  /** Local fault injection for reset tests ("backup" | "database"). Ignored unless the request is LOCAL. */
  AUCTION_RESET_FAULT?: string;
}

/** Name of the single AuctionRoom Durable Object instance (not the Worker name). All season commands go through it. */
export const AUCTION_ROOM_NAME = "fpl-season-4";
