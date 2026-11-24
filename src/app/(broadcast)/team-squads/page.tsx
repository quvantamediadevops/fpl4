import type { Metadata } from "next";
import { SquadsScreen } from "@/components/broadcast/SquadsScreen";

export const metadata: Metadata = {
  title: "Team Squads Live",
  description: "All eight franchise squads, updated live during the auction.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SquadsScreen />;
}
