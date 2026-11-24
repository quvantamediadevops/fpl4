import type { Metadata } from "next";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { getAdminSession } from "@/auction/auth";
import { CORRECTION_LABEL, SALE_STATE_LABEL, saleHistory } from "@/auction/history";
import { formatInr, roleLabel } from "@/auction/report";
import { auctionEnv, fetchAdminDetail, fetchSnapshot } from "@/auction/server";
import { PrintButton } from "@/components/auction/PrintButton";

export const metadata: Metadata = { title: "Auction Report", robots: { index: false, follow: false } };

export default async function AuctionReportPage() {
  await connection(); // always rendered per request: live data and the admin session
  const env = auctionEnv();
  if (!env || !(await getAdminSession(env).catch(() => null))) redirect("/auction/admin");
  const [s, detail] = await Promise.all([fetchSnapshot(env), fetchAdminDetail(env)]);
  const history = saleHistory(detail).slice().reverse();
  const playerName = (id: string) => s.players.find((p) => p.id === id)?.name ?? id;
  const teamName = (id: string | null) => (id ? s.teams.find((t) => t.id === id)?.name ?? id : "");
  const unsold = s.players.filter((p) => p.status !== "SOLD");

  return (
    <div data-standalone className="min-h-dvh bg-white px-6 py-8 text-ink print:p-0">
      <header className="mx-auto flex max-w-5xl items-end justify-between gap-4 border-b-2 border-ink pb-4">
        <div>
          <p className="text-xs font-bold tracking-[0.2em] text-muted">FERTILIZER PREMIER LEAGUE · SEASON 4</p>
          <h1 className="mt-1 text-3xl font-black">Auction report {s.status === "COMPLETED" ? "" : "(provisional)"}</h1>
          <p className="mt-1 text-sm text-muted">
            {s.status === "COMPLETED" ? "Final" : `Status: ${s.status}`} · generated {new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST · total expenditure {formatInr(s.counts.spent)}
          </p>
        </div>
        <PrintButton />
      </header>

      <main className="mx-auto mt-6 grid max-w-5xl gap-6 md:grid-cols-2 print:grid-cols-2">
        {s.teams.map((t) => (
          <section key={t.id} className="break-inside-avoid rounded-xl border border-line p-4">
            <h2 className="flex items-baseline justify-between text-lg font-black">
              {t.name}
              <span className="text-sm font-semibold text-muted">Owner {t.owner}</span>
            </h2>
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-line text-left text-[11px] tracking-wider text-muted">
                  <th className="py-1 pr-2">#</th>
                  <th className="py-1 pr-2">Player</th>
                  <th className="py-1 pr-2">Type</th>
                  <th className="py-1 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-line/60">
                  <td className="py-1 pr-2 font-bold">ICON</td>
                  <td className="py-1 pr-2 font-semibold">{t.icon?.name ?? "—"}</td>
                  <td className="py-1 pr-2 text-muted">Pre-assigned</td>
                  <td className="py-1 text-right text-muted">—</td>
                </tr>
                {t.players.map((p, i) => (
                  <tr key={p.playerId} className="border-b border-line/60">
                    <td className="py-1 pr-2 tabular-nums">{i + 1}</td>
                    <td className="py-1 pr-2 font-semibold uppercase">{p.name}</td>
                    <td className="py-1 pr-2">{roleLabel(p.role)}</td>
                    <td className="py-1 text-right tabular-nums">{formatInr(p.price)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="text-sm font-bold">
                <tr>
                  <td colSpan={3} className="pt-2">
                    Squad {t.purchased + (t.icon ? 1 : 0)} / {s.rules.playersPerTeam + 1} · Spent
                  </td>
                  <td className="pt-2 text-right tabular-nums">{formatInr(t.spent)}</td>
                </tr>
                <tr>
                  <td colSpan={3}>Remaining of {formatInr(t.initialBudget)}</td>
                  <td className="text-right tabular-nums">{formatInr(t.remaining)}</td>
                </tr>
              </tfoot>
            </table>
          </section>
        ))}
      </main>

      <section className="mx-auto mt-8 max-w-5xl">
        <h2 className="text-lg font-black">Sale history {history.length ? `(${history.length})` : ""}</h2>
        <p className="text-sm text-muted">Every sale ever recorded, oldest first. Reversed sales stay on record; a corrected sale replaces the reversed one.</p>
        {history.length ? (
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[11px] tracking-wider text-muted">
                <th className="py-1 pr-2">Time (IST)</th>
                <th className="py-1 pr-2">Player</th>
                <th className="py-1 pr-2">Team</th>
                <th className="py-1 pr-2 text-right">Price</th>
                <th className="py-1 pr-2">Kind</th>
                <th className="py-1">Status / correction</th>
              </tr>
            </thead>
            <tbody>
              {history.map((h) => (
                <tr key={h.saleId} className={`border-b border-line/60 align-top ${h.reversedAt ? "text-muted" : ""}`}>
                  <td className="py-1 pr-2 tabular-nums">{new Date(h.at).toLocaleTimeString("en-IN", { timeZone: "Asia/Kolkata", hour12: false })}</td>
                  <td className="py-1 pr-2 font-semibold uppercase">{playerName(h.playerId)}</td>
                  <td className="py-1 pr-2">{teamName(h.teamId)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatInr(h.price)}</td>
                  <td className="py-1 pr-2">{h.origin === "CORRECTION" ? "Corrected sale" : "Original sale"}</td>
                  <td className="py-1">
                    <b>{SALE_STATE_LABEL[h.state]}</b>
                    {h.endedBy && (
                      <span className="block text-xs">
                        {CORRECTION_LABEL[h.endedBy.action]}
                        {h.endedBy.toTeamId ? ` → ${teamName(h.endedBy.toTeamId)} ${formatInr(h.endedBy.toPrice ?? 0)}` : ""} · {h.endedBy.adminId}: “{h.endedBy.reason}”
                      </span>
                    )}
                    {!h.endedBy && h.reversedAt && <span className="block text-xs">{h.reversedBy}: “{h.reversalReason}”</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="mt-1 text-sm text-muted">No sales yet.</p>
        )}
      </section>

      <section className="mx-auto mt-6 max-w-5xl break-inside-avoid">
        <h2 className="text-lg font-black">Not sold {unsold.length ? `(${unsold.length})` : ""}</h2>
        {unsold.length ? (
          <ul className="mt-2 columns-2 text-sm">
            {unsold.map((p) => (
              <li key={p.id} className="uppercase">
                {p.name} <span className="normal-case text-muted">· {roleLabel(p.role)} · {p.status}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-sm text-muted">Every player in the pool was sold.</p>
        )}
      </section>
    </div>
  );
}
