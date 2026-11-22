import type { PlayerRole } from "@/types/player";
import { cn, roleMeta } from "@/lib/utils";

const solid: Record<PlayerRole, string> = {
  BATSMAN: "bg-bat text-white",
  BOWLER: "bg-bowl-deep text-white",
  "ALL ROUNDER": "bg-ar text-white",
};

export function RoleBadge({
  role,
  size = "sm",
  tone = "soft",
  className,
}: {
  role: PlayerRole | null;
  size?: "sm" | "md";
  /** soft: tinted, for light surfaces. solid: filled, for use over photos. */
  tone?: "soft" | "solid";
  className?: string;
}) {
  const meta = role ? roleMeta[role] : null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-bold tracking-[0.08em] whitespace-nowrap",
        size === "sm" ? "px-2 py-[3px] text-[10px]" : "px-3 py-1 text-xs",
        tone === "solid"
          ? role
            ? solid[role]
            : "bg-white/90 text-muted"
          : cn("ring-1 ring-inset", meta ? meta.badge : "bg-mist text-muted ring-line"),
        className,
      )}
    >
      {tone === "soft" && <span className={cn("size-1.5 rounded-full", meta ? meta.dot : "bg-muted/50")} aria-hidden="true" />}
      {role ?? "ROLE PENDING"}
    </span>
  );
}
