"use client";

import Link from "next/link";
import { m } from "motion/react";
import { CalendarDays, Home, Shield, Trophy, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsActive } from "@/components/layout/useActivePath";

const tabs = [
  { href: "/", label: "Home", icon: Home },
  { href: "/players", label: "Players", icon: Users },
  { href: "/teams", label: "Teams", icon: Shield },
  { href: "/fixtures", label: "Fixtures", icon: CalendarDays },
  { href: "/results", label: "Results", icon: Trophy },
] as const;

/** Height is 3.75rem + safe area; page content reserves the same space (pb-safe-nav). */
export function MobileNavigation() {
  const isActive = useIsActive();
  return (
    <nav
      aria-label="Quick navigation"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_20px_-12px_rgb(17_24_39/0.18)] backdrop-blur-md md:hidden"
    >
      <ul className="mx-auto grid h-[3.75rem] max-w-md grid-cols-5 px-1">
        {tabs.map(({ href, label, icon: Icon }) => {
          const active = isActive(href);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition-colors active:scale-95",
                  active ? "text-ink" : "text-muted",
                )}
              >
                <span className="relative inline-flex h-7 w-12 items-center justify-center">
                  {active && (
                    <m.span
                      layoutId="mobile-tab-indicator"
                      className="absolute inset-0 rounded-full bg-gold/18"
                      transition={{ type: "spring", stiffness: 500, damping: 40 }}
                    />
                  )}
                  <Icon className={cn("relative size-5", active && "text-gold-deep")} strokeWidth={active ? 2.2 : 1.8} aria-hidden="true" />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
