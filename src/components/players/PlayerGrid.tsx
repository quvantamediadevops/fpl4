"use client";

import { m } from "motion/react";
import type { PublicPlayer } from "@/types/player";
import { PlayerCard } from "@/components/players/PlayerCard";

const list = { show: { transition: { staggerChildren: 0.035 } } };
const item = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { duration: 0.28, ease: [0.22, 1, 0.36, 1] as const } },
};

/** 2 columns on phones and tablets, 3 on laptops, 4 on wide desktops. */
export function PlayerGrid({
  players,
  animate = true,
  priorityCount = 0,
}: {
  players: PublicPlayer[];
  /** false on first paint so server-rendered cards are visible before hydration. */
  animate?: boolean;
  priorityCount?: number;
}) {
  return (
    <m.ul
      className="grid grid-cols-2 gap-2.5 max-[299px]:grid-cols-1 sm:gap-4 lg:grid-cols-3 lg:gap-5 xl:grid-cols-4"
      variants={list}
      initial={animate ? "hidden" : false}
      animate="show"
    >
      {players.map((player, i) => (
        <m.li key={player.id} variants={item}>
          <PlayerCard player={player} priority={i < priorityCount} />
        </m.li>
      ))}
    </m.ul>
  );
}
