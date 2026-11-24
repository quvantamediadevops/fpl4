"use client";

export function ReloadButton() {
  return (
    <button type="button" onClick={() => window.location.reload()} className="mt-8 inline-flex h-12 items-center rounded-full border border-gold/60 px-6 text-sm font-bold tracking-[0.2em] text-gold-light">
      RELOAD
    </button>
  );
}
