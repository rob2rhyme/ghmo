/**
 * Search people and records from the admin palette (plan §27, Phase 20). Pure rules, shared by the index route and the
 * browser: what an index entry holds, how text is compared, how results are ranked, and where each kind opens.
 * Only plain-text names, titles and dates are indexed; nothing encrypted (D70).
 */

export const SEARCH_KINDS = ["member", "event", "minutes", "group", "position", "broadcast"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export type SearchEntry = {
  kind: SearchKind;
  id: string;
  /** What the row shows in bold: a name, title or subject. */
  title: string;
  /** A second line: an email, a date, a status or the holders' names. Searched too. */
  detail?: string;
  /** Marks shown beside the title, for example "Turned off" or "Draft". Not searched. */
  badge?: string;
  /** For ordering ties: newer first (dates as epoch milliseconds). */
  sortMs?: number;
};

export const KIND_LABELS: Record<SearchKind, string> = {
  member: "Members",
  event: "Events",
  minutes: "Minutes",
  group: "Groups",
  position: "Positions",
  broadcast: "Broadcasts"
};

/** Lower case, accents removed ("Śrī" → "sri"), punctuation as spaces, spaces collapsed. */
export function normalizeForSearch(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}@.]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** How well an entry matches, or null when it doesn't: every word must appear; earlier and word-start matches rank higher. */
export function scoreEntry(entry: Pick<SearchEntry, "title" | "detail">, words: string[]): number | null {
  if (words.length === 0) return null;
  const title = normalizeForSearch(entry.title);
  const all = `${title} ${normalizeForSearch(entry.detail ?? "")}`;
  let score = 0;
  for (const word of words) {
    const at = all.indexOf(word);
    if (at < 0) return null;
    const inTitle = title.indexOf(word);
    if (inTitle === 0) score += 0;
    else if (inTitle > 0 && /\s/.test(title[inTitle - 1])) score += 1;
    else if (inTitle > 0) score += 3;
    else score += 5;
  }
  return score;
}

export type SearchGroup = { kind: SearchKind; label: string; entries: SearchEntry[]; total: number };

/** The matches for a query, grouped in a fixed order of kinds, at most `perKind` each (D73). Needs at least 2 letters. */
export function matchRecords(index: SearchEntry[], query: string, perKind = 5): SearchGroup[] {
  const normalized = normalizeForSearch(query);
  if (normalized.replace(/\s/g, "").length < 2) return [];
  const words = normalized.split(" ").filter(Boolean);
  const byKind = new Map<SearchKind, { entry: SearchEntry; score: number }[]>();
  for (const entry of index) {
    const score = scoreEntry(entry, words);
    if (score === null) continue;
    const list = byKind.get(entry.kind) ?? [];
    list.push({ entry, score });
    byKind.set(entry.kind, list);
  }
  return SEARCH_KINDS.filter(kind => byKind.has(kind)).map(kind => {
    const ranked = (byKind.get(kind) ?? []).sort((a, b) => a.score - b.score || (b.entry.sortMs ?? 0) - (a.entry.sortMs ?? 0) || a.entry.title.localeCompare(b.entry.title));
    return { kind, label: KIND_LABELS[kind], entries: ranked.slice(0, perKind).map(item => item.entry), total: ranked.length };
  });
}

/** Where Enter goes for each kind (D75). */
export function searchHref(entry: Pick<SearchEntry, "kind" | "id">): string {
  const id = encodeURIComponent(entry.id);
  switch (entry.kind) {
    case "member":
      return `/admin/members/${id}`;
    case "event":
      return `/admin/events/${id}/edit`;
    case "minutes":
      return `/admin/minutes?mode=new&minutesId=${id}`;
    case "group":
      return `/admin/groups/${id}`;
    case "position":
      return "/admin/positions";
    case "broadcast":
      return `/admin/broadcasts/${id}`;
  }
}

/** "See all matching" for the lists that take a search (D73), or null. */
export function seeAllHref(kind: SearchKind, query: string): string | null {
  const q = encodeURIComponent(query.trim());
  if (kind === "member") return `/admin/members?q=${q}`;
  if (kind === "minutes") return `/admin/minutes?mode=records&q=${q}`;
  return null;
}
