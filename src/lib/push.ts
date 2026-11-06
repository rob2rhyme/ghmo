import { notificationCopy, type NotificationKind } from "./notifications";

/**
 * Pure rules for push notifications (plan §18, Phase 14). No network, no database: which devices get a push, what the
 * notification says, which push-service addresses the server will call, and how a device is described.
 *
 * A push says that something happened, never what (D33): the same fixed words as the email, and a page to open.
 */

/**
 * Every alert can push, in the order the Security card lists them. A device switches each kind on or off on its own
 * (plan §18, 14-B). A device that was switched on before a kind existed keeps its own list, so a new kind is off for it
 * until its owner switches it on.
 */
export const PUSH_KINDS = ["chat", "thread", "minutes_submitted", "broadcast_review", "calls", "security"] as const satisfies readonly NotificationKind[];
export type PushKind = (typeof PUSH_KINDS)[number];

export const isPushKind = (kind: string): kind is PushKind => (PUSH_KINDS as readonly string[]).includes(kind);

export const MAX_DEVICES_PER_ADMIN = 10;
/** At most one push per person per kind in this window (D34). */
export const PUSH_THROTTLE_MS = 60 * 1000;
/** How long a push service holds a notification for a device that is offline. */
export const PUSH_TTL_SECONDS = 60 * 60;

/** Known push services (D36). A made-up address must not make the server call an arbitrary site. */
const EXACT_HOSTS = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"];
const SUFFIX_HOSTS = [".push.services.mozilla.com", ".notify.windows.com", ".push.apple.com"];

/**
 * True only for an https address with no sign-in details or odd port at a known push service. `testHosts` is for the
 * browser tests' local stub and is empty in production.
 */
export function isAllowedPushEndpoint(endpoint: unknown, testHosts: readonly string[] = []): boolean {
  if (typeof endpoint !== "string" || endpoint.length === 0 || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || url.hash) return false;
  const host = url.hostname.toLowerCase();
  if (testHosts.includes(host)) return true;
  if (url.port) return false;
  if (EXACT_HOSTS.includes(host)) return true;
  return SUFFIX_HOSTS.some(suffix => host.endsWith(suffix) && host.length > suffix.length);
}

const BASE64URL = /^[A-Za-z0-9_-]+$/;

export type PushKeys = { endpoint: string; p256dh: string; auth: string };

/** The three things a browser hands over when a device subscribes, checked for shape (not yet for host). */
export function cleanSubscription(input: unknown): PushKeys | null {
  if (!input || typeof input !== "object") return null;
  const source = input as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } };
  const { endpoint } = source;
  const p256dh = source.keys?.p256dh;
  const auth = source.keys?.auth;
  if (typeof endpoint !== "string" || typeof p256dh !== "string" || typeof auth !== "string") return null;
  // A P-256 public key is 65 bytes (87 base64url characters); the auth secret is 16 bytes (22 characters).
  if (!BASE64URL.test(p256dh) || p256dh.length !== 87) return null;
  if (!BASE64URL.test(auth) || auth.length < 16 || auth.length > 24) return null;
  return { endpoint, p256dh, auth };
}

/** A short name for a device from its user agent, for the list on the Security page. */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const os = /iPhone|iPad|iPod/.test(ua) ? "iPhone or iPad" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "Mac" : /CrOS/.test(ua) ? "ChromeOS" : /Linux/.test(ua) ? "Linux" : null;
  const browser = /Edg\//.test(ua) ? "Edge" : /OPR\/|Opera/.test(ua) ? "Opera" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\/|FxiOS/.test(ua) ? "Firefox" : /Chrome\/|CriOS/.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "This device";
}

/** What the service worker shows. `url` is a path on this site, so a tap can only open our own pages. */
export type PushPayload = { title: string; body: string; url: string; tag: string };

export function pushPayload(kind: PushKind): PushPayload {
  const copy = notificationCopy(kind);
  return { title: "GHMO", body: copy.subject, url: copy.path, tag: `ghmo-${kind}` };
}

export type PushDevice = { id: string; uid: string; endpoint: string; p256dh: string; auth: string; kinds: string[] };
export type PushAdmin = { status?: string };

/**
 * The devices to push to: an active admin's devices that have this kind switched on, never the person who caused the
 * activity (unless `onlyUids` names them, as for a reminder), and only at known push-service addresses.
 */
export function pickPushTargets(input: {
  devices: PushDevice[];
  admins: Map<string, PushAdmin>;
  actorUid: string;
  kind: PushKind;
  onlyUids?: string[];
  testHosts?: readonly string[];
}): PushDevice[] {
  const only = input.onlyUids ? new Set(input.onlyUids) : null;
  return input.devices.filter(device => {
    if (only ? !only.has(device.uid) : device.uid === input.actorUid) return false;
    if (input.admins.get(device.uid)?.status !== "active") return false;
    if (!device.kinds.includes(input.kind)) return false;
    return isAllowedPushEndpoint(device.endpoint, input.testHosts);
  });
}

/** Kinds from a request, kept to the ones that can push; an empty list means "all" only when nothing was asked. */
export function cleanKinds(input: unknown): PushKind[] {
  if (!Array.isArray(input)) return [...PUSH_KINDS];
  return PUSH_KINDS.filter(kind => input.includes(kind));
}

/** What an alert says, for lists on the Security page: the very words the notification shows. */
export const pushKindLabel = (kind: string): string => (isPushKind(kind) ? notificationCopy(kind).subject : kind);
