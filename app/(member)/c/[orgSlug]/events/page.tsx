import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getContactEmail } from "@/src/lib/contact";
import { getPublishedEvents } from "@/src/lib/publicData.server";
import EventsClient from "./EventsClient";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Events · GHMO" };

/** The events list, rendered with its data (cached for a few minutes) instead of loading after the page. */
export default async function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  if (orgSlug !== COMMUNITY_SLUG) notFound();
  const events = await getPublishedEvents();
  // eslint-disable-next-line react-hooks/purity -- a server component renders once per request; "now" is that request's time
  return <EventsClient orgSlug={orgSlug} events={events} loadedAt={Date.now()} contactEmail={getContactEmail()} />;
}
