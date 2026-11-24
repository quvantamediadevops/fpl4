import type { Metadata } from "next";
import { PlayerScreen } from "@/components/broadcast/PlayerScreen";

export const metadata: Metadata = {
  title: "Player Presentation",
  description: "Live player presentation for the Fertilizer Premier League Season 4 auction.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <PlayerScreen />;
}
