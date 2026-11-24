import { AuctionUnavailable } from "./AuctionUnavailable";

/**
 * `next dev` cannot run the auction: the AuctionRoom Durable Object and the live
 * WebSocket are part of worker.ts, which only the Workers runtime loads.
 * Returns a notice in development, null otherwise.
 */
export function auctionDevNotice(path: string) {
  if (process.env.NODE_ENV !== "development") return null;
  return (
    <AuctionUnavailable
      title="Open the auction on the local Workers preview"
      detail={`The auction's live room runs only on the Workers runtime, not under next dev. In the project folder run: npm run auction:local — then open http://localhost:8787${path}`}
    />
  );
}
