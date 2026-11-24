import { authorizeMutation, isSuperAdmin } from "@/auction/auth";
import { REQUEST_ID, phraseMatches, resetEnvironment } from "@/auction/reset";
import { auctionEnv, runReset } from "@/auction/server";

const noStore = { "Cache-Control": "no-store" };
const STATUS: Record<string, number> = {
  FORBIDDEN: 403,
  BAD_REQUEST: 400,
  CONFIRMATION_REQUIRED: 400,
  PHRASE_MISMATCH: 400,
  RATE_LIMITED: 429,
  RESET_COOLDOWN: 429,
  BACKUP_FAILED: 500,
  RESET_FAILED: 500,
};

/**
 * HARD RESET of the auction. POST only (any other method gets 405 from Next).
 * Session + same Origin + CSRF token, super-admin, exact typed phrase and acknowledgement,
 * a unique request id. The auction server re-checks all of it before touching anything.
 */
export async function POST(request: Request) {
  const env = auctionEnv();
  if (!env) return Response.json({ ok: false, code: "NOT_CONFIGURED", message: "Auction is not configured." }, { status: 503, headers: noStore });

  const auth = await authorizeMutation(env, request);
  if (!auth.ok) return Response.json({ ok: false, code: "UNAUTHORIZED", message: auth.message }, { status: auth.status, headers: noStore });
  if (!isSuperAdmin(auth.session.adminId)) {
    console.warn(`[auction] reset refused: ${auth.session.adminId} is not a super-admin`);
    return Response.json({ ok: false, code: "FORBIDDEN", message: "Only a super-admin can reset the auction." }, { status: 403, headers: noStore });
  }

  let body: { requestId?: unknown; phrase?: unknown; acknowledged?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "Invalid request." }, { status: 400, headers: noStore });
  }
  if (body.acknowledged !== true) return Response.json({ ok: false, code: "CONFIRMATION_REQUIRED", message: "Tick the confirmation box first." }, { status: 400, headers: noStore });
  if (!phraseMatches(body.phrase)) return Response.json({ ok: false, code: "PHRASE_MISMATCH", message: "The confirmation phrase does not match exactly." }, { status: 400, headers: noStore });
  if (typeof body.requestId !== "string" || !REQUEST_ID.test(body.requestId)) {
    return Response.json({ ok: false, code: "BAD_REQUEST", message: "Invalid reset request." }, { status: 400, headers: noStore });
  }

  const result = await runReset(env, auth.session.adminId, {
    requestId: body.requestId,
    phrase: body.phrase as string,
    acknowledged: true,
    environment: resetEnvironment(request.url),
  });
  const status = result.ok ? 200 : (STATUS[result.code] ?? 409);
  return Response.json(result, { status, headers: noStore });
}
