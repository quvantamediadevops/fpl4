"use client";

import { AnimatePresence, m } from "motion/react";
import { AlertTriangle, Check, CheckCircle2, Download, Loader2, ShieldAlert, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { RESET_ACKNOWLEDGEMENT, RESET_PHRASE, type ResetBackupInfo, type ResetInfo, type ResetOutcome } from "@/auction/reset";
import type { AuctionSnapshot, CommandResult } from "@/auction/types";
import { useDialog } from "@/components/presentation/shared";
import { cn } from "@/lib/utils";
import { inr } from "./bits";

const kb = (n: number) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
const when = (iso: string) => new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "medium" });

function EnvBadge({ env }: { env: ResetInfo["environment"] }) {
  return env === "PRODUCTION" ? (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-red-400/60 bg-red-500/20 px-2.5 py-0.5 text-[10px] font-black tracking-[0.2em] text-red-100">
      <span className="size-1.5 animate-pulse rounded-full bg-red-400" aria-hidden="true" /> PRODUCTION DATABASE
    </span>
  ) : (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-300/50 bg-sky-400/15 px-2.5 py-0.5 text-[10px] font-black tracking-[0.2em] text-sky-100">LOCAL PREVIEW DATABASE</span>
  );
}

/** Super-admin only (the page never renders it for other accounts, and the server refuses them anyway). */
export function DangerZone({ info, s, csrf, onApply }: { info: ResetInfo; s: AuctionSnapshot; csrf: string; onApply: (snapshot: AuctionSnapshot) => void }) {
  const [open, setOpen] = useState(false);
  const [state, setState] = useState(info);
  const latest = state.backups[0];
  return (
    <section id="danger-zone" aria-labelledby="danger-heading" className="mt-12 rounded-2xl border-2 border-red-500/50 bg-[linear-gradient(180deg,rgb(70_10_16/0.55),rgb(28_4_8/0.65))] p-5 shadow-[0_30px_80px_-40px_rgb(239_68_68/0.6)]">
      <div className="flex items-start gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl border border-red-400/50 bg-red-500/20 text-red-200">
          <AlertTriangle className="size-6" aria-hidden="true" />
        </span>
        <div>
          <h2 id="danger-heading" className="text-sm font-black tracking-[0.32em] text-red-300">DANGER ZONE</h2>
          <p className="mt-1 text-sm text-red-100/80">Destructive administrative actions. These operations cannot be undone.</p>
        </div>
      </div>

      <div className="mt-4 grid gap-4 rounded-xl border border-red-500/25 bg-black/30 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <h3 className="text-base font-black tracking-wide text-white">Hard reset auction</h3>
          <p className="mt-1 text-sm text-white/65">
            Erases every sale, correction and audit event, returns all players to AVAILABLE and the auction to NOT STARTED. Teams, owners, logos, ICONs, the
            player pool, admin accounts and configuration are kept. A verified backup is taken first; if it fails, nothing is reset.
          </p>
          <dl className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-xs text-white/55">
            <div className="flex items-center gap-2">
              <dt className="sr-only">Database</dt>
              <dd className="flex items-center gap-2">
                <EnvBadge env={state.environment} /> <code className="text-white/70">{state.database}</code>
              </dd>
            </div>
            <div>
              <dt className="inline">Last reset: </dt>
              <dd className="inline text-white/75">{state.lastReset ? `${when(state.lastReset.at)} by ${state.lastReset.adminId}` : "never"}</dd>
            </div>
            {latest && (
              <div>
                <dt className="inline">Latest backup: </dt>
                <dd className="inline">
                  <a className="text-white/75 underline decoration-white/30 underline-offset-2 hover:text-white" href={`/api/auction/admin/reset-backups/${latest.id}`}>
                    {latest.id}
                  </a>{" "}
                  ({kb(latest.bytes)})
                </dd>
              </div>
            )}
          </dl>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black tracking-[0.16em] text-white shadow-[0_10px_30px_-10px_rgb(239_68_68/0.9)] transition-colors hover:bg-red-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-300"
        >
          <AlertTriangle className="size-4" aria-hidden="true" /> HARD RESET AUCTION
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <ResetDialog
            info={state}
            s={s}
            csrf={csrf}
            onClose={() => setOpen(false)}
            onDone={(outcome, snapshot) => {
              onApply(snapshot);
              setState((st) => ({
                ...st,
                lastReset: { at: outcome.completedAt, adminId: "you", requestId: outcome.requestId, backupRef: outcome.backup.id },
                backups: [{ id: outcome.backup.id, createdAt: outcome.backup.createdAt, bytes: outcome.backup.bytes, sha256: outcome.backup.sha256 }, ...st.backups].slice(0, 5),
              }));
            }}
          />
        )}
      </AnimatePresence>
    </section>
  );
}

type Stage = "intro" | "confirm" | "running" | "done" | "error";

function ResetDialog({
  info,
  s,
  csrf,
  onClose,
  onDone,
}: {
  info: ResetInfo;
  s: AuctionSnapshot;
  csrf: string;
  onClose: () => void;
  onDone: (outcome: ResetOutcome, snapshot: AuctionSnapshot) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [stage, setStage] = useState<Stage>("intro");
  const [ack, setAck] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [result, setResult] = useState<{ outcome: ResetOutcome; snapshot: AuctionSnapshot } | null>(null);
  const [error, setError] = useState<{ message: string; backup?: ResetBackupInfo } | null>(null);
  const sending = useRef(false);
  const busy = stage === "running";
  useDialog(ref, () => {
    if (!busy) onClose();
  });
  // Each step replaces the focused button; move focus into the new step so Escape and Tab keep working.
  // Stage 1 lands on CANCEL, the safe default.
  useEffect(() => {
    const el = ref.current;
    if (stage !== "running") (el?.querySelector<HTMLElement>("[data-autofocus]") ?? el)?.focus({ preventScroll: true });
  }, [stage]);

  const exact = phrase === RESET_PHRASE;
  const ready = ack && exact && !busy;
  const icons = s.teams.filter((t) => t.icon).length;

  async function submit() {
    if (!ready || sending.current) return;
    sending.current = true;
    setStage("running");
    setError(null);
    try {
      const res = await fetch("/api/auction/admin/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrf },
        body: JSON.stringify({ requestId, phrase, acknowledged: ack }),
      });
      const data = (await res.json().catch(() => null)) as CommandResult | null;
      if (data?.ok && data.reset) {
        setResult({ outcome: data.reset, snapshot: data.snapshot });
        onDone(data.reset, data.snapshot);
        setStage("done");
      } else {
        setError({ message: data && !data.ok ? data.message : `The reset request failed (HTTP ${res.status}).`, backup: data && !data.ok ? data.backup : undefined });
        setStage("error");
      }
    } catch {
      setError({ message: "Network error: the result is unknown. Reload the control room and check the auction state before trying again." });
      setStage("error");
    } finally {
      sending.current = false;
    }
  }

  return (
    <m.div
      className="fixed inset-0 z-[80] grid place-items-center overflow-y-auto bg-black/80 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <m.div
        ref={ref}
        role="alertdialog"
        aria-modal="true"
        aria-label={stage === "done" ? "Auction reset successful" : "Hard reset auction"}
        tabIndex={-1}
        className={cn(
          "my-auto w-full max-w-2xl rounded-3xl border-2 bg-[#0b0608] p-6 text-white shadow-[0_40px_140px_-20px_rgb(0_0_0/0.95)] outline-none",
          stage === "done" ? "border-emerald-400/60" : "border-red-500/60",
        )}
        initial={{ y: 14, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        {stage === "intro" && (
          <>
            <div className="flex items-start gap-3">
              <ShieldAlert className="mt-0.5 size-7 shrink-0 text-red-400" aria-hidden="true" />
              <div>
                <h2 className="text-xl font-black tracking-[0.08em] text-red-200 sm:text-2xl">RESET THE ENTIRE AUCTION?</h2>
                <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/65">
                  Target: <EnvBadge env={info.environment} /> <code className="text-white/75">{info.database}</code>
                </p>
              </div>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <List
                tone="bad"
                title="WILL BE ERASED"
                items={[
                  "All auction sales",
                  "All sale correction records (authorised reset)",
                  "All auction events and history",
                  "Players return to AVAILABLE",
                  `Team budgets return to ${inr(s.rules.teamBudget)}`,
                  `Purchase counts return to 0/${s.rules.playersPerTeam}`,
                  "Current player selection is cleared",
                  "Auction status returns to NOT STARTED",
                  "All presentation screens show the fresh auction",
                ]}
              />
              <List
                tone="good"
                title="WILL BE KEPT"
                items={[
                  "Database tables and schema",
                  "Applied migration history",
                  "Admin accounts and passwords",
                  "Admin session secret",
                  "Google Sheets configuration and player master data",
                  "Player photos and Google Drive configuration",
                  "Team names, owners, logos and ICON assignments",
                  "Application configuration and environment variables",
                ]}
              />
            </div>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <p className="text-[11px] font-extrabold tracking-[0.2em] text-white/50">STATE AFTER RESET</p>
              <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-bold">
                {[
                  `${s.teams.length} teams`,
                  `${inr(s.rules.teamBudget)} per team`,
                  `${s.rules.playersPerTeam} auction purchases per team`,
                  `${icons} ICONs pre-assigned`,
                  `${s.counts.pool} players available`,
                  "No active sales",
                  "No correction history",
                  "NOT STARTED",
                ].map((t) => (
                  <span key={t} className="rounded-full bg-white/[0.07] px-2.5 py-1 text-white/80">
                    {t}
                  </span>
                ))}
              </p>
            </div>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose} data-autofocus>
                CANCEL
              </button>
              <button type="button" className="inline-flex h-10 items-center gap-2 rounded-xl border border-red-400/70 px-4 text-sm font-black tracking-wide text-red-100 hover:bg-red-500/15" onClick={() => setStage("confirm")}>
                CONTINUE TO FINAL CONFIRMATION
              </button>
            </div>
          </>
        )}

        {(stage === "confirm" || stage === "running") && (
          <>
            <h2 className="text-lg font-black tracking-[0.12em] text-red-200">FINAL CONFIRMATION</h2>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-white/65">
              Resetting <EnvBadge env={info.environment} /> <code className="text-white/75">{info.database}</code>
            </p>

            <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-xl border border-white/10 bg-white/[0.04] p-3">
              <input type="checkbox" checked={ack} disabled={busy} onChange={(e) => setAck(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-red-500" data-autofocus />
              <span className="text-sm font-semibold text-white/90">{RESET_ACKNOWLEDGEMENT}</span>
            </label>

            <label htmlFor="reset-phrase" className="mt-4 block text-sm text-white/70">
              Type <b className="font-mono tracking-wide text-white select-none">{RESET_PHRASE}</b> to confirm (exactly, in capitals):
            </label>
            <input
              id="reset-phrase"
              name={`confirm-${requestId.slice(0, 8)}`}
              value={phrase}
              disabled={busy}
              onChange={(e) => setPhrase(e.target.value)}
              onPaste={(e) => e.preventDefault()}
              onDrop={(e) => e.preventDefault()}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck={false}
              data-1p-ignore
              data-lpignore="true"
              aria-describedby="reset-phrase-state"
              className={cn(
                "mt-2 h-12 w-full rounded-xl border bg-black/40 px-4 font-mono text-base tracking-wide outline-none",
                phrase.length === 0 ? "border-white/15 focus:border-red-400" : exact ? "border-emerald-400/70" : "border-red-500/70",
              )}
            />
            <p id="reset-phrase-state" className={cn("mt-1.5 text-xs font-semibold", exact ? "text-emerald-300" : "text-white/45")}>
              {exact ? "Phrase matches." : "Type the phrase by hand; pasting is disabled."}
            </p>

            <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl border border-red-500/50 bg-red-500/15 p-3 text-sm font-semibold text-red-100">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
              This permanently erases every auction transaction on the {info.environment === "PRODUCTION" ? "PRODUCTION" : "local preview"} database. A backup is
              created and verified first; if that fails, nothing is reset.
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button type="button" className="btn-ghost" disabled={busy} onClick={() => setStage("intro")}>
                BACK
              </button>
              <button
                type="button"
                disabled={!ready}
                onClick={submit}
                className="inline-flex h-11 items-center gap-2 rounded-xl bg-red-600 px-5 text-sm font-black tracking-[0.14em] text-white transition-colors enabled:hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <AlertTriangle className="size-4" aria-hidden="true" />}
                {busy ? "BACKING UP AND RESETTING…" : "PERMANENTLY RESET AUCTION"}
              </button>
            </div>
            {busy && <p className="mt-3 text-right text-xs text-white/50">Do not close this window. Every other auction action is paused until the reset finishes.</p>}
          </>
        )}

        {stage === "error" && error && (
          <>
            <h2 className="flex items-center gap-2 text-lg font-black tracking-[0.1em] text-red-200">
              <X className="size-5" aria-hidden="true" /> RESET NOT COMPLETED
            </h2>
            <p className="mt-3 text-sm text-white/85">{error.message}</p>
            {error.backup && (
              <p className="mt-3 text-xs text-white/60">
                Backup kept: <code>{error.backup.id}</code> ({kb(error.backup.bytes)}, SHA-256 {error.backup.sha256.slice(0, 12)}…)
              </p>
            )}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button type="button" className="btn-ghost" onClick={onClose} data-autofocus>
                RETURN TO AUCTION CONTROL ROOM
              </button>
              <button
                type="button"
                className="inline-flex h-10 items-center rounded-xl border border-red-400/70 px-4 text-sm font-black text-red-100 hover:bg-red-500/15"
                onClick={() => {
                  setRequestId(crypto.randomUUID());
                  setPhrase("");
                  setAck(false);
                  setStage("confirm");
                }}
              >
                TRY AGAIN
              </button>
            </div>
          </>
        )}

        {stage === "done" && result && <Success outcome={result.outcome} snapshot={result.snapshot} onClose={onClose} />}
      </m.div>
    </m.div>
  );
}

function List({ tone, title, items }: { tone: "good" | "bad"; title: string; items: string[] }) {
  const Icon = tone === "good" ? Check : X;
  return (
    <div className={cn("rounded-xl border p-3", tone === "good" ? "border-emerald-400/25 bg-emerald-500/[0.06]" : "border-red-500/30 bg-red-500/[0.07]")}>
      <p className={cn("text-[11px] font-extrabold tracking-[0.2em]", tone === "good" ? "text-emerald-300" : "text-red-300")}>{title}</p>
      <ul className="mt-2 space-y-1.5">
        {items.map((t) => (
          <li key={t} className="flex items-start gap-2 text-[13px] text-white/85">
            <Icon className={cn("mt-0.5 size-3.5 shrink-0", tone === "good" ? "text-emerald-300" : "text-red-300")} aria-hidden="true" />
            {t}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Success({ outcome, snapshot, onClose }: { outcome: ResetOutcome; snapshot: AuctionSnapshot; onClose: () => void }) {
  const icons = snapshot.teams.filter((t) => t.icon).length;
  const b = outcome.backup;
  const stats: [string, string][] = [
    [String(snapshot.teams.length), "Teams ready"],
    [String(snapshot.counts.available), "Auction players available"],
    [String(icons), "ICONs assigned"],
    [inr(snapshot.rules.teamBudget), "Budget per team"],
    [`0/${snapshot.rules.playersPerTeam}`, "Purchases"],
    [snapshot.status.replace("_", " "), "Status"],
  ];
  return (
    <div className="text-center">
      <CheckCircle2 className="mx-auto size-14 text-emerald-300" aria-hidden="true" />
      <h2 className="mt-3 text-2xl font-black tracking-[0.12em] text-emerald-200">AUCTION RESET SUCCESSFUL</h2>
      <p className="mt-1 text-sm text-white/70">FPL Season 4 is ready for a fresh auction.</p>
      <dl className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3">
        {stats.map(([v, l]) => (
          <div key={l} className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5">
            <dd className="text-xl font-black tabular-nums">{v}</dd>
            <dt className="text-[10px] font-extrabold tracking-[0.18em] text-white/50 uppercase">{l}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-5 rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] p-3 text-left text-xs text-white/75">
        <p className="font-extrabold tracking-[0.16em] text-emerald-300">BACKUP VERIFIED BEFORE RESET</p>
        <p className="mt-1.5 break-all">
          <code>{b.id}</code> · {kb(b.bytes)} · SHA-256 {b.sha256.slice(0, 16)}… · {b.environment} · {b.database} · {when(b.createdAt)}
        </p>
        <p className="mt-1 text-white/55">
          Saved: {Object.entries(b.rows).map(([t, n]) => `${t.replace("auction_", "")} ${n}`).join(" · ")}
        </p>
        {b.environment === "PRODUCTION" && <p className="mt-1 text-white/55">Point-in-time restore is also available with D1 Time Travel to {b.restorePoint}.</p>}
        <a href={`/api/auction/admin/reset-backups/${b.id}`} className="mt-2 inline-flex items-center gap-1.5 font-bold text-emerald-200 underline underline-offset-2">
          <Download className="size-3.5" aria-hidden="true" /> Download backup (JSON)
        </a>
      </div>
      <button type="button" onClick={onClose} className="btn-gold mt-6 w-full justify-center sm:w-auto" data-autofocus>
        RETURN TO AUCTION CONTROL ROOM
      </button>
    </div>
  );
}
