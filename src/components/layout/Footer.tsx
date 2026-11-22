import Link from "next/link";
import { navItems, site } from "@/config/site";
import { Emblem } from "@/components/layout/Logo";

export function Footer() {
  return (
    <footer className="mt-20 border-t border-line bg-mist">
      <div className="container-page grid gap-8 py-10 md:grid-cols-[1.4fr_1fr] md:py-12">
        <div className="flex items-start gap-3">
          <Emblem className="h-11 w-10" />
          <div>
            <p className="text-sm font-extrabold tracking-[0.08em]">{site.nameUpper}</p>
            <p className="mt-1 text-sm text-muted">{site.season} · Official tournament website</p>
          </div>
        </div>
        <nav aria-label="Footer">
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-3">
            {navItems.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="inline-flex min-h-11 items-center text-muted transition-colors hover:text-ink">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="border-t border-line">
        <p className="container-page py-5 text-xs text-muted">
          © {new Date().getFullYear()} {site.name}. Player information is published from official registrations.
        </p>
      </div>
    </footer>
  );
}
