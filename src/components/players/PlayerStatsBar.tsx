import { Layers, Target, Users, Zap, type LucideIcon } from "lucide-react";
import type { PlayerStats } from "@/types/player";
import { cn } from "@/lib/utils";

const tones = {
  gold: "bg-gold/15 text-gold-deep",
  bat: "bg-bat/10 text-bat",
  bowl: "bg-bowl/10 text-bowl-deep",
  ar: "bg-ar/10 text-ar",
} as const;

const accents = { gold: "bg-gold", bat: "bg-bat", bowl: "bg-bowl", ar: "bg-ar" } as const;

function Metric({ icon: Icon, value, label, tone }: { icon: LucideIcon; value: number; label: string; tone: keyof typeof tones }) {
  return (
    <div className="relative flex items-center gap-3 overflow-hidden rounded-2xl border border-line bg-white px-3.5 py-3 shadow-card sm:px-4 sm:py-3.5">
      <span aria-hidden="true" className={cn("absolute inset-y-3 left-0 w-[3px] rounded-r-full min-[400px]:hidden", accents[tone])} />
      <span className={cn("hidden size-9 shrink-0 items-center justify-center rounded-xl min-[400px]:inline-flex sm:size-10", tones[tone])}>
        <Icon className="size-[18px]" strokeWidth={2.1} aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-col">
        <dd className="order-1 text-[22px] leading-none font-black tracking-tight text-ink tabular-nums sm:text-[26px]">{value}</dd>
        <dt className="order-2 mt-1 truncate text-[10px] font-bold tracking-[0.08em] text-muted uppercase sm:text-[11px]">{label}</dt>
      </div>
    </div>
  );
}

/** Counts come from the normalised sheet data on every render. */
export function PlayerStatsBar({ stats }: { stats: PlayerStats }) {
  return (
    <dl className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4" aria-label="Player statistics">
      <Metric icon={Users} value={stats.total} label="Total Players" tone="gold" />
      <Metric icon={Zap} value={stats.batsmen} label="Batsmen" tone="bat" />
      <Metric icon={Target} value={stats.bowlers} label="Bowlers" tone="bowl" />
      <Metric icon={Layers} value={stats.allRounders} label="All Rounders" tone="ar" />
    </dl>
  );
}
