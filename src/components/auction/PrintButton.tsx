"use client";

export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-lg border border-ink px-4 py-2 text-sm font-bold print:hidden">
      Print
    </button>
  );
}
