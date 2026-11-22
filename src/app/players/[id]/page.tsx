import type { Metadata } from "next";
import { notFound, permanentRedirect } from "next/navigation";
import { site } from "@/config/site";
import { findPlayer, getPlayerDirectory, toPublicPlayer } from "@/lib/players";
import { roleMeta } from "@/lib/utils";
import { PlayerProfile } from "@/components/players/PlayerProfile";
import { PlayerGrid } from "@/components/players/PlayerGrid";
import { DataUnavailable } from "@/components/ui/DataUnavailable";
import { ButtonLink } from "@/components/ui/Button";

async function load(id: string) {
  const directory = await getPlayerDirectory();
  if (!directory.ok) return { directory, player: undefined };
  return { directory, player: findPlayer(directory.data, id) };
}

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const { id } = await params;
  const { player } = await load(id);
  if (!player) return { title: "Player" };

  const role = player.role ? roleMeta[player.role].label : "Player";
  const pub = toPublicPlayer(player);
  const description = `${player.name} – registered ${role.toLowerCase()} for ${site.name} ${site.season}.`;
  const images = pub.photo ? [{ url: `${pub.photo}?w=720`, width: 720, alt: player.name }] : undefined;
  return {
    title: `${player.name} – ${role}`,
    description,
    openGraph: { type: "profile", url: `/players/${player.id}`, title: `${player.name} | ${site.name} – ${site.season}`, description, images },
    twitter: { card: pub.photo ? "summary_large_image" : "summary", title: player.name, description, images: images?.map((i) => i.url) },
  };
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const { id } = await params;
  const { directory, player } = await load(id);

  if (!directory.ok) {
    return (
      <div className="container-page pt-10">
        <DataUnavailable reason={directory.reason} />
      </div>
    );
  }
  if (!player) notFound();
  if (player.id !== id) permanentRedirect(`/players/${player.id}`);

  const pub = toPublicPlayer(player);
  const related = directory.data.players
    .filter((p) => p.id !== player.id && p.role && p.role === player.role)
    .slice(0, 4)
    .map(toPublicPlayer);


  return (
    <>
      <PlayerProfile player={pub} />
      {related.length > 0 && player.role && (
        <section className="container-page mt-16 sm:mt-24" aria-labelledby="related-heading">
          <div className="mb-5 flex items-end justify-between gap-4">
            <h2 id="related-heading" className="text-xl font-extrabold tracking-tight sm:text-2xl">
              More {roleMeta[player.role].plural}
            </h2>
            <ButtonLink href={`/players?role=${player.role.toLowerCase().replace(" ", "-")}`} variant="secondary" className="min-h-11 px-4 text-[11px]">
              VIEW ALL
            </ButtonLink>
          </div>
          <PlayerGrid players={related} animate={false} showNumbers={false} />
        </section>
      )}
    </>
  );
}
