import { ReloadButton } from "./ReloadButton";
import { StadiumBackdrop } from "@/components/presentation/StadiumBackdrop";

export function AuctionUnavailable({ title, detail }: { title: string; detail: string }) {
  return (
    <div data-standalone className="fixed inset-0 grid place-items-center px-6 text-center text-white">
      <StadiumBackdrop />
      <div className="relative max-w-lg">
        <p className="text-xs font-bold tracking-[0.42em] text-gold-light">FPL SEASON 4 AUCTION</p>
        <h1 className="mt-4 text-3xl font-black sm:text-4xl">{title}</h1>
        <p className="mt-4 text-white/65">{detail}</p>
        <ReloadButton />
      </div>
    </div>
  );
}
