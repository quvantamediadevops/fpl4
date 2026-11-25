import type { Metadata } from "next";
import { SummaryScreen } from "@/components/broadcast/SummaryScreen";

export const metadata: Metadata = {
  title: "Auction Summary",
  description: "Live auction totals, top buys and franchise spending.",
  robots: { index: false, follow: false },
};

export default function Page() {
  return <SummaryScreen />;
}
