"use client";

import { m } from "motion/react";
import { useRef, type ReactNode } from "react";
import { useDialog } from "@/components/presentation/shared";

/** Accessible modal: focus trap, Escape (unless busy), focus returned on close. */
export function Modal({ title, onClose, busy = false, children }: { title: string; onClose: () => void; busy?: boolean; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useDialog(ref, () => {
    if (!busy) onClose();
  });
  return (
    <m.div
      className="fixed inset-0 z-[70] grid place-items-center bg-black/70 p-4 backdrop-blur-sm"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.15 }}
      onPointerDown={(e) => {
        if (e.target === e.currentTarget && !busy) onClose();
      }}
    >
      <m.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className="w-full max-w-lg rounded-3xl border border-gold/30 bg-[#0a1020] p-6 text-white shadow-[0_40px_120px_-20px_rgb(0_0_0/0.9)] outline-none"
        initial={{ y: 12, scale: 0.98 }}
        animate={{ y: 0, scale: 1 }}
        exit={{ y: 8, scale: 0.98 }}
        transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      >
        <h2 className="text-sm font-extrabold tracking-[0.24em] text-gold-light">{title}</h2>
        <div className="mt-4">{children}</div>
      </m.div>
    </m.div>
  );
}
