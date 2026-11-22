import { ArrowUpRight, Gavel, MapPin, ReceiptIndianRupee, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { tournament } from "@/config/tournament";
import { deadlineStatus, formatDate, formatINR, formatTime, mapsUrl } from "@/lib/tournament";
import { StatusPill } from "@/components/tournament/StatusPill";

function Card({ id, icon: Icon, title, children }: { id: string; icon: LucideIcon; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex h-full flex-col rounded-[20px] border border-line bg-white p-5 shadow-card sm:p-6">
      <div className="flex items-center gap-3">
        <span className="inline-flex size-10 items-center justify-center rounded-xl bg-ink text-gold">
          <Icon className="size-[18px]" strokeWidth={2} aria-hidden="true" />
        </span>
        <h2 id={id} className="text-lg font-black tracking-tight">
          {title}
        </h2>
      </div>
      <div className="mt-4 flex-1">{children}</div>
    </section>
  );
}

function Row({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <dt className="text-sm font-medium text-ink/80">{label}</dt>
        {sub && <div className="mt-1">{sub}</div>}
      </div>
      <dd className="shrink-0 text-right text-lg font-black tracking-tight text-ink tabular-nums">{value}</dd>
    </div>
  );
}

export function AuctionCard() {
  const a = tournament.auction;
  return (
    <Card id="auction-title" icon={Gavel} title="Player auction">
      <dl className="divide-y divide-line">
        <Row label="Auction budget" value={formatINR(a.budget)} />
        <Row label="Date" value={<span className="text-base">{formatDate(a.date, "short")}</span>} />
        <Row label="Time" value={<span className="text-base">{formatTime(a.time)}</span>} />
      </dl>
    </Card>
  );
}

export function FeesCard({ now }: { now: Date }) {
  const f = tournament.fees;
  const d = tournament.deadlines;
  return (
    <Card id="fees-title" icon={ReceiptIndianRupee} title="Registration fees">
      <dl className="divide-y divide-line">
        <Row
          label="Franchise (team)"
          value={formatINR(f.franchise)}
          sub={<StatusPill status={deadlineStatus(d.team, now)} />}
        />
        <Row label="Icon player" value={formatINR(f.iconPlayer)} />
        <Row
          label="Player"
          value={formatINR(f.player)}
          sub={<StatusPill status={deadlineStatus(d.player, now)} />}
        />
      </dl>
      <p className="mt-4 text-xs leading-relaxed text-muted">
        Last dates: teams {formatDate(d.team, "short")} · players {formatDate(d.player, "short")}. Contact the organisers to confirm
        registration.
      </p>
    </Card>
  );
}

export function VenueCard() {
  const v = tournament.venue;
  return (
    <Card id="venue-title" icon={MapPin} title="Venue">
      <address className="not-italic">
        <p className="text-lg leading-snug font-black tracking-tight text-ink">{v.ground}</p>
        <p className="mt-1 text-[15px] leading-relaxed text-muted">
          {v.area}
          <br />
          {v.township}
          <br />
          {v.sector}
        </p>
      </address>
      <a
        href={mapsUrl()}
        target="_blank"
        rel="noopener noreferrer"
        className="mt-5 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-4 text-[13px] font-bold ring-1 ring-line transition hover:bg-mist active:scale-[0.97]"
      >
        Open in Google Maps
        <ArrowUpRight className="size-4" aria-hidden="true" />
      </a>
    </Card>
  );
}
