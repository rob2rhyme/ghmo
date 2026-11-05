import { MANNERS, MANNER_LABELS, type Manner, type Outcome, type Rsvp } from "./callCampaigns";

/**
 * Pure helpers for the call history on a member's profile (plan §17, 13-C). The history itself comes from the call
 * records of every campaign; notes and manner ratings are encrypted and opened on the admin's device, so counting
 * them happens in the browser after decrypting.
 */

export type HistoryAttempt = { id: string; at: number | null; outcome: Outcome; byUid: string; note?: unknown; manner?: unknown };

export type HistoryEntry = {
  campaign: { id: string; title: string; eventTitle: string | null; createdAt: number | null; status: "open" | "closed" };
  call: { callerUid: string; outcome: Outcome | null; rsvp: Rsvp | null; attempts: HistoryAttempt[] };
};

/** Newest campaign first; campaigns without a date last. */
export function sortHistoryNewestFirst<T extends { campaign: { id: string; createdAt: number | null } }>(entries: T[]): T[] {
  return [...entries].sort((a, b) => (b.campaign.createdAt ?? -1) - (a.campaign.createdAt ?? -1) || a.campaign.id.localeCompare(b.campaign.id));
}

export type HistorySummary = { campaigns: number; attempts: number; reached: number };

/** How many campaigns they were in, how many attempts were made, and in how many of them they were reached. */
export function summarizeHistory(entries: HistoryEntry[]): HistorySummary {
  return {
    campaigns: entries.length,
    attempts: entries.reduce((n, entry) => n + entry.call.attempts.length, 0),
    reached: entries.filter(entry => entry.call.outcome === "reached").length
  };
}

export type MannerCounts = Record<Manner, number> & { total: number };

/** Counts of each manner across attempts; anything that is not one of the three levels is ignored. */
export function mannerCounts(manners: unknown[]): MannerCounts {
  const counts: MannerCounts = { polite: 0, neutral: 0, rude: 0, total: 0 };
  for (const manner of manners) {
    if ((MANNERS as readonly unknown[]).includes(manner)) {
      counts[manner as Manner] += 1;
      counts.total += 1;
    }
  }
  return counts;
}

/** "3 polite · 1 neutral · 1 rude" (levels with none are left out), or "No ratings yet". */
export function mannerSummaryLine(counts: MannerCounts): string {
  if (counts.total === 0) return "No ratings yet";
  return MANNERS.filter(manner => counts[manner] > 0)
    .map(manner => `${counts[manner]} ${MANNER_LABELS[manner].toLowerCase()}`)
    .join(" · ");
}
