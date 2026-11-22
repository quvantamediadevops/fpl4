import { CalendarClock, Gavel, Swords, UserPlus, Users, type LucideIcon } from "lucide-react";
import { dayParts, deadlineStatus, eventStatus, formatDate, formatTime, keyDates } from "@/lib/tournament";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/tournament/StatusPill";
import { SectionHeading } from "@/components/tournament/SectionHeading";

const icons: Record<string, LucideIcon> = {
  "team-deadline": Users,
  "player-deadline": UserPlus,
  auction: Gavel,
  "match-start": Swords,
};

export function KeyDates({ now }: { now: Date }) {
  return (
    <section aria-labelledby="dates-title">
      <SectionHeading id="dates-title" eyebrow="Schedule" title="Important dates" />
      <ol className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-4">
        {keyDates().map((item) => {
          const status = item.kind === "deadline" ? deadlineStatus(item.date, now) : eventStatus(item.date, now);
          const past = status.tone === "closed" || status.tone === "done";
          const { day, month, weekday } = dayParts(item.date);
          const Icon = icons[item.id] ?? CalendarClock;
          return (
            <li
              key={item.id}
              className={cn(
                "relative flex items-center gap-4 rounded-2xl border bg-white p-3.5 shadow-card sm:flex-col sm:items-start sm:gap-3 sm:p-5",
                item.id === "match-start" ? "border-gold/50" : "border-line",
              )}
            >
              <div
                className={cn(
                  "flex w-16 shrink-0 flex-col items-center rounded-xl py-2 sm:w-auto sm:flex-row sm:items-baseline sm:gap-2 sm:bg-transparent sm:py-0",
                  past ? "bg-mist text-muted" : "bg-ink text-white sm:text-ink",
                )}
              >
                <span className="text-2xl leading-none font-black tabular-nums sm:text-4xl">{day}</span>
                <span className={cn("mt-1 text-[11px] font-bold tracking-[0.12em] sm:mt-0 sm:text-sm", past ? "" : "text-gold sm:text-gold-deep")}>
                  {month}
                </span>
                <span className="hidden text-sm font-medium text-muted sm:inline">{weekday}</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className={cn("flex items-center gap-1.5 text-[15px] leading-snug font-bold", past ? "text-ink/60" : "text-ink")}>
                  <Icon className="size-4 shrink-0 text-gold-deep" strokeWidth={2} aria-hidden="true" />
                  {item.label}
                </p>
                <p className="mt-0.5 text-[13px] text-muted">
                  <time dateTime={item.time ? `${item.date}T${item.time}+05:30` : item.date}>
                    {formatDate(item.date)}
                    {item.time && `, ${formatTime(item.time)}`}
                  </time>
                </p>
                <StatusPill status={status} className="mt-2" />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
