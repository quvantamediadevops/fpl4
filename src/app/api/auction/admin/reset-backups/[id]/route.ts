import { getAdminSession, isSuperAdmin } from "@/auction/auth";
import { BACKUP_ID } from "@/auction/reset";
import { auctionEnv, fetchResetBackup } from "@/auction/server";

/** Download a reset backup (JSON). Super-admin session only; never cached, never public. */
export async function GET(_request: Request, { params }: RouteContext<"/api/auction/admin/reset-backups/[id]">) {
  const env = auctionEnv();
  if (!env) return new Response("Auction is not configured.", { status: 503 });
  const session = await getAdminSession(env);
  if (!session) return new Response("Sign in required.", { status: 401 });
  if (!isSuperAdmin(session.adminId)) return new Response("Super-admin only.", { status: 403 });
  const { id } = await params;
  if (!BACKUP_ID.test(id)) return new Response("Not found.", { status: 404 });
  const text = await fetchResetBackup(env, id);
  if (text === null) return new Response("Not found.", { status: 404 });
  return new Response(text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="fpl-auction-${id}.json"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
