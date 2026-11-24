"use client";

import { m } from "motion/react";
import { ArrowRight, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { checkCorrection, correctionAction, correctionLedger, describeRejection, teamPosition, REASON_MIN, validReason } from "@/auction/rules";
import type { AuctionPlayerView, AuctionSnapshot, AuctionTeamView, CommandResult } from "@/auction/types";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import { useDialog } from "@/components/presentation/shared";
import { cn } from "@/lib/utils";
import { TeamLogo, inr, roleText } from "./bits";

const ACTION_LABEL = { CHANGE_PRICE: "Correct Price", CHANGE_TEAM: "Change Team", CHANGE_PRICE_TEAM: "Correct Price & Team" } as const;

export interface CorrectableSale {
  saleId: string;
  playerId: string;
  teamId: string;
  price: number;
  at: string;
}

type Step = { kind: "edit" } | { kind: "confirm"; mode: "correct" | "undo" };

/**
 * Correct a live sale: change price, team or both (the original sale is reversed and a
 * replacement recorded in one transaction), or undo it (player becomes UNSOLD).
 * Two steps: edit, then an explicit confirmation. One request key per dialog, so a
 * double-click or retry can never apply the same correction twice.
 */
export function CorrectionDialog({
  s,
  sale,
  player,
  teams,
  busy,
  onSubmit,
  onClose,
}: {
  s: AuctionSnapshot;
  sale: CorrectableSale;
  player: AuctionPlayerView | undefined;
  teams: Map<string, AuctionTeamView>;
  busy: boolean;
  onSubmit: (body: Record<string, unknown>, success: string) => Promise<CommandResult | null>;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, () => {
    if (!busy) onClose();
  });
  const [teamId, setTeamId] = useState(sale.teamId);
  const [price, setPrice] = useState<number>(sale.price);
  const [reason, setReason] = useState("");
  const [step, setStep] = useState<Step>({ kind: "edit" });
  const [error, setError] = useState<string | null>(null);
  const keys = useRef({ correct: crypto.randomUUID(), undo: crypto.randomUUID() });
  const submitting = useRef(false);

  const original = teams.get(sale.teamId);
  const target = teams.get(teamId) ?? null;
  const name = player?.name ?? sale.playerId;

  const check = useMemo(() => {
    const input = {
      rules: s.rules,
      status: s.status,
      sale: { teamId: sale.teamId, price: sale.price, active: true },
      target: target ? { id: target.id, initialBudget: target.initialBudget, spent: target.spent, purchased: target.purchased } : null,
      price,
    };
    const rejection = checkCorrection(input);
    const ledger = correctionLedger(input);
    const pos = ledger ? teamPosition(s.rules, ledger) : null;
    return { rejection, pos, message: rejection ? describeRejection(rejection, s.rules, pos ?? undefined) : null };
  }, [s.rules, s.status, sale, target, price]);

  const action = correctionAction({ teamId: sale.teamId, price: sale.price }, { teamId, price });
  const reasonOk = validReason(reason);

  // Budgets after the correction (display only; the server recalculates from live sales).
  const fromAfter = original ? original.remaining + sale.price - (teamId === sale.teamId ? price : 0) : 0;
  const toAfter = target && teamId !== sale.teamId ? target.remaining - price : null;

  async function confirm(mode: "correct" | "undo") {
    if (submitting.current || busy) return;
    submitting.current = true;
    setError(null);
    const body =
      mode === "correct"
        ? { type: "correct", saleId: sale.saleId, teamId, price, reason: reason.trim(), idempotencyKey: keys.current.correct }
        : { type: "undo", saleId: sale.saleId, reason: reason.trim(), idempotencyKey: keys.current.undo };
    const success =
      mode === "correct"
        ? `${ACTION_LABEL[action ?? "CHANGE_PRICE"]}: ${name} → ${target?.name} for ${inr(price)}.`
        : `Sale undone: ${name} is UNSOLD and ${original?.name} got ${inr(sale.price)} and a slot back.`;
    const result = await onSubmit(body, success);
    submitting.current = false;
    if (result?.ok) onClose();
    else {
      setError(result ? result.message : "The request did not complete. Check the history before retrying.");
      setStep({ kind: "edit" });
    }
  }

  return (
    <m.div
      className="fixed inset-0 z-[70] grid place-items-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <m.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="Correct sale"
        tabIndex={-1}
        className="w-full max-w-3xl rounded-3xl border border-gold/30 bg-[#0a1020] p-6 text-white shadow-[0_40px_120px_-20px_rgb(0_0_0/0.9)] outline-none"
        initial={{ y: 12, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="text-sm font-extrabold tracking-[0.24em] text-gold-light">CORRECT SALE</h2>

        {/* Original sale */}
        <div className="mt-4 flex flex-wrap items-center gap-4 rounded-2xl bg-white/[0.04] p-4">
          <span className="relative size-20 shrink-0 overflow-hidden rounded-xl ring-1 ring-gold/50">
            <PlayerPhoto src={player?.photo ?? null} name={name} sizes="80px" stage />
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xl font-black uppercase">{name}</p>
            <p className="text-xs font-bold tracking-[0.18em] text-gold-light">{roleText(player?.role ?? null)}</p>
            <p className="mt-1 text-xs text-white/50">Sold {new Date(sale.at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short", hour12: false })}</p>
          </div>
          {original && (
            <div className="flex items-center gap-3">
              <TeamLogo team={original} className="size-11 text-xs" />
              <div className="text-right">
                <p className="text-sm font-black">{original.name}</p>
                <p className="text-2xl font-black tabular-nums text-gold-light">{inr(sale.price)}</p>
                <p className="text-[11px] text-white/50">Budget now {inr(original.remaining)} · {original.slotsLeft} slots left</p>
              </div>
            </div>
          )}
        </div>

        {step.kind === "edit" ? (
          <>
            <fieldset disabled={busy} className="mt-5">
              <legend className="text-[11px] font-bold tracking-[0.2em] text-white/50">CORRECT WINNING TEAM</legend>
              <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label="Correct winning team">
                {s.teams.map((t) => {
                  const own = t.id === sale.teamId;
                  const full = t.slotsLeft === 0 && !own;
                  const selected = t.id === teamId;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={full}
                      onClick={() => setTeamId(t.id)}
                      className={cn(
                        "flex flex-col items-center gap-1 rounded-xl border px-2 py-2 text-center transition-colors disabled:opacity-35",
                        selected ? "border-gold bg-gold/15" : "border-white/10 bg-white/[0.03] hover:border-gold/50",
                      )}
                    >
                      <TeamLogo team={t} className="size-8 text-[10px]" />
                      <span className="w-full truncate text-xs font-black">{t.name}</span>
                      <span className="text-[10px] font-semibold tabular-nums text-white/55">{own ? "ORIGINAL" : full ? "FULL" : `${inr(t.remaining)} · ${t.slotsLeft} left`}</span>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 grid gap-4 sm:grid-cols-[minmax(0,220px)_minmax(0,1fr)]">
                <div>
                  <label htmlFor="correct-price" className="block text-[11px] font-bold tracking-[0.2em] text-white/50">
                    CORRECT PRICE (₹)
                  </label>
                  <div className="mt-2 flex items-center rounded-xl border border-white/15 bg-white/5 focus-within:border-gold">
                    <span className="pl-3 text-2xl font-black text-gold-light" aria-hidden="true">
                      ₹
                    </span>
                    <input
                      id="correct-price"
                      type="number"
                      inputMode="numeric"
                      min={s.rules.minimumBid}
                      max={s.rules.maximumBid}
                      step={1}
                      value={Number.isFinite(price) ? price : ""}
                      onChange={(e) => setPrice(e.target.value === "" ? Number.NaN : Number(e.target.value))}
                      className="h-12 w-full min-w-0 bg-transparent px-2 text-2xl font-black tabular-nums outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none"
                    />
                  </div>
                  <p className="mt-1 text-[11px] text-white/45">
                    {inr(s.rules.minimumBid)}–{inr(s.rules.maximumBid)}
                    {check.pos?.canBuy ? ` · max for ${target?.name} ${inr(check.pos.maxNextPrice)}` : ""}
                  </p>
                </div>
                <div>
                  <label htmlFor="correct-reason" className="block text-[11px] font-bold tracking-[0.2em] text-white/50">
                    REASON (REQUIRED)
                  </label>
                  <textarea
                    id="correct-reason"
                    data-autofocus
                    value={reason}
                    maxLength={300}
                    onChange={(e) => setReason(e.target.value)}
                    rows={3}
                    className="mt-2 w-full rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm outline-none focus:border-gold"
                    placeholder="e.g. Anchor confirmed ₹1,000, not ₹1,200"
                  />
                </div>
              </div>
            </fieldset>

            <p role="status" className={cn("mt-3 min-h-5 text-sm font-semibold", error || (action && check.rejection) ? "text-red-300" : "text-white/60")}>
              {error ??
                (!action
                  ? "Change the team, the price or both — or undo the sale."
                  : check.rejection
                    ? check.message
                    : !reasonOk
                      ? `Enter a reason (at least ${REASON_MIN} characters).`
                      : `${ACTION_LABEL[action]}: ${original?.name} ${inr(sale.price)} → ${target?.name} ${inr(price)}.`)}
            </p>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
              <button type="button" disabled={busy || !reasonOk} onClick={() => setStep({ kind: "confirm", mode: "undo" })} className="btn-danger h-12">
                <Undo2 className="size-4" aria-hidden="true" /> Undo Sale → Mark UNSOLD
              </button>
              <div className="flex gap-3">
                <button type="button" onClick={onClose} disabled={busy} className="btn-ghost h-12">
                  Cancel
                </button>
                <button type="button" disabled={busy || !action || !!check.rejection || !reasonOk} onClick={() => setStep({ kind: "confirm", mode: "correct" })} className="btn-gold h-12">
                  {action ? ACTION_LABEL[action] : "Correct Sale"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <ConfirmStep
            mode={step.mode}
            busy={busy}
            name={name}
            original={original}
            target={target}
            salePrice={sale.price}
            price={price}
            fromAfter={fromAfter}
            toAfter={toAfter}
            reason={reason.trim()}
            label={step.mode === "correct" && action ? ACTION_LABEL[action] : "Undo Sale → Mark UNSOLD"}
            onBack={() => setStep({ kind: "edit" })}
            onConfirm={() => confirm(step.mode)}
          />
        )}
      </m.div>
    </m.div>
  );
}

function ConfirmStep({
  mode,
  busy,
  name,
  original,
  target,
  salePrice,
  price,
  fromAfter,
  toAfter,
  reason,
  label,
  onBack,
  onConfirm,
}: {
  mode: "correct" | "undo";
  busy: boolean;
  name: string;
  original?: AuctionTeamView;
  target: AuctionTeamView | null;
  salePrice: number;
  price: number;
  fromAfter: number;
  toAfter: number | null;
  reason: string;
  label: string;
  onBack: () => void;
  onConfirm: () => void;
}) {
  return (
    <div className="mt-5">
      <p className="text-base font-semibold">
        {mode === "undo" ? (
          <>
            Undo the sale of <b className="uppercase">{name}</b>? The player becomes <b>UNSOLD</b> and can be sold again later.
          </>
        ) : (
          <>
            Confirm the correction for <b className="uppercase">{name}</b>.
          </>
        )}
      </p>
      <div className="mt-4 grid items-center gap-3 rounded-2xl bg-gold/10 p-4 sm:grid-cols-[1fr_auto_1fr]">
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-white/50">BEFORE</p>
          <p className="text-lg font-black">
            {original?.name} · <span className="tabular-nums">{inr(salePrice)}</span>
          </p>
        </div>
        <ArrowRight className="hidden size-6 text-gold sm:block" aria-hidden="true" />
        <div>
          <p className="text-[10px] font-bold tracking-[0.2em] text-white/50">AFTER</p>
          <p className="text-lg font-black">{mode === "undo" ? "UNSOLD" : `${target?.name} · ${inr(price)}`}</p>
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm text-white/75">
        <li>
          {original?.name} budget: {inr(original?.remaining ?? 0)} → <b>{inr(mode === "undo" ? (original?.remaining ?? 0) + salePrice : fromAfter)}</b>
        </li>
        {mode === "correct" && toAfter !== null && (
          <li>
            {target?.name} budget: {inr(target?.remaining ?? 0)} → <b>{inr(toAfter)}</b>
          </li>
        )}
        <li className="text-white/55">Reason: “{reason}”. The original sale stays in the history, marked as reversed.</li>
      </ul>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={onBack} disabled={busy} className="btn-ghost h-12">
          Back
        </button>
        <button type="button" data-autofocus onClick={onConfirm} disabled={busy} className={cn("h-12", mode === "undo" ? "btn-danger" : "btn-gold")}>
          {busy ? "SAVING…" : `CONFIRM: ${label.toUpperCase()}`}
        </button>
      </div>
    </div>
  );
}
