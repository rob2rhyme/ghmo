"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/src/components/ui/button";
import type { EventRecord } from "@/src/lib/events.shared";
import { formatTime } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { dayKey, eventStart, eventTimeZone, timeZoneLabel } from "./eventDates";
import { eventHref } from "./EventCard";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const pad = (n: number) => String(n).padStart(2, "0");

type Dated = { evt: EventRecord; start: Date; key: string };

function timeLine(item: Dated) {
  const timeZone = eventTimeZone(item.evt);
  return `${formatTime(item.start, { timeZone })} ${timeZoneLabel(item.start, timeZone)}`.trim();
}

/**
 * Month calendar. From tablet width up it is a 7-column grid; on phones the same month is an
 * agenda list (a 7-column grid is unreadable at 375 px).
 */
export function EventsCalendar({ events, orgSlug }: { events: EventRecord[]; orgSlug: string }) {
  const [offset, setOffset] = useState(0);
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth() + offset, 1);
  const year = first.getFullYear();
  const month = first.getMonth();
  const monthName = first.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  const prefix = `${year}-${pad(month + 1)}-`;
  const todayKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

  const dated = useMemo(
    () =>
      events
        .map(evt => {
          const start = eventStart(evt);
          return start ? { evt, start, key: dayKey(start, eventTimeZone(evt)) } : null;
        })
        .filter((item): item is Dated => item !== null)
        .sort((a, b) => a.start.getTime() - b.start.getTime()),
    [events]
  );
  const inMonth = dated.filter(item => item.key.startsWith(prefix));
  const byDay = new Map<string, Dated[]>();
  for (const item of inMonth) byDay.set(item.key, [...(byDay.get(item.key) ?? []), item]);

  const startWeekday = first.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [...Array<null>(startWeekday).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <section aria-labelledby="calendar-month" className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="calendar-month" className="text-lg font-semibold text-foreground" aria-live="polite">
          {monthName}
        </h2>
        <div className="flex flex-wrap items-center gap-2">
          {offset !== 0 ? (
            <Button variant="ghost" className="h-11 md:h-10" onClick={() => setOffset(0)}>
              This month
            </Button>
          ) : null}
          <Button variant="outline" size="icon" className="size-11 md:size-10" aria-label="Previous month" onClick={() => setOffset(o => o - 1)}>
            <ChevronLeft aria-hidden="true" />
          </Button>
          <Button variant="outline" size="icon" className="size-11 md:size-10" aria-label="Next month" onClick={() => setOffset(o => o + 1)}>
            <ChevronRight aria-hidden="true" />
          </Button>
        </div>
      </div>

      {/* Tablet and up: month grid */}
      <div className="hidden md:block">
        <div className="grid grid-cols-7 gap-2 pb-2 text-center text-sm font-medium text-muted-foreground" aria-hidden="true">
          {WEEKDAYS.map(d => (
            <div key={d}>{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-[repeat(7,minmax(0,1fr))] gap-2">
          {cells.map((day, idx) => {
            const key = day ? `${prefix}${pad(day)}` : "";
            const items = day ? byDay.get(key) ?? [] : [];
            const isToday = key === todayKey;
            return (
              <div
                key={idx}
                className={cn(
                  "flex min-h-24 min-w-0 flex-col gap-1 rounded-md border p-2",
                  day ? "border-border bg-background" : "border-transparent",
                  isToday && "ring-2 ring-primary/40"
                )}
              >
                {day ? (
                  <span className={cn("text-sm font-medium", isToday ? "text-primary" : "text-muted-foreground")}>
                    {day}
                    {isToday ? <span className="sr-only"> (today)</span> : null}
                  </span>
                ) : null}
                {items.map(item => (
                  <Link
                    key={item.evt.id}
                    href={eventHref(orgSlug, item.evt.id)}
                    title={item.evt.title}
                    className="truncate rounded-md bg-primary/10 px-1.5 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                  >
                    {item.evt.title}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
        {inMonth.length === 0 ? <p className="pt-3 text-sm text-muted-foreground">No events in {monthName}.</p> : null}
      </div>

      {/* Phones: agenda list for the same month */}
      <div className="md:hidden">
        {inMonth.length === 0 ? (
          <p className="text-sm text-muted-foreground">No events in {monthName}. Use the arrows to see other months.</p>
        ) : (
          <ol className="flex flex-col gap-4">
            {[...byDay.entries()].map(([key, items]) => (
              <li key={key} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold text-muted-foreground">
                  {new Date(`${key}T12:00:00`).toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                </h3>
                <ul className="flex flex-col gap-2">
                  {items.map(item => (
                    <li key={item.evt.id}>
                      <Link
                        href={eventHref(orgSlug, item.evt.id)}
                        className="flex min-h-11 flex-col justify-center rounded-md border border-border bg-background px-3 py-2 hover:border-primary/50"
                      >
                        <span className="font-medium text-foreground">{item.evt.title}</span>
                        <span className="text-sm text-muted-foreground">
                          {timeLine(item)}
                          {item.evt.location ? ` · ${item.evt.location}` : ""}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </div>
    </section>
  );
}
