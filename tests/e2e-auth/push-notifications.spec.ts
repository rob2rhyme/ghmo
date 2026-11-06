import crypto from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import type { Server } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { admin, clearEmulators, plainJson, seedAdmin, signInWithNewPasskey } from "./helpers";

/**
 * Push notifications (plan §18, 14-A). A local HTTPS stub stands in for a browser's push service. It checks what a real
 * one would receive: a VAPID signature that verifies against the site's public key, an encrypted body that only the
 * device's own key can open, and fixed content-free words inside it.
 */
const STUB_PORT = 4011;
const b64u = (buffer: Buffer) => buffer.toString("base64url");

type Received = { path: string; headers: Record<string, string | string[] | undefined>; body: Buffer };
const received: Received[] = [];
let stub: Server;
let certDir: string;

test.beforeAll(async () => {
  certDir = mkdtempSync(join(tmpdir(), "push-stub-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", join(certDir, "key.pem"), "-out", join(certDir, "cert.pem"), "-days", "1", "-subj", "/CN=127.0.0.1"], {
    stdio: "ignore"
  });
  stub = createHttpsServer({ key: readFileSync(join(certDir, "key.pem")), cert: readFileSync(join(certDir, "cert.pem")) }, (req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", chunk => chunks.push(chunk));
    req.on("end", () => {
      received.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
      // A device whose address starts with /gone has been removed by its owner, as a push service tells us with 410.
      res.writeHead((req.url ?? "").startsWith("/gone") ? 410 : 201).end();
    });
  });
  stub.listen(STUB_PORT, "127.0.0.1");
  await new Promise(resolve => stub.once("listening", resolve));
});
test.afterAll(async () => {
  await new Promise(resolve => stub.close(() => resolve(undefined)));
  rmSync(certDir, { recursive: true, force: true });
});

/** A device as a browser would create it: its own key pair and auth secret. */
function makeDevice(path: string) {
  const ecdh = crypto.createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = crypto.randomBytes(16);
  return {
    ecdh,
    auth,
    endpoint: `https://127.0.0.1:${STUB_PORT}${path}`,
    keys: { p256dh: b64u(ecdh.getPublicKey()), auth: b64u(auth) }
  };
}
type Device = ReturnType<typeof makeDevice>;

/** RFC 8291 / 8188 (aes128gcm): open a push body with the device's private key. */
function decrypt(device: Device, body: Buffer): string {
  const salt = body.subarray(0, 16);
  const idLength = body[20];
  const serverPublic = body.subarray(21, 21 + idLength);
  const cipher = body.subarray(21 + idLength);
  const shared = device.ecdh.computeSecret(serverPublic);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), device.ecdh.getPublicKey(), serverPublic]);
  const ikm = Buffer.from(crypto.hkdfSync("sha256", shared, device.auth, info, 32));
  const cek = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(crypto.hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const decipher = crypto.createDecipheriv("aes-128-gcm", cek, nonce);
  decipher.setAuthTag(cipher.subarray(cipher.length - 16));
  const padded = Buffer.concat([decipher.update(cipher.subarray(0, cipher.length - 16)), decipher.final()]);
  let end = padded.length - 1;
  while (end > 0 && padded[end] === 0) end -= 1; // padding zeros after the delimiter
  return padded.subarray(0, end).toString("utf8"); // the byte at `end` is the 0x02 delimiter
}

/** The VAPID header: `vapid t=<ES256 token>, k=<public key>`, checked against the site's own public key. */
function checkVapid(header: string | string[] | undefined, audience: string) {
  const match = /^vapid t=([\w-]+\.[\w-]+\.[\w-]+), k=([\w-]+)$/.exec(String(header));
  expect(match, "authorization header").not.toBeNull();
  const [, token, key] = match as RegExpExecArray;
  expect(key).toBe(process.env.VAPID_PUBLIC_KEY);
  const [head, claims, signature] = token.split(".");
  const publicBytes = Buffer.from(key, "base64url");
  const publicKey = crypto.createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(publicBytes.subarray(1, 33)), y: b64u(publicBytes.subarray(33)) }, format: "jwk" });
  const valid = crypto.verify("sha256", Buffer.from(`${head}.${claims}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url"));
  expect(valid, "VAPID signature verifies").toBe(true);
  const payload = JSON.parse(Buffer.from(claims, "base64url").toString("utf8"));
  expect(payload.aud).toBe(audience);
  expect(payload.sub).toBe("mailto:admin@example.org");
  expect(payload.exp * 1000).toBeGreaterThan(Date.now());
}

async function seedDevice(id: string, uid: string, device: Device, kinds = ["chat", "thread"]) {
  await admin().db.doc(`organizations/ghmo/pushSubscriptions/${id}`).set({
    uid,
    endpoint: device.endpoint,
    p256dh: device.keys.p256dh,
    auth: device.keys.auth,
    label: "Chrome on Android",
    kinds,
    createdAt: new Date(),
    lastSentAt: null
  });
}

test.beforeEach(async () => {
  received.length = 0;
  await clearEmulators();
  await seedAdmin("alice", "Alice", ["super_admin"]);
  await seedAdmin("bob", "Bob", ["admin"]);
  await seedAdmin("carol", "Carol", ["admin"]);
});

test("a chat message pushes a signed, encrypted, content-free alert to the other admins' devices, not the sender's", async ({ page }) => {
  const SECRET = "Quietly buy the old hall on Friday";
  const aliceDevice = makeDevice("/alice-phone");
  const bobPhone = makeDevice("/bob-phone");
  const bobLaptop = makeDevice("/bob-laptop");
  const carolDevice = makeDevice("/carol-phone");
  await seedDevice("a".repeat(32), "alice", aliceDevice);
  await seedDevice("b".repeat(32), "bob", bobPhone);
  await seedDevice("c".repeat(32), "bob", bobLaptop, ["thread"]); // chat switched off on this one
  await seedDevice("d".repeat(32), "carol", carolDevice);
  await admin().db.doc("organizations/ghmo/admins/carol").update({ status: "disabled" });

  await signInWithNewPasskey(page, "alice", "/admin/chat");
  const box = page.getByPlaceholder("Share an update or ask for help…");
  await box.fill(SECRET);
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("p", { hasText: SECRET })).toBeVisible();

  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  const push = received[0];
  expect(push.path).toBe("/bob-phone");
  checkVapid(push.headers.authorization, `https://127.0.0.1:${STUB_PORT}`);
  expect(push.headers["content-encoding"]).toBe("aes128gcm");
  expect(push.headers.ttl).toBe("3600");
  expect(push.headers.topic).toBe("chat");
  expect(push.body.toString("utf8")).not.toMatch(/old hall|Friday|Alice/);
  expect(JSON.parse(decrypt(bobPhone, push.body))).toEqual({ title: "GHMO", body: "New activity in Admin chat", url: "/admin/chat", tag: "ghmo-chat" });

  // The device last pushed to is marked; a second message inside the minute pushes nothing more.
  await expect.poll(async () => (await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"b".repeat(32)}`).get()).get("lastSentAt")).not.toBeNull();
  await box.fill("Another one");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("p", { hasText: "Another one" })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(received).toHaveLength(1);
});

test("a device the push service reports as gone is deleted", async ({ page }) => {
  await seedDevice("e".repeat(32), "bob", makeDevice("/gone-phone"));
  await signInWithNewPasskey(page, "alice", "/admin/chat");
  await page.getByPlaceholder("Share an update or ask for help…").fill("Hello");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  await expect.poll(async () => (await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"e".repeat(32)}`).get()).exists).toBe(false);
});

test("the device routes keep to your own devices, refuse forged addresses and keep the secrets in", async ({ page }) => {
  const mine = makeDevice("/alice-phone");
  const theirs = makeDevice("/bob-phone");
  await seedDevice("b".repeat(32), "bob", theirs);
  await signInWithNewPasskey(page, "alice", "/admin/security");
  const api = page.request;

  const initial = await (await api.get("/api/admin/push")).json();
  expect(initial.configured).toBe(true);
  expect(initial.publicKey).toBe(process.env.VAPID_PUBLIC_KEY);
  expect(initial.devices).toEqual([]);

  // A made-up address, a plain-http address and a private address are all refused.
  for (const endpoint of ["https://evil.example.com/push/1", "http://fcm.googleapis.com/fcm/send/x", "https://169.254.169.254/latest", `https://127.0.0.2:${STUB_PORT}/x`]) {
    const res = await api.post("/api/admin/push", { data: { subscription: { endpoint, keys: mine.keys } } });
    expect(res.status(), endpoint).toBe(400);
  }
  expect((await api.post("/api/admin/push", { data: { subscription: { endpoint: mine.endpoint, keys: { p256dh: "short", auth: "x" } } } })).status()).toBe(400);
  expect((await admin().db.collection("organizations/ghmo/pushSubscriptions").get()).size).toBe(1);

  const added = await api.post("/api/admin/push", { data: { subscription: { endpoint: mine.endpoint, keys: mine.keys }, kinds: ["chat", "calls"] } });
  expect(added.status()).toBe(200);
  const body = await added.json();
  expect(body.devices).toHaveLength(1);
  expect(body.devices[0]).toMatchObject({ kinds: ["chat", "calls"] }); // only kinds that can push are kept
  expect(JSON.stringify(body)).not.toContain(mine.keys.p256dh);
  expect(JSON.stringify(body)).not.toContain(mine.endpoint);
  const id = body.devices[0].id as string;

  // Adding the same device again is the same record.
  const again = await (await api.post("/api/admin/push", { data: { subscription: { endpoint: mine.endpoint, keys: mine.keys } } })).json();
  expect(again.devices).toHaveLength(1);
  expect(again.devices[0].kinds).toEqual(["chat", "thread", "minutes_submitted", "broadcast_review", "calls", "security"]);

  // Changing kinds works on your own device and 404s on someone else's.
  const patched = await (await api.patch("/api/admin/push", { data: { id, kinds: ["security", "thread", "members"] } })).json();
  expect(patched.devices[0].kinds).toEqual(["thread", "security"]); // "members" is not an alert, so it would be dropped
  expect((await api.patch("/api/admin/push", { data: { id: "b".repeat(32), kinds: [] } })).status()).toBe(404);
  expect((await api.delete("/api/admin/push", { data: { id: "b".repeat(32) } })).status()).toBe(404);
  expect((await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"b".repeat(32)}`).get()).exists).toBe(true);

  // A browser can name itself by its address to turn itself off.
  const removed = await api.delete("/api/admin/push", { data: { endpoint: mine.endpoint } });
  expect(removed.status()).toBe(200);
  expect((await removed.json()).devices).toEqual([]);
});

test("the Security card lists your devices, switches kinds and turns a device off", async ({ page }) => {
  await seedDevice("a".repeat(32), "alice", makeDevice("/alice-phone"));
  await signInWithNewPasskey(page, "alice", "/admin/security");
  const card = page.getByTestId("push-device");
  await expect(page.getByRole("heading", { name: /Push notifications on this device/ })).toBeVisible();
  await expect(card).toHaveCount(1);
  await expect(card).toContainText("Chrome on Android");
  await expect(card).toContainText("No alert has been sent to it yet.");

  const thread = card.getByLabel("New activity in Plans & Issues");
  await expect(thread).toBeChecked();
  await thread.click();
  await expect.poll(async () => (await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"a".repeat(32)}`).get()).get("kinds")).toEqual(["chat"]);

  await card.getByRole("button", { name: /Turn off/ }).click();
  await expect(card).toHaveCount(0);
  await expect.poll(async () => (await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"a".repeat(32)}`).get()).exists).toBe(false);
});

test("an admin who is turned off stops getting pushes", async ({ page }) => {
  await seedDevice("b".repeat(32), "bob", makeDevice("/bob-phone"));
  await admin().db.doc("organizations/ghmo/admins/bob").update({ status: "disabled" });
  await signInWithNewPasskey(page, "alice", "/admin/chat");
  await page.getByPlaceholder("Share an update or ask for help…").fill("Hello");
  await page.getByRole("button", { name: "Send", exact: true }).click();
  await expect(page.locator("p", { hasText: "Hello" })).toBeVisible();
  await page.waitForTimeout(2000);
  expect(received).toHaveLength(0);
});

test("14-B: a submitted broadcast pushes a content-free approval alert, and a device with that kind off gets nothing", async ({ page }) => {
  const SUBJECT = "Hall closed for repairs";
  const phone = makeDevice("/bob-phone");
  const laptop = makeDevice("/bob-laptop");
  await seedDevice("b".repeat(32), "bob", phone, ["chat", "broadcast_review"]);
  await seedDevice("c".repeat(32), "bob", laptop, ["chat"]); // the approval alert is switched off here
  await seedDevice("a".repeat(32), "alice", makeDevice("/alice-phone"), ["broadcast_review"]); // the submitter: never
  await signInWithNewPasskey(page, "alice", "/admin/broadcasts");

  const created = await page.request.post("/api/admin/broadcasts", { data: { subject: SUBJECT, body: "The hall is closed on Saturday for repairs." } });
  expect(created.status()).toBe(201);
  const id = (await created.json()).broadcast.id as string;
  const submitted = await page.request.patch(`/api/admin/broadcasts/${id}`, { data: { action: "submit" } });
  expect(submitted.status()).toBe(200);

  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  expect(received[0].path).toBe("/bob-phone");
  expect(received[0].headers.topic).toBe("broadcast_review");
  expect(received[0].body.toString("utf8")).not.toMatch(/Hall|repairs|Saturday/);
  expect(JSON.parse(decrypt(phone, received[0].body))).toEqual({
    title: "GHMO",
    body: "A broadcast is waiting for approval",
    url: "/admin/broadcasts",
    tag: "ghmo-broadcast_review"
  });
  await page.waitForTimeout(1500);
  expect(received).toHaveLength(1);
});

test("16-A: a plain admin is refused the super-admin routes, and can only read the site switch", async ({ page }) => {
  await seedDevice("b".repeat(32), "bob", makeDevice("/bob-phone"));
  await signInWithNewPasskey(page, "bob", "/admin/security");
  const api = page.request;
  expect((await api.get("/api/admin/push-devices")).status()).toBe(403);
  expect((await api.delete(`/api/admin/push-devices/${"b".repeat(32)}`)).status()).toBe(403);
  expect((await api.put("/api/admin/push-settings", { data: { enabled: false } })).status()).toBe(403);
  const read = await api.get("/api/admin/push-settings");
  expect(read.status()).toBe(200);
  expect(await read.json()).toMatchObject({ enabled: true, canChange: false });
  expect((await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"b".repeat(32)}`).get()).exists).toBe(true);
  expect((await admin().db.doc("organizations/ghmo/pushSettings/settings").get()).exists).toBe(false);
});

test("16-A: a super admin lists everyone's devices without addresses, and turns one off", async ({ page }) => {
  const bobPhone = makeDevice("/bob-phone");
  const carolPhone = makeDevice("/carol-phone");
  await seedDevice("b".repeat(32), "bob", bobPhone, ["chat", "calls"]);
  await seedDevice("c".repeat(32), "carol", carolPhone);
  await admin().db.doc("organizations/ghmo/admins/carol").update({ status: "disabled" });
  await signInWithNewPasskey(page, "alice", "/admin/security");
  const api = page.request;

  const listed = await api.get("/api/admin/push-devices");
  expect(listed.status()).toBe(200);
  const { devices } = await listed.json();
  expect(devices.map((d: { adminName: string }) => d.adminName)).toEqual(["Bob", "Carol"]);
  expect(devices[0]).toMatchObject({ id: "b".repeat(32), uid: "bob", adminActive: true, label: "Chrome on Android", kinds: ["chat", "calls"] });
  expect(devices[1]).toMatchObject({ uid: "carol", adminActive: false }); // listed so a lost device can be cleared before its owner is turned back on
  const raw = JSON.stringify(devices);
  expect(raw).not.toContain(bobPhone.endpoint);
  expect(raw).not.toContain(bobPhone.keys.p256dh);
  expect(raw).not.toContain(bobPhone.keys.auth);
  expect(raw).not.toContain("127.0.0.1");

  // Turn off Carol's device (her account is off; a lost phone would be cleared before she is re-enabled).
  expect((await api.delete(`/api/admin/push-devices/${"d".repeat(32)}`)).status()).toBe(404);
  expect((await api.delete("/api/admin/push-devices/not-an-id")).status()).toBe(404);
  const removed = await api.delete(`/api/admin/push-devices/${"c".repeat(32)}`);
  expect(removed.status()).toBe(200);
  expect((await removed.json()).devices.map((d: { uid: string }) => d.uid)).toEqual(["bob"]);
  expect((await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"c".repeat(32)}`).get()).exists).toBe(false);
  expect((await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"b".repeat(32)}`).get()).exists).toBe(true);

  const logged = await admin().db.collection("organizations/ghmo/auditLogs").where("action", "==", "push_device_removed").get();
  expect(logged.size).toBe(1);
  expect(logged.docs[0].data()).toMatchObject({ actor: { uid: "alice" }, resource: { id: "c".repeat(32) }, after: { ownerUid: "carol", label: "Chrome on Android" } });
  // (The entry holds the requester's IP address like every entry does; the device's own address would be https://127.0.0.1:4011/carol-phone.)
  expect(plainJson(logged.docs[0].data())).not.toMatch(/carol-phone|:4011|fcm\.googleapis|p256dh/);
});

test("16-A: switching push off for the site stops pushes at once, and switching on resumes them", async ({ page }) => {
  const bobPhone = makeDevice("/bob-phone");
  await seedDevice("b".repeat(32), "bob", bobPhone);
  await signInWithNewPasskey(page, "alice", "/admin/chat");
  const api = page.request;
  const box = page.getByPlaceholder("Share an update or ask for help…");
  const send = async (text: string) => {
    await box.fill(text);
    await page.getByRole("button", { name: "Send", exact: true }).click();
    await expect(page.locator("p", { hasText: text })).toBeVisible();
  };

  // On by default: a message pushes, and every admin sees the state.
  expect((await (await api.get("/api/admin/push")).json()).siteEnabled).toBe(true);

  const off = await api.put("/api/admin/push-settings", { data: { enabled: false } });
  expect(off.status()).toBe(200);
  expect(await off.json()).toMatchObject({ enabled: false, canChange: true });
  expect((await (await api.get("/api/admin/push")).json()).siteEnabled).toBe(false);

  // Off: a message sends no push, and the device is untouched.
  await send("While push is off");
  await page.waitForTimeout(2000);
  expect(received).toHaveLength(0);
  expect((await admin().db.doc(`organizations/ghmo/pushSubscriptions/${"b".repeat(32)}`).get()).exists).toBe(true);

  // On again: the next message pushes, with nobody repeating set-up.
  expect((await api.put("/api/admin/push-settings", { data: { enabled: true } })).status()).toBe(200);
  await send("Now push is back");
  await expect.poll(() => received.length, { timeout: 15_000 }).toBe(1);
  expect(JSON.parse(decrypt(bobPhone, received[0].body)).body).toBe("New activity in Admin chat");

  // Both changes are in the activity log, with the before and after.
  const logged = await admin().db.collection("organizations/ghmo/auditLogs").where("action", "==", "push_switched").get();
  const entries = logged.docs.map(doc => doc.data()).sort((a, b) => a.createdAt.toMillis() - b.createdAt.toMillis());
  expect(entries.map(entry => [entry.before, entry.after])).toEqual([
    [{ enabled: true }, { enabled: false }],
    [{ enabled: false }, { enabled: true }]
  ]);
  expect(entries.every(entry => entry.actor.uid === "alice")).toBe(true);
});
