"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import type { AuctionSnapshot } from "@/auction/types";
import { useAuctionLive, type Connection } from "@/components/auction/useAuctionLive";

type Live = { snapshot: AuctionSnapshot | null; connection: Connection };

const LiveContext = createContext<Live | null>(null);

/** Single server-authoritative live feed for every broadcast screen. */
export function LiveProvider({ initial, children }: { initial: AuctionSnapshot | null; children: ReactNode }) {
  const { snapshot, connection } = useAuctionLive(initial);
  const value = useMemo(() => ({ snapshot, connection }), [snapshot, connection]);
  return <LiveContext.Provider value={value}>{children}</LiveContext.Provider>;
}

export function useLive(): Live {
  const live = useContext(LiveContext);
  if (!live) throw new Error("useLive must be used inside <LiveProvider>");
  return live;
}
