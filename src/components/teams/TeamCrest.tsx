"use client";

import Image from "next/image";
import { useState } from "react";
import type { Team } from "@/types/tournament";
import { cn } from "@/lib/utils";

function MonogramShield({ team }: { team: Team }) {
  const long = team.monogram.length > 3;
  return (
    <div className="absolute inset-[3%]" aria-hidden="true">
      <svg viewBox="0 0 40 44" className="absolute inset-0 h-full w-full drop-shadow-[0_6px_10px_rgb(0_0_0/0.35)]">
        <defs>
          <linearGradient id={`crest-${team.slug}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1e293b" />
            <stop offset="1" stopColor="#0b1220" />
          </linearGradient>
        </defs>
        <path d="M20 1.2 38 7v13.4c0 10.6-7.4 19.1-18 23.2C9.4 39.5 2 31 2 20.4V7L20 1.2Z" fill="#D4A72C" />
        <path d="M20 3.6 35.8 8.7v11.7c0 9.4-6.5 17-15.8 20.8C10.7 37.4 4.2 29.8 4.2 20.4V8.7L20 3.6Z" fill={`url(#crest-${team.slug})`} />
        <path d="M20 6.4 33.4 10.7v9.7c0 8-5.4 14.6-13.4 18.1-8-3.5-13.4-10.1-13.4-18.1v-9.7L20 6.4Z" fill="none" stroke="#D4A72C" strokeOpacity="0.45" strokeWidth="0.6" />
      </svg>
      <span
        className={cn(
          "absolute inset-x-0 top-[40%] -translate-y-1/2 text-center leading-none font-black text-[#F5D98A]",
          long ? "text-[clamp(0.7rem,22cqw,1.15rem)] tracking-[-0.02em]" : "text-[clamp(0.9rem,30cqw,1.6rem)] tracking-tight",
        )}
      >
        {team.monogram}
      </span>
    </div>
  );
}

/**
 * Fixed square footprint for every team: the official logo on a white rounded tile
 * (object-fit: contain, so nothing is cropped), or the initials shield when a team has
 * no logo yet or the image fails to load.
 */
export function TeamCrest({ team, className }: { team: Team; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showLogo = !!team.logo && !failed;

  return (
    <div className={cn("relative aspect-square shrink-0 [container-type:inline-size]", className)}>
      {showLogo ? (
        <div className="absolute inset-0 overflow-hidden rounded-[22%] bg-white shadow-[0_8px_18px_-8px_rgb(0_0_0/0.55)] ring-2 ring-gold">
          <Image
            src={team.logo!}
            alt={`${team.name} logo`}
            fill
            sizes="(min-width: 640px) 96px, 72px"
            unoptimized
            loading="lazy"
            onError={() => setFailed(true)}
            ref={(img) => {
              if (img?.complete && img.naturalWidth === 0) setFailed(true);
            }}
            className="object-contain p-[5%]"
          />
        </div>
      ) : (
        <MonogramShield team={team} />
      )}
    </div>
  );
}
