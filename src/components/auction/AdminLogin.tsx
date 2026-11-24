"use client";

import { Lock } from "lucide-react";
import { useState } from "react";
import { Emblem } from "@/components/layout/Logo";
import { StadiumBackdrop } from "@/components/presentation/StadiumBackdrop";

export function AdminLogin({ configured }: { configured: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/auction/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), password: form.get("password") }),
      });
      if (res.ok) {
        window.location.reload();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setError(data.message ?? "Sign-in failed.");
    } catch {
      setError("Network error. Check the connection and try again.");
    }
    setBusy(false);
  }

  return (
    <div data-standalone className="fixed inset-0 grid place-items-center overflow-y-auto p-4 text-white">
      <StadiumBackdrop />
      <form onSubmit={onSubmit} className="relative w-full max-w-sm rounded-3xl border border-gold/30 bg-[#0a1020]/90 p-7 shadow-[0_40px_120px_-20px_rgb(0_0_0/0.9)] backdrop-blur-md">
        <div className="flex items-center gap-3">
          <Emblem className="h-12 w-11" />
          <div>
            <p className="text-xs font-extrabold tracking-[0.18em]">FERTILIZER PREMIER LEAGUE</p>
            <h1 className="mt-1 text-lg font-black tracking-[0.12em] text-gold-light">AUCTION CONTROL ROOM</h1>
          </div>
        </div>
        {configured ? (
          <>
            <label className="mt-7 block text-xs font-bold tracking-[0.16em] text-white/60" htmlFor="admin-name">
              ADMIN NAME
            </label>
            <input id="admin-name" name="name" autoComplete="username" required autoFocus className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-base outline-none focus:border-gold" />
            <label className="mt-4 block text-xs font-bold tracking-[0.16em] text-white/60" htmlFor="admin-password">
              PASSWORD
            </label>
            <input id="admin-password" name="password" type="password" autoComplete="current-password" required className="mt-2 h-12 w-full rounded-xl border border-white/15 bg-white/5 px-4 text-base outline-none focus:border-gold" />
            {error && (
              <p role="alert" className="mt-4 rounded-xl bg-red-500/15 px-3 py-2 text-sm text-red-200">
                {error}
              </p>
            )}
            <button type="submit" disabled={busy} className="mt-6 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-gold font-extrabold tracking-[0.16em] text-[#111827] transition hover:bg-gold-light disabled:opacity-60">
              <Lock className="size-4" aria-hidden="true" />
              {busy ? "SIGNING IN…" : "SIGN IN"}
            </button>
          </>
        ) : (
          <p className="mt-7 rounded-xl bg-amber-400/10 px-4 py-3 text-sm text-amber-200">
            Admin login is not configured yet. Create an account with <code>node scripts/auction-admin.mjs &lt;name&gt;</code> and store the result as the
            <code> AUCTION_ADMINS</code> secret.
          </p>
        )}
      </form>
    </div>
  );
}
