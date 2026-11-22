"use client";

import { Search, X } from "lucide-react";
import { useRef } from "react";

export function PlayerSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        inputRef.current?.blur();
      }}
      className="group relative"
    >
      <label htmlFor="player-search" className="sr-only">
        Search players by name
      </label>
      <Search
        className="pointer-events-none absolute top-1/2 left-4 size-[18px] -translate-y-1/2 text-muted transition-colors group-focus-within:text-gold-deep"
        strokeWidth={2}
        aria-hidden="true"
      />
      <input
        ref={inputRef}
        id="player-search"
        type="search"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        maxLength={60}
        placeholder="Search players by name..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-12 w-full rounded-xl border border-line bg-white pr-12 pl-11 text-base text-ink shadow-card transition-[border-color,box-shadow] outline-none placeholder:text-muted/75 focus:border-gold focus:ring-4 focus:ring-gold/15 sm:h-[52px] [&::-webkit-search-cancel-button]:hidden"
      />
      {value && (
        <button
          type="button"
          onClick={() => {
            onChange("");
            inputRef.current?.focus();
          }}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 inline-flex size-11 -translate-y-1/2 items-center justify-center rounded-lg text-muted transition hover:text-ink active:scale-90"
        >
          <span className="inline-flex size-6 items-center justify-center rounded-full bg-mist ring-1 ring-line">
            <X className="size-3.5" strokeWidth={2.5} />
          </span>
        </button>
      )}
    </form>
  );
}
