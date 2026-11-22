import { Shield, Target, Users, Zap } from "lucide-react";
import type { PlayerStats } from "@/types/player";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/ui/StatCard";

/** Team count is always known (config); player counts appear only when the sheet loaded. */
export function TournamentStats({ stats, teamCount }: { stats: PlayerStats | null; teamCount: number }) {
  if (!stats && teamCount === 0) return null;
  return (
    <section aria-label="Tournament statistics" className="container-page relative -mt-6 sm:-mt-8">
      <div className={cn("grid gap-2.5 sm:gap-4", stats ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-2 sm:max-w-sm sm:grid-cols-1")}>
        {teamCount > 0 && <StatCard icon={Shield} value={teamCount} label="Registered Teams" />}
        {stats && (
          <>
            <StatCard icon={Users} value={stats.total} label="Registered Players" />
            <StatCard icon={Zap} value={stats.batsmen} label="Batsmen" accent="bat" />
            <StatCard icon={Target} value={stats.bowlers} label="Bowlers" accent="bowl" />
          </>
        )}
      </div>
    </section>
  );
}
