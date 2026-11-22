import type { Metadata } from "next";
import { Trophy } from "lucide-react";
import { site } from "@/config/site";
import { results } from "@/config/tournament";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { ResultCard } from "@/components/results/ResultCard";

export const metadata: Metadata = {
  title: "Results",
  description: `Official match results for ${site.name} – ${site.season}.`,
};

export default function ResultsPage() {
  const sorted = [...results].sort((a, b) => b.matchNumber - a.matchNumber);
  return (
    <>
      <PageHeader eyebrow={site.season} title="RESULTS" description="Scores, winners and Player of the Match for every completed game." />
      <section className="container-page">
        {sorted.length > 0 ? (
          <ul className="grid gap-4 md:grid-cols-2">
            {sorted.map((r) => (
              <li key={r.matchNumber}>
                <ResultCard result={r} />
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState
            icon={Trophy}
            title="No results yet"
            description="Official results will be published here after each completed match."
          />
        )}
      </section>
    </>
  );
}
