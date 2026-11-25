import { StadiumBackdrop } from "@/components/presentation/StadiumBackdrop";

export default function Loading() {
  return (
    <div data-presentation className="fixed inset-0 z-50 grid place-items-center text-white" role="status">
      <StadiumBackdrop />
      <div className="relative flex flex-col items-center gap-5">
        <span className="size-12 animate-spin rounded-full border-2 border-gold/25 border-t-gold" aria-hidden="true" />
        <p className="text-xs font-bold tracking-[0.42em] text-gold-light">LOADING PLAYERS</p>
      </div>
    </div>
  );
}
