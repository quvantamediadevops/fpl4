"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { useSyncExternalStore, type MouseEvent } from "react";

export const DIRECTORY_URL_KEY = "fpl:directory-url";
export const FROM_DIRECTORY_KEY = "fpl:from-directory";

function read(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

const noopSubscribe = () => () => {};

export function BackButton() {
  const router = useRouter();
  const href = useSyncExternalStore(
    noopSubscribe,
    () => {
      const stored = read(DIRECTORY_URL_KEY);
      return stored?.startsWith("/players") ? stored : "/players";
    },
    () => "/players",
  );

  const onClick = (e: MouseEvent<HTMLAnchorElement>) => {
    // Came straight from the directory: go back so search, filter, page and scroll are restored.
    if (read(FROM_DIRECTORY_KEY) === "1" && window.history.length > 1) {
      e.preventDefault();
      try {
        sessionStorage.removeItem(FROM_DIRECTORY_KEY);
      } catch {}
      router.back();
    }
  };

  return (
    <Link
      href={href}
      onClick={onClick}
      className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white pr-4 pl-3 text-sm font-semibold text-ink ring-1 ring-line transition hover:bg-mist active:scale-[0.97]"
    >
      <ArrowLeft className="size-4" strokeWidth={2} />
      All players
    </Link>
  );
}
