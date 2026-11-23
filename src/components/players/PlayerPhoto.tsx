"use client";

import Image from "next/image";
import { useCallback, useState } from "react";
import { cn, initials } from "@/lib/utils";

/** Initials avatar used when a photo is missing, private or fails to load. Never a stock image. */
export function PlayerAvatarFallback({
  name,
  className,
  large = false,
}: {
  name: string;
  className?: string;
  /** Scales the initials with the frame (presentation screen); default sizing suits cards. */
  large?: boolean;
}) {
  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden bg-[radial-gradient(110%_70%_at_50%_18%,#253247_0%,#111827_70%)]",
        large && "[container-type:inline-size]",
        className,
      )}
      role="img"
      aria-label={`${name} – photo not available`}
    >
      <svg viewBox="0 0 100 125" preserveAspectRatio="none" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <path d="M16 0c24 32 24 93 0 125M84 0c-24 32-24 93 0 125" fill="none" stroke="#D4A72C" strokeOpacity="0.35" strokeDasharray="0.5 3.2" strokeLinecap="round" strokeWidth="1.1" />
      </svg>
      <span
        className={cn(
          "absolute top-[38%] left-1/2 flex aspect-square -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-gold/60 bg-[#0b1220] shadow-[0_0_0_6px_rgb(212_167_44/0.08)]",
          large ? "w-[56%]" : "w-[44%] max-w-32",
        )}
      >
        <span className={cn("font-black tracking-tight text-[#F5D98A]", large ? "text-[20cqw]" : "text-[clamp(1rem,6.5vw,2.1rem)]")}>
          {initials(name)}
        </span>
      </span>
    </div>
  );
}

export function PlayerPhoto({
  src,
  name,
  sizes,
  priority = false,
  className,
  stage = false,
}: {
  src: string | null;
  name: string;
  sizes: string;
  priority?: boolean;
  className?: string;
  /** Dark placeholder and frame-scaled initials, for the presentation screen. */
  stage?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Catches load/error events that fired before hydration attached handlers.
  const ref = useCallback((img: HTMLImageElement | null) => {
    if (img?.complete) {
      if (img.naturalWidth === 0) setFailed(true);
      else setLoaded(true);
    }
  }, []);

  if (!src || failed) return <PlayerAvatarFallback name={name} large={stage} />;

  return (
    <>
      {!loaded && (
        <div
          className={cn(
            "absolute inset-0 animate-pulse",
            stage ? "bg-[linear-gradient(160deg,#162033,#0b1220)]" : "bg-[linear-gradient(160deg,#f1f5f9,#e2e8f0)]",
          )}
          aria-hidden="true"
        />
      )}
      <Image
        ref={ref}
        src={src}
        alt={`${name}, Fertilizer Premier League Season 4 player`}
        fill
        sizes={sizes}
        priority={priority}
        loading={priority ? undefined : "lazy"}
        onError={() => setFailed(true)}
        onLoad={() => setLoaded(true)}
        className={cn(
          "object-cover object-[50%_22%] transition-[opacity,transform] duration-500",
          loaded ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}
