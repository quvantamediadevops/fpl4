import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-3xl border border-line bg-white px-6 py-12 text-center sm:py-16",
        className,
      )}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-mist to-transparent"
      />
      <div className="relative mx-auto flex size-14 items-center justify-center rounded-2xl border border-gold/30 bg-white shadow-card">
        <Icon className="size-6 text-gold-deep" strokeWidth={1.75} />
      </div>
      <h2 className="relative mt-5 text-lg font-bold tracking-tight">{title}</h2>
      <p className="relative mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{description}</p>
      {action && <div className="relative mt-6 flex justify-center">{action}</div>}
    </div>
  );
}
