"use client";

import { useEffect, useRef, type RefObject } from "react";
import { PlayerPhoto } from "@/components/players/PlayerPhoto";
import type { PlayerRole, PublicPlayer } from "@/types/player";

export const ROLE_DISPLAY: Record<PlayerRole, string> = {
  BATSMAN: "BATSMAN",
  BOWLER: "BOWLER",
  "ALL ROUNDER": "ALL-ROUNDER",
};

/** "01" of "89"; three digits once the field reaches 100. */
export function padPosition(n: number, total: number): string {
  return String(n).padStart(total >= 100 ? 3 : 2, "0");
}

export function PlayerThumb({ player, className = "size-12" }: { player: PublicPlayer; className?: string }) {
  return (
    <span className={`relative block shrink-0 overflow-hidden rounded-xl bg-[#0b1220] ring-1 ring-gold/30 ${className}`}>
      <PlayerPhoto src={player.photo} name={player.name} sizes="56px" stage />
    </span>
  );
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),[tabindex]:not([tabindex="-1"])';

/** Modal behaviour: initial focus, Escape to close, Tab kept inside, focus returned on close. */
export function useDialog(ref: RefObject<HTMLElement | null>, onClose: () => void) {
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (el.querySelector<HTMLElement>("[data-autofocus]") ?? el).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab") return;
      const items = Array.from(el.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((n) => n.offsetParent !== null);
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        e.preventDefault();
      } else if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    el.addEventListener("keydown", onKey);
    return () => {
      el.removeEventListener("keydown", onKey);
      previous?.focus({ preventScroll: true });
    };
  }, [ref]);
}
