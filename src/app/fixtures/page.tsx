import type { Metadata } from "next";
import { CalendarDays } from "lucide-react";
import { site } from "@/config/site";
import { fixtures } from "@/config/tournament";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { MatchCard } from "@/components/fixtures/MatchCard";

export const metadata: Metadata = {
  title: "Fixtures",
  description: `Match schedule for ${site.name} – ${site.season}.`,
};

export default function FixturesPage() {
  const sorted = [...fixtures].sort((a, b) => a.matchNumber - b.matchNumber);
  return (
    <>
      <PageHeader eyebrow={site.season} title="FIXTURES" description="Match schedule, dates, timings and venues." />
      <section className="container-page">
        {sorted.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {sorted.map((f) => (
              <li key={f.matchNumber}>
                <MatchCard fixture={f} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={CalendarDays}
            title="Fixtures not yet announced"
            description="The official match schedule will appear here once it has been released by the organising committee."
          />
        )}
      </section>
    </>
  );
}
