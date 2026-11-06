import type { MetadataRoute } from "next";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getPublishedEvents, listArchive } from "@/src/lib/publicData.server";
import { absoluteUrl } from "@/src/lib/siteMetadata";

// Rebuilt at most every hour; the events and minutes reads themselves are cached (publicCache.server.ts).
export const revalidate = 3600;

/** The public pages, each published event and each approved minutes record. Empty until the site's address is set. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  if (!absoluteUrl("/")) return [];
  const url = (path: string) => absoluteUrl(path) as string;
  const [events, minutes] = await Promise.all([getPublishedEvents(), listArchive()]);
  return [
    { url: url("/"), changeFrequency: "weekly", priority: 1 },
    { url: url(`/c/${COMMUNITY_SLUG}/events`), changeFrequency: "weekly", priority: 0.9 },
    { url: url("/donate"), changeFrequency: "monthly", priority: 0.8 },
    { url: url("/minutes"), changeFrequency: "monthly", priority: 0.6 },
    { url: url("/multimedia"), changeFrequency: "weekly", priority: 0.5 },
    { url: url("/privacy"), changeFrequency: "yearly", priority: 0.2 },
    ...(events ?? []).map(event => ({
      url: url(`/c/${COMMUNITY_SLUG}/events/${encodeURIComponent(event.id)}`),
      changeFrequency: "monthly" as const,
      priority: 0.7
    })),
    ...(minutes ?? []).map(entry => ({
      url: url(`/minutes/${encodeURIComponent(entry.id)}`),
      ...(entry.approvedAt ? { lastModified: new Date(entry.approvedAt) } : {}),
      changeFrequency: "yearly" as const,
      priority: 0.4
    }))
  ];
}
