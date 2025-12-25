"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { DEFAULT_TIMEZONE, type EventRecord } from "@/src/lib/events.shared";
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || "ghmo";
  const eventId = params?.eventId as string;
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/organizations/${orgSlug}/events?status=all`, { cache: "no-store" });
        const data = await res.json();
        const found = (data.events || []).find((e: EventRecord) => e.id === eventId) as EventRecord | undefined;
        if (!found || found.status !== "published") {
          router.replace("/login");
          return;
        }
        setEvent(found);
      } finally {
        setLoading(false);
      }
    };
    if (eventId) void load();
  }, [eventId, orgSlug, router]);

  if (!event && !loading) {
    notFound();
  }

  if (!event) {
    return <div className="px-4 py-10 text-sm text-slate-600">Loading event...</div>;
  }

  const start = event.startsAt ? new Date(event.startsAt.toDate?.() || event.startsAt) : null;
  const end = event.endsAt ? new Date(event.endsAt.toDate?.() || event.endsAt) : null;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{event.title}</h1>
          {start ? (
            <p className="text-sm text-slate-600">
              {start.toLocaleString("en-US", { timeZone: event.timezone || DEFAULT_TIMEZONE })}
              {end ? ` - ${end.toLocaleString("en-US", { timeZone: event.timezone || DEFAULT_TIMEZONE })}` : ""}
            </p>
          ) : null}
          {event.location ? <p className="text-sm text-slate-600">{event.location}</p> : null}
        </div>
        <Link
          href={`/api/organizations/${params.orgSlug}/events/${event.id}/announcement.pdf`}
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Download Announcement PDF
        </Link>
      </div>
      {event.summary ? <p className="text-lg text-slate-700">{event.summary}</p> : null}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="whitespace-pre-wrap text-slate-800">{event.body}</p>
      </div>
    </div>
  );
}
