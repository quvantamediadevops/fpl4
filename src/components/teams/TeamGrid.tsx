"use client";

import { m } from "motion/react";
import type { Team } from "@/types/tournament";
import { TeamCard } from "@/components/teams/TeamCard";

export function TeamGrid({ teams }: { teams: Team[] }) {
  return (
    <m.ul
      className="grid auto-rows-fr grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-4 lg:gap-5"
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.05 }}
      variants={{ show: { transition: { staggerChildren: 0.05 } } }}
    >
      {teams.map((team) => (
        <li key={team.slug} className="h-full">
          <TeamCard team={team} />
        </li>
      ))}
    </m.ul>
  );
}
