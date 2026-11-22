import { SearchX, UserPlus, Users } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";

export function PlayerEmptyState({
  variant,
  query,
  roleLabel,
  onReset,
}: {
  variant: "no-results" | "no-players" | "empty-category";
  query?: string;
  /** Plural role label, e.g. "Bowlers". */
  roleLabel?: string;
  onReset?: () => void;
}) {
  const reset = onReset && (
    <button
      type="button"
      onClick={onReset}
      className="inline-flex min-h-11 items-center rounded-xl bg-white px-5 text-[13px] font-bold tracking-[0.06em] shadow-card ring-1 ring-line transition hover:ring-ink/20 active:scale-[0.97]"
    >
      SHOW ALL PLAYERS
    </button>
  );

  if (variant === "no-players") {
    return (
      <EmptyState
        icon={UserPlus}
        title="No players registered yet"
        description="Registered players will appear here automatically once registrations are received."
      />
    );
  }
  if (variant === "empty-category") {
    return (
      <EmptyState
        icon={Users}
        title={`No ${roleLabel?.toLowerCase() ?? "players"} registered yet`}
        description="Players in this category will appear here as soon as they are registered."
        action={reset}
      />
    );
  }
  return (
    <EmptyState
      icon={SearchX}
      title="No players found"
      description={
        query
          ? `No ${roleLabel ? roleLabel.toLowerCase() : "player"} matches “${query}”. Check the spelling or try another filter.`
          : "No registered player matches this filter."
      }
      action={reset}
    />
  );
}
