import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";
import { describe, expect, it, vi } from "vitest";

/**
 * Runs public/sw.js against a small fake worker scope and fires push and notification-click events at it (plan §18).
 * The handlers are short and cannot be driven by a real push service in a test, so this covers their rules: only fixed
 * text is shown, and a tap can open only a page of this site.
 */
type Listener = (event: Record<string, unknown>) => void;

function loadWorker() {
  const listeners = new Map<string, Listener>();
  const shown: { title: string; options: Record<string, unknown> }[] = [];
  const opened: string[] = [];
  const windows: { url: string; focus: ReturnType<typeof vi.fn>; navigate: ReturnType<typeof vi.fn> }[] = [];
  const self = {
    location: { origin: "https://ghmo.example.org" },
    addEventListener: (type: string, listener: Listener) => listeners.set(type, listener),
    registration: { showNotification: async (title: string, options: Record<string, unknown>) => void shown.push({ title, options }) },
    clients: {
      matchAll: async () => windows,
      openWindow: async (url: string) => void opened.push(url),
      claim: async () => undefined
    },
    skipWaiting: async () => undefined
  };
  const context = vm.createContext({ self, URL, caches: {}, fetch: async () => undefined, Response, Promise });
  vm.runInContext(readFileSync(join(process.cwd(), "public/sw.js"), "utf8"), context);
  const fire = async (type: string, event: Record<string, unknown>) => {
    const waits: Promise<unknown>[] = [];
    listeners.get(type)?.({ ...event, waitUntil: (promise: Promise<unknown>) => waits.push(promise) });
    await Promise.all(waits);
  };
  return { fire, shown, opened, windows };
}

const pushEvent = (data: unknown) => ({ data: { json: () => (typeof data === "string" ? JSON.parse(data) : data) } });
const clickEvent = (url: unknown) => ({ notification: { close: vi.fn(), data: { url } } });
const fakeWindow = (url: string) => ({ url, focus: vi.fn(async () => undefined), navigate: vi.fn(async () => undefined) });

describe("service worker: push", () => {
  it("shows the fixed title and line with the tag and path it was sent", async () => {
    const { fire, shown } = loadWorker();
    await fire("push", pushEvent({ title: "GHMO", body: "New activity in Admin chat", url: "/admin/chat", tag: "ghmo-chat" }));
    expect(shown).toHaveLength(1);
    expect(shown[0].title).toBe("GHMO");
    expect(shown[0].options).toMatchObject({ body: "New activity in Admin chat", tag: "ghmo-chat", renotify: true, data: { url: "/admin/chat" } });
  });

  it("still shows a plain notification when the push can't be read, and never throws", async () => {
    const { fire, shown } = loadWorker();
    await fire("push", { data: { json: () => { throw new Error("bad json"); } } });
    await fire("push", { data: null });
    expect(shown.map(note => note.title)).toEqual(["GHMO", "GHMO"]);
    expect(shown[0].options.data).toEqual({ url: "/admin" });
  });

  it("keeps a path on this site only", async () => {
    const { fire, shown } = loadWorker();
    for (const url of ["https://evil.example.com/x", "//evil.example.com/x", "javascript:alert(1)", 5]) await fire("push", pushEvent({ title: "GHMO", body: "x", url }));
    expect(shown.map(note => (note.options.data as { url: string }).url)).toEqual(["/admin", "/admin", "/admin", "/admin"]);
  });
});

describe("service worker: tap", () => {
  it("opens a new window on the page when no window of the site is open", async () => {
    const { fire, opened } = loadWorker();
    const event = clickEvent("/admin/comms");
    await fire("notificationclick", event);
    expect(event.notification.close).toHaveBeenCalled();
    expect(opened).toEqual(["https://ghmo.example.org/admin/comms"]);
  });

  it("focuses and navigates a window of the site that is already open", async () => {
    const { fire, opened, windows } = loadWorker();
    const open = fakeWindow("https://ghmo.example.org/admin/members");
    windows.push(fakeWindow("https://other.example.com/"), open);
    await fire("notificationclick", clickEvent("/admin/chat"));
    expect(open.focus).toHaveBeenCalled();
    expect(open.navigate).toHaveBeenCalledWith("https://ghmo.example.org/admin/chat");
    expect(opened).toEqual([]);
  });

  it("never opens another site, whatever the notification carries", async () => {
    const { fire, opened } = loadWorker();
    await fire("notificationclick", clickEvent("https://evil.example.com/phish"));
    await fire("notificationclick", clickEvent("//evil.example.com/phish"));
    await fire("notificationclick", clickEvent(undefined));
    expect(opened).toEqual(["https://ghmo.example.org/admin", "https://ghmo.example.org/admin", "https://ghmo.example.org/admin"]);
  });
});
