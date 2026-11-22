"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set([1, total, current, current - 1, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  sorted.forEach((p, i) => {
    const prev = sorted[i - 1];
    if (prev !== undefined && p - prev > 1) out.push("gap");
    out.push(p);
  });
  return out;
}

const stepClass =
  "inline-flex h-11 items-center justify-center gap-1 rounded-xl bg-white px-3 text-sm font-semibold text-ink shadow-card ring-1 ring-line transition hover:ring-ink/20 active:scale-95 disabled:pointer-events-none disabled:opacity-40 sm:px-4";

export function PlayerPagination({
  page,
  totalPages,
  onChange,
}: {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <nav aria-label="Player pages" className="mt-8 flex items-center justify-between gap-2 sm:mt-10 sm:justify-center sm:gap-3">
      <button type="button" className={stepClass} onClick={() => onChange(page - 1)} disabled={page <= 1}>
        <ChevronLeft className="size-4" strokeWidth={2.25} aria-hidden="true" />
        <span>Prev</span>
      </button>

      {/* Phones: compact current-page indicator */}
      <p className="flex items-center gap-2 text-sm text-muted sm:hidden" aria-live="polite">
        <span className="inline-flex h-9 min-w-9 items-center justify-center rounded-lg bg-gold px-2 font-extrabold text-ink tabular-nums">
          {page}
        </span>
        of <span className="font-semibold text-ink tabular-nums">{totalPages}</span>
      </p>

      {/* Larger screens: page numbers */}
      <ol className="hidden items-center gap-1 sm:flex">
        {pageWindow(page, totalPages).map((p, i) =>
          p === "gap" ? (
            <li key={`gap-${i}`} className="w-6 text-center text-sm text-muted" aria-hidden="true">
              …
            </li>
          ) : (
            <li key={p}>
              <button
                type="button"
                onClick={() => onChange(p)}
                aria-current={p === page ? "page" : undefined}
                aria-label={`Page ${p}`}
                className={cn(
                  "inline-flex size-11 items-center justify-center rounded-xl text-sm font-bold tabular-nums transition active:scale-95",
                  p === page ? "bg-gold text-ink shadow-[0_8px_18px_-10px_rgb(212_167_44/0.9)]" : "text-ink/70 hover:bg-white hover:ring-1 hover:ring-line",
                )}
              >
                {p}
              </button>
            </li>
          ),
        )}
      </ol>

      <button type="button" className={stepClass} onClick={() => onChange(page + 1)} disabled={page >= totalPages}>
        <span>Next</span>
        <ChevronRight className="size-4" strokeWidth={2.25} aria-hidden="true" />
      </button>
    </nav>
  );
}
