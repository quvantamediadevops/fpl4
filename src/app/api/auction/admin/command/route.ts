import { authorizeMutation } from "@/auction/auth";
import { buildPool } from "@/auction/pool";
import { auctionEnv, runCommand } from "@/auction/server";
import type { AuctionCommand } from "@/auction/types";

const noStore = { "Cache-Control": "no-store" };
const ID = /^[a-z0-9-]{1,120}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Accepts only known command shapes; anything else is rejected before reaching the auction room. */
function parse(body: Record<string, unknown>): AuctionCommand | null {
  switch (body.type) {
    case "start":
    case "pause":
    case "resume":
    case "complete":
      return { type: body.type };
    case "select":
    case "unsold":
      return typeof body.playerId === "string" && ID.test(body.playerId) ? { type: body.type, playerId: body.playerId } : null;
    case "sell":
      return typeof body.playerId === "string" &&
        ID.test(body.playerId) &&
        typeof body.teamId === "string" &&
        ID.test(body.teamId) &&
        typeof body.price === "number" &&
        Number.isFinite(body.price) &&
        typeof body.idempotencyKey === "string"
        ? { type: "sell", playerId: body.playerId, teamId: body.teamId, price: body.price, idempotencyKey: body.idempotencyKey }
        : null;
    case "correct":
      return typeof body.saleId === "string" &&
        UUID.test(body.saleId) &&
        typeof body.teamId === "string" &&
        ID.test(body.teamId) &&
        typeof body.price === "number" &&
        Number.isFinite(body.price) &&
        typeof body.reason === "string" &&
        typeof body.idempotencyKey === "string"
        ? { type: "correct", saleId: body.saleId, teamId: body.teamId, price: body.price, reason: body.reason.slice(0, 1000), idempotencyKey: body.idempotencyKey }
        : null;
    case "undo":
      return typeof body.saleId === "string" && UUID.test(body.saleId) && typeof body.reason === "string" && typeof body.idempotencyKey === "string"
        ? { type: "undo", saleId: body.saleId, reason: body.reason.slice(0, 1000), idempotencyKey: body.idempotencyKey }
        : null;
    case "reopen":
      return typeof body.playerId === "string" && ID.test(body.playerId) && typeof body.reason === "string" && typeof body.idempotencyKey === "string"
        ? { type: "reopen", playerId: body.playerId, reason: body.reason.slice(0, 1000), idempotencyKey: body.idempotencyKey }
        : null;
    default:
      return null;
  }
}

export async function POST(request: Request) {
  const env = auctionEnv();
  if (!env) return Response.json({ ok: false, code: "NOT_CONFIGURED", message: "Auction is not configured." }, { status: 503, headers: noStore });

  const auth = await authorizeMutation(env, request);
  if (!auth.ok) return Response.json({ ok: false, code: "UNAUTHORIZED", message: auth.message }, { status: auth.status, headers: noStore });

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "Invalid request." }, { status: 400, headers: noStore });
  }

  let command: AuctionCommand | null;
  if (body.type === "loadPool") {
    const built = await buildPool();
    if (!built.ok) return Response.json({ ok: false, code: "POOL_UNAVAILABLE", message: built.message }, { status: 503, headers: noStore });
    command = { type: "loadPool", pool: built.pool };
  } else {
    command = parse(body);
  }
  if (!command) return Response.json({ ok: false, code: "BAD_REQUEST", message: "Invalid auction action." }, { status: 400, headers: noStore });

  const result = await runCommand(env, auth.session.adminId, command);
  return Response.json(result, { status: result.ok ? 200 : 409, headers: noStore });
}
