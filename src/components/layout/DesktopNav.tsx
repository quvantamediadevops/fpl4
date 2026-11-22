"use client";

import Link from "next/link";
import { m } from "motion/react";
import { navItems } from "@/config/site";
import { cn } from "@/lib/utils";
import { useIsActive } from "@/components/layout/useActivePath";

export function DesktopNav() {
  const isActive = useIsActive();
  return (
    <nav aria-label="Main" className="hidden md:block">
      <ul className="flex items-center gap-1">
        {navItems.map((item) => {
          const active = isActive(item.href);
          return (
            <li key={item.href}>
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-10 items-center rounded-full px-3.5 text-sm font-medium transition-colors lg:px-4",
                  active ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                {active && (
                  <m.span
                    layoutId="desktop-nav-pill"
                    className="absolute inset-0 rounded-full bg-mist ring-1 ring-line"
                    transition={{ type: "spring", stiffness: 500, damping: 40 }}
                  />
                )}
                <span className="relative">{item.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
