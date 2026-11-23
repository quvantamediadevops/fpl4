"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

const useIsoLayoutEffect = typeof window === "undefined" ? useEffect : useLayoutEffect;

/**
 * Largest font size (px) at which `text` fits its box without overflowing
 * (whole words wrap; nothing is cut). Re-runs when the text or box size changes.
 */
export function useFitText<T extends HTMLElement>(text: string, minPx: number, maxPx: number) {
  const boxRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<T>(null);

  useIsoLayoutEffect(() => {
    const box = boxRef.current;
    const el = textRef.current;
    if (!box || !el) return;

    const fit = () => {
      let lo = minPx;
      let hi = Math.max(minPx, Math.min(maxPx, box.clientHeight));
      const fits = (px: number) => {
        el.style.fontSize = `${px}px`;
        return el.scrollWidth <= box.clientWidth + 1 && el.scrollHeight <= box.clientHeight + 1;
      };
      if (fits(hi)) return;
      for (let i = 0; i < 12 && hi - lo > 1; i++) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      fits(Math.floor(lo));
    };

    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(box);
    return () => ro.disconnect();
  }, [text, minPx, maxPx]);

  return { boxRef, textRef };
}
