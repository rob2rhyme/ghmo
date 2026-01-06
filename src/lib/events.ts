import "server-only";

import { COMMUNITY_SLUG } from "./community";
import { DEFAULT_TIMEZONE, type EventRecord } from "./events.shared";
import { orgDocPath } from "./firestorePaths";

export function eventsCollectionPath(orgId?: string) {
  const slug = orgId || COMMUNITY_SLUG;
  return `${orgDocPath(slug)}/events`;
}

export function normalizeEvent(doc: FirebaseFirestore.DocumentSnapshot): EventRecord {
  const data = doc.data() || {};
  return {
    id: doc.id,
    title: data.title || "Untitled Event",
    summary: data.summary,
    body: data.body || "",
    status: data.status || "draft",
    startsAt: data.startsAt,
    endsAt: data.endsAt,
    timezone: data.timezone || DEFAULT_TIMEZONE,
    location: data.location,
    featured: data.featured,
    announcementDocTemplate: data.announcementDocTemplate,
    announcementPdfSource: data.announcementPdfSource,
    createdAt: data.createdAt,
    updatedAt: data.updatedAt,
    createdByUid: data.createdByUid
  };
}

export function ensureOrgSlug(slug: string) {
  return slug === COMMUNITY_SLUG;
}

export { DEFAULT_TIMEZONE };
