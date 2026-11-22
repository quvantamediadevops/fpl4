import { Phone } from "lucide-react";
import { tournament } from "@/config/tournament";
import { telHref } from "@/lib/tournament";
import { SectionHeading } from "@/components/tournament/SectionHeading";

export function ContactSection() {
  return (
    <section aria-labelledby="contact-title">
      <SectionHeading id="contact-title" eyebrow="Get in touch" title="Contact the organisers" />
      <ul className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-2 sm:gap-3 lg:grid-cols-4">
        {tournament.contacts.map((c) => (
          <li key={c.phone}>
            <a
              href={telHref(c.phone)}
              className="group flex items-center gap-3 rounded-2xl border border-line bg-white p-3.5 shadow-card transition-[border-color,box-shadow,transform] hover:border-gold/50 hover:shadow-lift active:scale-[0.98] sm:p-4"
              aria-label={`Call ${c.name} on ${c.phone}`}
            >
              <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-gold text-ink transition-transform group-hover:scale-105">
                <Phone className="size-[18px]" strokeWidth={2.25} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-black tracking-tight text-ink">{c.name}</span>
                <span className="block text-sm font-semibold text-muted tabular-nums">{c.phone}</span>
              </span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
