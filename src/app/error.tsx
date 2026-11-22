"use client";

import { useEffect } from "react";
import { RefreshCw } from "lucide-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[app] render error", error.digest ?? "");
  }, [error]);

  return (
    <div className="container-page py-16">
      <div className="mx-auto max-w-md rounded-3xl border border-line bg-white px-6 py-12 text-center shadow-card">
        <h1 className="text-xl font-bold tracking-tight">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted">This page couldn&apos;t be loaded. Please try again.</p>
        <button
          type="button"
          onClick={reset}
          className="mt-6 inline-flex min-h-12 items-center gap-2 rounded-full bg-ink px-6 text-[13px] font-bold tracking-[0.08em] text-white active:scale-[0.97]"
        >
          <RefreshCw className="size-4" />
          TRY AGAIN
        </button>
      </div>
    </div>
  );
}
