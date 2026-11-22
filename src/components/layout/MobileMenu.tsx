"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, m } from "motion/react";
import { ChevronRight, Menu, X } from "lucide-react";
import { navItems, site } from "@/config/site";
import { cn } from "@/lib/utils";
import { Emblem, SeasonBadge } from "@/components/layout/Logo";
import { useIsActive } from "@/components/layout/useActivePath";
import { usePathname } from "next/navigation";

export function MobileMenu() {
  const [open, setOpen] = useState(false);
  const isActive = useIsActive();
  const pathname = usePathname();
  const closeRef = useRef<HTMLButtonElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  // Close on route change.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    setOpen(false);
  }

  useEffect(() => {
    if (!open) return;
    const trigger = triggerRef.current;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="md:hidden">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
        aria-expanded={open}
        aria-controls="mobile-drawer"
        className="-mr-2 inline-flex size-11 items-center justify-center rounded-full text-ink transition active:scale-95 active:bg-mist"
      >
        <Menu className="size-6" strokeWidth={1.75} />
      </button>

      {/* Portal: the header's backdrop-filter would otherwise trap position:fixed inside it. */}
      {typeof document !== "undefined" &&
        createPortal(
      <AnimatePresence>
        {open && (
          <div className="fixed inset-0 z-50" id="mobile-drawer" role="dialog" aria-modal="true" aria-label="Menu">
            <m.div
              className="absolute inset-0 bg-ink/30"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <m.div
              className="absolute inset-y-0 right-0 flex w-[min(20rem,86vw)] flex-col bg-white shadow-2xl"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 420, damping: 42 }}
            >
              <div className="flex h-16 items-center justify-between border-b border-line px-4">
                <div className="flex items-center gap-2.5">
                  <Emblem className="h-9 w-8" />
                  <div className="leading-none">
                    <p className="text-[11px] font-extrabold tracking-[0.08em]">{site.short}</p>
                    <SeasonBadge className="mt-1" />
                  </div>
                </div>
                <button
                  ref={closeRef}
                  type="button"
                  onClick={() => setOpen(false)}
                  aria-label="Close menu"
                  className="-mr-2 inline-flex size-11 items-center justify-center rounded-full active:bg-mist"
                >
                  <X className="size-6" strokeWidth={1.75} />
                </button>
              </div>
              <nav aria-label="Mobile" className="flex-1 overflow-y-auto px-3 py-4">
                <ul className="space-y-1">
                  {navItems.map((item, i) => {
                    const active = isActive(item.href);
                    return (
                      <m.li
                        key={item.href}
                        initial={{ opacity: 0, x: 12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: 0.04 * i + 0.05, duration: 0.2 }}
                      >
                        <Link
                          href={item.href}
                          aria-current={active ? "page" : undefined}
                          onClick={() => setOpen(false)}
                          className={cn(
                            "flex min-h-12 items-center justify-between rounded-xl px-3 text-[15px] font-medium transition-colors",
                            active ? "bg-mist text-ink ring-1 ring-line" : "text-ink/80 active:bg-mist",
                          )}
                        >
                          <span className="flex items-center gap-3">
                            <span className={cn("size-1.5 rounded-full", active ? "bg-gold" : "bg-line")} />
                            {item.label}
                          </span>
                          <ChevronRight className="size-4 text-muted" />
                        </Link>
                      </m.li>
                    );
                  })}
                </ul>
              </nav>
              <p className="border-t border-line px-5 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] text-xs text-muted">
                {site.name} · {site.season}
              </p>
            </m.div>
          </div>
        )}
      </AnimatePresence>,
          document.body,
        )}
    </div>
  );
}
