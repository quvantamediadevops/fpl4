import type { ReactNode } from "react";

export function SectionHeading({ id, eyebrow, title, children }: { id: string; eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <div className="mb-4 flex flex-wrap items-end justify-between gap-3 sm:mb-5">
      <div>
        <p className="flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-gold-deep uppercase">
          <span className="h-[2px] w-5 rounded-full bg-gold" aria-hidden="true" />
          {eyebrow}
        </p>
        <h2 id={id} className="mt-1.5 text-xl font-black tracking-tight text-ink sm:text-2xl">
          {title}
        </h2>
      </div>
      {children}
    </div>
  );
}
