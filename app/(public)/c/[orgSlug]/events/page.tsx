import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getContactEmail } from "@/src/lib/contact";
import { cachedPageData } from "@/src/lib/publicCache.server";
import { getPublishedEventCards } from "@/src/lib/publicData.server";
import EventsClient from "./EventsClient";

// Built on first visit and refreshed every 5 minutes, or at once when an event changes (publicCache.server.ts).
export const revalidate = 300;
export const metadata: Metadata = {
  title: "Events · GHMO",
  description: "Gatherings, festivals and meetings of the Greater Harrisburg Magar Organization."
};

/** No copies at build time: the page is built on its first visit, then served from the cache. */
export function generateStaticParams(): { orgSlug: string }[] {
  return [];
}

/** The events list, rendered with its data from the cache (card fields only). Which events are past is decided in the browser. */
export default async function EventsPage({ params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  if (orgSlug !== COMMUNITY_SLUG) notFound();
  const events = cachedPageData(await getPublishedEventCards(), "Events");
  // eslint-disable-next-line react-hooks/purity -- when this cached copy was built; the browser switches to its own clock (useNow)
  const renderedAt = Date.now();
  return <EventsClient orgSlug={orgSlug} events={events} renderedAt={renderedAt} contactEmail={getContactEmail()} />;
}
