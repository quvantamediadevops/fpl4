import { Award } from "lucide-react";
import type { MatchResult } from "@/types/tournament";
import { cn } from "@/lib/utils";
import { formatMatchDate } from "@/components/fixtures/MatchCard";

export function ResultCard({ result }: { result: MatchResult }) {
  return (
    <article className="rounded-[18px] border border-line bg-white p-4 shadow-card sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11px] font-bold tracking-[0.14em] text-gold-deep">MATCH {result.matchNumber}</p>
        <p className="text-xs text-muted">{formatMatchDate(result.date)}</p>
      </div>
      <ul className="mt-4 space-y-2.5">
        {result.innings.map((inn) => {
          const won = result.winner === inn.team;
          return (
            <li key={inn.team} className="flex items-baseline justify-between gap-3">
              <span className={cn("text-[15px] break-words", won ? "font-bold" : "font-medium text-ink/80")}>{inn.team}</span>
              <span className="shrink-0 tabular-nums">
                <span className={cn("text-lg", won ? "font-extrabold" : "font-semibold")}>
                  {inn.runs}/{inn.wickets}
                </span>
                <span className="ml-1.5 text-xs text-muted">({inn.overs} ov)</span>
              </span>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 border-t border-line pt-3 text-sm font-semibold">{result.summary}</p>
      {result.playerOfTheMatch && (
        <p className="mt-2 flex items-center gap-1.5 text-[13px] text-muted">
          <Award className="size-4 text-gold-deep" aria-hidden="true" />
          Player of the Match: <span className="font-semibold text-ink">{result.playerOfTheMatch}</span>
        </p>
      )}
    </article>
  );
}
