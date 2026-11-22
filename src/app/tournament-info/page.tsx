import type { Metadata } from "next";
import { connection } from "next/server";
import { site } from "@/config/site";
import { teamCount, tournament } from "@/config/tournament";
import { formatDate } from "@/lib/tournament";
import { InfoHero } from "@/components/tournament/InfoHero";
import { KeyDates } from "@/components/tournament/KeyDates";
import { PrizeSection } from "@/components/tournament/PrizeSection";
import { AuctionCard, FeesCard, VenueCard } from "@/components/tournament/DetailCards";
import { ContactSection } from "@/components/tournament/ContactSection";

export const metadata: Metadata = {
  title: "Tournament Information",
  description: `${site.name} ${site.season}: ${teamCount} teams, matches from ${formatDate(tournament.matchStart)} at ${tournament.venue.ground}. Auction, prize money, registration fees and organiser contacts.`,
};

export default async function TournamentInfoPage() {
  await connection(); // deadline and countdown status are evaluated per request
  const now = new Date();


  return (
    <>
      <InfoHero now={now} />
      <div className="container-page space-y-12 pt-8 sm:space-y-16 sm:pt-12">
        <KeyDates now={now} />
        <PrizeSection />
        <div className="grid gap-3 sm:gap-4 md:grid-cols-2 lg:grid-cols-3">
          <AuctionCard />
          <FeesCard now={now} />
          <div className="md:col-span-2 lg:col-span-1">
            <VenueCard />
          </div>
        </div>
        <ContactSection />
      </div>
    </>
  );
}
