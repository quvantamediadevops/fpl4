import Link from "next/link";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

const styles = {
  primary:
    "bg-ink text-white shadow-[0_1px_0_rgb(255_255_255/0.08)_inset,0_6px_16px_-8px_rgb(17_24_39/0.6)] hover:bg-ink/90",
  gold: "bg-gold text-ink hover:bg-[#c99c22]",
  secondary: "bg-white text-ink ring-1 ring-line hover:ring-ink/20 hover:bg-mist",
} as const;

type Variant = keyof typeof styles;

const base =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-full px-6 text-[13px] font-bold tracking-[0.08em] transition-[background-color,box-shadow,transform] duration-150 active:scale-[0.97] select-none";

export function ButtonLink({
  variant = "primary",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant }) {
  return <Link className={cn(base, styles[variant], className)} {...props} />;
}
