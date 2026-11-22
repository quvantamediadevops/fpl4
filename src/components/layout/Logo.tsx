import Link from "next/link";
import { site } from "@/config/site";
import { cn } from "@/lib/utils";

export function Emblem({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 44" aria-hidden="true" className={cn("shrink-0", className)}>
      <path d="M20 1.5 37 7v13.2c0 10.2-7.1 18.4-17 22.3C10.1 38.6 3 30.4 3 20.2V7L20 1.5Z" fill="#111827" />
      <path
        d="M20 4.6 34 9.2v11c0 8.6-5.8 15.6-14 19.2C11.8 35.8 6 28.8 6 20.2v-11l14-4.6Z"
        fill="none"
        stroke="#C99A28"
        strokeWidth="1.1"
      />
      <path d="M13.6 14.2h12.8" stroke="#F5D98A" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 17v13M20 17v13M25 17v13" stroke="#C99A28" strokeWidth="2.2" strokeLinecap="round" />
    </svg>
  );
}

export function SeasonBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-gold/40 bg-gold-light/25 px-2 py-0.5 text-[10px] font-bold tracking-[0.12em] text-gold-deep",
        className,
      )}
    >
      {site.seasonUpper}
    </span>
  );
}

export function Logo() {
  return (
    <Link href="/" className="flex min-h-11 items-center gap-2.5" aria-label={`${site.name} – ${site.season} home`}>
      <Emblem className="h-9 w-8 sm:h-10 sm:w-9" />
      <span className="flex flex-col leading-none">
        <span className="text-[11px] font-extrabold tracking-[0.08em] text-ink sm:text-[13px]">
          FERTILIZER
          <span className="hidden sm:inline"> PREMIER LEAGUE</span>
        </span>
        <span className="mt-1 flex items-center gap-1.5">
          <span className="text-[11px] font-extrabold tracking-[0.08em] text-ink sm:hidden">PREMIER LEAGUE</span>
          <SeasonBadge />
        </span>
      </span>
    </Link>
  );
}
