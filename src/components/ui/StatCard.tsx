import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StatCard({
  icon: Icon,
  value,
  label,
  accent = "gold",
  className,
}: {
  icon: LucideIcon;
  value: number;
  label: string;
  accent?: "gold" | "bat" | "bowl" | "ar";
  className?: string;
}) {
  const tone = {
    gold: "text-gold-deep bg-gold-light/30",
    bat: "text-bat bg-bat/8",
    bowl: "text-bowl-deep bg-bowl/8",
    ar: "text-ar bg-ar/8",
  }[accent];
  return (
    <div className={cn("relative rounded-2xl border border-line bg-white p-3.5 shadow-card sm:p-5", className)}>
      <span className={cn("inline-flex size-8 items-center justify-center rounded-lg sm:size-10 sm:rounded-xl", tone)}>
        <Icon className="size-4 sm:size-5" strokeWidth={2} aria-hidden="true" />
      </span>
      <p className="mt-3 text-2xl font-extrabold tracking-tight tabular-nums sm:mt-4 sm:text-4xl">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold tracking-[0.06em] text-muted uppercase sm:text-xs">{label}</p>
      <span aria-hidden="true" className="absolute top-0 left-4 h-0.5 w-8 rounded-b-full bg-gold/70 sm:left-5" />
    </div>
  );
}
