import type { CampaignCounts, CampaignStatus, Outcome, Rsvp } from "@/src/lib/callCampaigns";

/** Shapes the campaign API returns to the browser (dates as epoch milliseconds, script as an envelope or null). */
export type CampaignView = {
  id: string;
  title: string;
  eventId: string | null;
  eventTitle: string | null;
  script?: unknown;
  dueAt: number | null;
  status: CampaignStatus;
  createdBy: string;
  createdAt: number | null;
  closedBy: string | null;
  closedAt: number | null;
  treeVersion: number;
  counts: CampaignCounts;
};

export type AttemptView = { id: string; at: number | null; outcome: Outcome; byUid: string; note?: unknown };

export type CallView = {
  memberId: string;
  callerUid: string;
  outcome: Outcome | null;
  rsvp: Rsvp | null;
  attemptCount: number;
  attempts: AttemptView[];
  updatedAt: number | null;
};

export type MemberLite = {
  id: string;
  name?: string | null;
  emailLower: string;
  status?: "active" | "disabled";
  hasPhone?: boolean;
  contact?: unknown;
  callOptOutAt?: unknown;
};

export const memberLabel = (m: MemberLite | undefined, fallback: string) => (m ? m.name || m.emailLower : fallback);

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { cache: "no-store", headers: { "Content-Type": "application/json" }, ...init });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/** A random id for a campaign or an attempt, chosen in the browser because envelopes are bound to it. */
export function newId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), byte => alphabet[byte % alphabet.length]).join("");
}

export function formatWhen(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" });
}

export function formatDay(ms: number | null | undefined): string {
  if (!ms) return "";
  return new Date(ms).toLocaleDateString("en-US", { dateStyle: "medium" });
}
