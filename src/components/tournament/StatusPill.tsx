import type { Status } from "@/lib/tournament";
import { cn } from "@/lib/utils";

const tones: Record<Status["tone"], string> = {
  closed: "bg-mist text-muted ring-line",
  done: "bg-mist text-muted ring-line",
  today: "bg-red-50 text-red-700 ring-red-200",
  upcoming: "bg-gold/15 text-gold-deep ring-gold/35",
};

export function StatusPill({ status, className }: { status: Status; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-bold whitespace-nowrap ring-1 ring-inset",
        tones[status.tone],
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("size-1.5 rounded-full", status.tone === "upcoming" ? "bg-gold" : status.tone === "today" ? "bg-red-500" : "bg-muted/50")}
      />
      {status.label}
    </span>
  );
}
