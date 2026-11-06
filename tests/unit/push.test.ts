import { describe, expect, it } from "vitest";
import { PUSH_KINDS, cleanKinds, cleanSubscription, deviceLabel, isAllowedPushEndpoint, pickPushTargets, pushPayload, type PushDevice } from "@/src/lib/push";

const P256DH = "B" + "a".repeat(86);
const AUTH = "a".repeat(22);

describe("push-service addresses (D36)", () => {
  it("accepts the known services", () => {
    for (const url of [
      "https://fcm.googleapis.com/fcm/send/abc",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QGx",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
      "https://us-east-1.push.services.mozilla.com/x"
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(true);
    }
  });

  it("refuses anything else", () => {
    for (const url of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://evil.example.com/fcm.googleapis.com",
      "https://fcm.googleapis.com.evil.com/x",
      "https://evilfcm.googleapis.com/x",
      "https://notify.windows.com/x",
      "https://user:pw@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost/x",
      "https://fcm.googleapis.com/x#frag",
      "not a url",
      "",
      "https://fcm.googleapis.com/" + "a".repeat(2100)
    ]) {
      expect(isAllowedPushEndpoint(url), url).toBe(false);
    }
    expect(isAllowedPushEndpoint(undefined)).toBe(false);
    expect(isAllowedPushEndpoint(42)).toBe(false);
  });

  it("allows only the named test host, and only when given", () => {
    expect(isAllowedPushEndpoint("https://127.0.0.1:4011/push/1")).toBe(false);
    expect(isAllowedPushEndpoint("https://127.0.0.1:4011/push/1", ["127.0.0.1"])).toBe(true);
    expect(isAllowedPushEndpoint("https://127.0.0.2:4011/push/1", ["127.0.0.1"])).toBe(false);
  });
});

describe("cleanSubscription", () => {
  it("keeps a well-formed subscription", () => {
    expect(cleanSubscription({ endpoint: "https://fcm.googleapis.com/x", keys: { p256dh: P256DH, auth: AUTH } })).toEqual({
      endpoint: "https://fcm.googleapis.com/x",
      p256dh: P256DH,
      auth: AUTH
    });
  });

  it("refuses missing, mistyped or oddly sized keys", () => {
    expect(cleanSubscription(null)).toBeNull();
    expect(cleanSubscription({ endpoint: "https://x", keys: {} })).toBeNull();
    expect(cleanSubscription({ endpoint: "https://x", keys: { p256dh: "short", auth: AUTH } })).toBeNull();
    expect(cleanSubscription({ endpoint: "https://x", keys: { p256dh: P256DH, auth: "bad auth!" } })).toBeNull();
    expect(cleanSubscription({ endpoint: 5, keys: { p256dh: P256DH, auth: AUTH } })).toBeNull();
  });
});

describe("deviceLabel", () => {
  it("names the browser and system", () => {
    expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36")).toBe("Chrome on Android");
    expect(deviceLabel("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36 Edg/126.0")).toBe("Edge on Windows");
    expect(deviceLabel("Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Version/17.5 Mobile/15E148 Safari/604.1")).toBe("Safari on iPhone or iPad");
    expect(deviceLabel("Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0")).toBe("Firefox on Linux");
    expect(deviceLabel(null)).toBe("This device");
  });
});

describe("pushPayload (D33)", () => {
  it("uses fixed words and a path on this site, nothing else", () => {
    expect(pushPayload("chat")).toEqual({ title: "GHMO", body: "New activity in Admin chat", url: "/admin/chat", tag: "ghmo-chat" });
    expect(pushPayload("thread").url).toBe("/admin/comms");
    expect(pushPayload("thread").url.startsWith("/")).toBe(true);
  });

  it("has fixed, content-free words and a site path for every kind that can push (14-B)", () => {
    expect(pushPayload("minutes_submitted")).toEqual({ title: "GHMO", body: "Minutes are waiting for approval", url: "/admin/minutes?mode=records", tag: "ghmo-minutes_submitted" });
    expect(pushPayload("broadcast_review")).toEqual({ title: "GHMO", body: "A broadcast is waiting for approval", url: "/admin/broadcasts", tag: "ghmo-broadcast_review" });
    expect(pushPayload("calls").url).toBe("/admin/my-calls");
    expect(pushPayload("security").url).toBe("/admin/security");
    const tags = new Set<string>();
    for (const kind of PUSH_KINDS) {
      const payload = pushPayload(kind);
      expect(payload.url.startsWith("/") && !payload.url.startsWith("//"), kind).toBe(true);
      expect(payload.title).toBe("GHMO");
      expect(payload.body.length).toBeGreaterThan(0);
      tags.add(payload.tag); // a different tag per kind, so one kind never replaces another in the tray
    }
    expect(tags.size).toBe(PUSH_KINDS.length);
  });
});

const device = (id: string, uid: string, kinds: string[] = ["chat", "thread"], endpoint = "https://fcm.googleapis.com/fcm/send/" + id): PushDevice => ({
  id,
  uid,
  endpoint,
  p256dh: P256DH,
  auth: AUTH,
  kinds
});
const admins = new Map([
  ["alice", { status: "active" }],
  ["bob", { status: "active" }],
  ["carol", { status: "disabled" }]
]);

describe("pickPushTargets (D34)", () => {
  it("skips the person who caused the activity", () => {
    const targets = pickPushTargets({ devices: [device("a1", "alice"), device("b1", "bob")], admins, actorUid: "alice", kind: "chat" });
    expect(targets.map(d => d.id)).toEqual(["b1"]);
  });

  it("includes every device of a person, and only those with the kind on", () => {
    const targets = pickPushTargets({
      devices: [device("b1", "bob"), device("b2", "bob", ["thread"]), device("b3", "bob", [])],
      admins,
      actorUid: "alice",
      kind: "chat"
    });
    expect(targets.map(d => d.id)).toEqual(["b1"]);
  });

  it("skips disabled admins and people who are not admins", () => {
    const targets = pickPushTargets({ devices: [device("c1", "carol"), device("d1", "dave")], admins, actorUid: "alice", kind: "chat" });
    expect(targets).toEqual([]);
  });

  it("skips a stored address that is no longer at a known push service", () => {
    const targets = pickPushTargets({ devices: [device("b1", "bob", ["chat"], "https://evil.example.com/x")], admins, actorUid: "alice", kind: "chat" });
    expect(targets).toEqual([]);
  });

  it("with onlyUids, targets just those people, the actor included", () => {
    const targets = pickPushTargets({ devices: [device("a1", "alice"), device("b1", "bob")], admins, actorUid: "alice", kind: "chat", onlyUids: ["alice"] });
    expect(targets.map(d => d.id)).toEqual(["a1"]);
  });
});

describe("cleanKinds", () => {
  it("defaults to every kind when none was asked", () => {
    expect(cleanKinds(undefined)).toEqual([...PUSH_KINDS]);
  });
  it("keeps only kinds that can push, in a fixed order", () => {
    expect(cleanKinds(["security", "thread", "calls", "chat", "nope", "members"])).toEqual(["chat", "thread", "calls", "security"]);
    expect(cleanKinds([])).toEqual([]);
  });
});
