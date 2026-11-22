import { UserX } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { ButtonLink } from "@/components/ui/Button";

export default function PlayerNotFound() {
  return (
    <div className="container-page pt-10">
      <EmptyState
        icon={UserX}
        title="Player not found"
        description="This player profile doesn't exist or is no longer listed."
        action={<ButtonLink href="/players">VIEW ALL PLAYERS</ButtonLink>}
      />
    </div>
  );
}
