import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("flex items-center gap-2 text-[11px] font-bold tracking-[0.16em] text-gold-deep uppercase", className)}>
      <span className="h-px w-6 bg-gold" aria-hidden="true" />
      {children}
    </p>
  );
}

export function PageHeader({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <header className="container-page pt-8 pb-6 sm:pt-12 sm:pb-8">
      <Eyebrow>{eyebrow}</Eyebrow>
      <h1 className="mt-3 text-[28px] leading-[1.1] font-extrabold tracking-tight text-balance sm:text-4xl lg:text-5xl">
        {title}
      </h1>
      {description && <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-muted sm:text-base">{description}</p>}
      {children}
    </header>
  );
}
