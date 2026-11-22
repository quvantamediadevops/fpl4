import { CloudOff, Settings2 } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";

export function DataUnavailable({ reason }: { reason: "not_configured" | "unavailable" }) {
  if (reason === "not_configured") {
    return (
      <EmptyState
        icon={Settings2}
        title="Player list is being set up"
        description="Registered players will appear here as soon as the official registration sheet is connected."
      />
    );
  }
  return (
    <EmptyState
      icon={CloudOff}
      title="Players are temporarily unavailable"
      description="We couldn't load the player list right now. Please try again in a moment."
      action={
        <ButtonLink href="/players" variant="secondary" prefetch={false}>
          TRY AGAIN
        </ButtonLink>
      }
    />
  );
}
