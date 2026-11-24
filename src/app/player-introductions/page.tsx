import type { Metadata } from "next";
import Link from "next/link";
import { getPlayerDirectory, toPublicPlayer } from "@/lib/players";
import { PlayerPresentation } from "@/components/presentation/PlayerPresentation";
import { StadiumBackdrop } from "@/components/presentation/StadiumBackdrop";

export const metadata: Metadata = {
  title: "Player Introductions",
  description: "Full-screen player introductions for Fertilizer Premier League – Season 4.",
  robots: { index: false, follow: false },
};

export default async function PlayerIntroductionsPage({ searchParams }: PageProps<"/player-introductions">) {
  const [directory, params] = await Promise.all([getPlayerDirectory(), searchParams]);

  if (!directory.ok) {
    return (
      <PresentationMessage
        title={directory.reason === "not_configured" ? "Player list is being set up" : "Players are temporarily unavailable"}
        description={
          directory.reason === "not_configured"
            ? "Players will appear here as soon as the official registration sheet is connected."
            : "We couldn't load the player list right now. Please try again in a moment."
        }
        retry={directory.reason === "unavailable"}
      />
    );
  }

  const players = directory.data.players.map(toPublicPlayer);
  if (players.length === 0) {
    return <PresentationMessage title="No players yet" description="Registered players will appear here once registrations are recorded." />;
  }

  const requested = Number(Array.isArray(params.p) ? params.p[0] : params.p);
  const initialIndex = Number.isInteger(requested) && requested >= 1 && requested <= players.length ? requested - 1 : 0;

  return <PlayerPresentation players={players} initialIndex={initialIndex} />;
}

function PresentationMessage({ title, description, retry = false }: { title: string; description: string; retry?: boolean }) {
  return (
    <div data-presentation className="fixed inset-0 z-50 grid place-items-center px-6 text-center text-white">
      <StadiumBackdrop />
      <div className="relative max-w-xl">
        <p className="text-xs font-bold tracking-[0.42em] text-gold-light">PLAYER INTRODUCTION</p>
        <h1 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">{title}</h1>
        <p className="mt-4 text-base text-white/65 sm:text-lg">{description}</p>
        {retry && (
          <Link
            href="/player-introductions"
            prefetch={false}
            className="mt-8 inline-flex h-12 items-center rounded-full border border-gold/60 px-6 text-sm font-bold tracking-[0.2em] text-gold-light transition hover:bg-gold/15"
          >
            TRY AGAIN
          </Link>
        )}
      </div>
    </div>
  );
}
