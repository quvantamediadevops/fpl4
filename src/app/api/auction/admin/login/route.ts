import { adminLoginConfigured, login, sameOrigin } from "@/auction/auth";
import { auctionEnv } from "@/auction/server";

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  const env = auctionEnv();
  if (!env || !adminLoginConfigured()) return Response.json({ message: "Admin login is not configured." }, { status: 503, headers: noStore });
  if (!sameOrigin(request)) return Response.json({ message: "Request blocked: wrong origin." }, { status: 403, headers: noStore });

  let body: { name?: unknown; password?: unknown };
  try {
    body = await request.json();
  } catch {
    return Response.json({ message: "Invalid request." }, { status: 400, headers: noStore });
  }
  const name = typeof body.name === "string" ? body.name.slice(0, 64) : "";
  const password = typeof body.password === "string" ? body.password.slice(0, 256) : "";

  const result = await login(env, request, name, password);
  return result.ok ? Response.json({ ok: true }, { headers: noStore }) : Response.json({ message: result.message }, { status: result.status, headers: noStore });
}
