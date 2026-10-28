import crypto from "node:crypto";
import { expect, test } from "@playwright/test";
import { signUnsubscribeToken } from "../../src/lib/unsubscribeToken";
import { admin, clearEmulators, collectCspViolations } from "./helpers";

const members = () => admin().db.collection("organizations/ghmo/members");
const byEmail = async (email: string) => (await members().where("emailLower", "==", email).get()).docs[0]?.data();
const auditActions = async () => (await admin().db.collection("organizations/ghmo/auditLogs").get()).docs.map(doc => doc.data().action);

const serverKey = () => Buffer.from(process.env.DOCGEN_SIGNATURE_ENC_KEY_BASE64 ?? "", "base64");
const tokenFor = (id: string) => signUnsubscribeToken(id, [serverKey()]);

const secret = Buffer.from("test-webhook-secret-bytes");
function signedWebhook(payload: unknown, overrides: { secret?: Buffer; timestamp?: string } = {}) {
  const body = JSON.stringify(payload);
  const id = `msg_${crypto.randomUUID()}`;
  const timestamp = overrides.timestamp ?? String(Math.floor(Date.now() / 1000));
  const signature = crypto.createHmac("sha256", overrides.secret ?? secret).update(`${id}.${timestamp}.${body}`).digest("base64");
  return { body, headers: { "svix-id": id, "svix-timestamp": timestamp, "svix-signature": `v1,${signature}`, "content-type": "application/json" } };
}

test.beforeEach(async () => {
  await clearEmulators();
  await members().doc("m1").set({ email: "sam@example.org", emailLower: "sam@example.org", status: "active", roles: ["member"], emailConsent: { source: "imported" } });
  await members().doc("m2").set({ email: "pat@example.org", emailLower: "pat@example.org", status: "active", roles: ["member"], emailConsent: { source: "imported" } });
});

test("opening the unsubscribe page changes nothing; pressing the button opts the member out", async ({ page }) => {
  const violations = collectCspViolations(page);
  await page.goto(`/unsubscribe?token=${encodeURIComponent(tokenFor("m1"))}`);
  await expect(page.getByRole("heading", { name: "Stop these emails" })).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect((await byEmail("sam@example.org"))?.emailOptOutAt).toBeUndefined();

  await page.getByRole("button", { name: "Unsubscribe me" }).click();
  await expect(page.getByRole("status")).toContainText("You're unsubscribed");
  expect((await byEmail("sam@example.org"))?.emailOptOutAt).toBeTruthy();
  expect((await byEmail("pat@example.org"))?.emailOptOutAt).toBeUndefined();
  expect(await auditActions()).toContain("member_email_opt_out");
  expect(violations).toEqual([]);
});

test("a forged or damaged link shows a plain message and no button", async ({ page }) => {
  const token = tokenFor("m1");
  await page.goto(`/unsubscribe?token=${encodeURIComponent(`m2.${token.slice(token.lastIndexOf(".") + 1)}`)}`);
  await expect(page.getByText("This link is not valid")).toBeVisible();
  await expect(page.getByRole("button", { name: "Unsubscribe me" })).toHaveCount(0);
  await page.goto("/unsubscribe");
  await expect(page.getByText("This link is not valid")).toBeVisible();
  expect((await byEmail("pat@example.org"))?.emailOptOutAt).toBeUndefined();
});

test("one-click unsubscribe from a mail app works with the token in the URL, keeps the first opt-out time, and refuses GET", async ({ request }) => {
  const url = `/api/unsubscribe?token=${encodeURIComponent(tokenFor("m1"))}`;
  expect((await request.get(url)).status()).toBe(405);
  expect((await byEmail("sam@example.org"))?.emailOptOutAt).toBeUndefined();

  const res = await request.post(url, { form: { "List-Unsubscribe": "One-Click" } });
  expect(res.status()).toBe(200);
  const first = (await byEmail("sam@example.org"))?.emailOptOutAt;
  expect(first).toBeTruthy();

  expect((await request.post(url)).status()).toBe(200);
  expect((await byEmail("sam@example.org"))?.emailOptOutAt.toMillis()).toBe(first.toMillis());
  expect((await auditActions()).filter(action => action === "member_email_opt_out")).toHaveLength(1);

  expect((await request.post("/api/unsubscribe?token=m1.forged")).status()).toBe(400);
  expect((await byEmail("pat@example.org"))?.emailOptOutAt).toBeUndefined();
});

test("the Resend webhook marks hard bounces and complaints, ignores soft bounces and unknown addresses, and checks the signature", async ({ request }) => {
  const send = (payload: unknown, overrides?: Parameters<typeof signedWebhook>[1]) => {
    const { body, headers } = signedWebhook(payload, overrides);
    return request.post("/api/resend/webhook", { data: body, headers });
  };

  expect((await send({ type: "email.bounced", data: { to: ["sam@example.org"], bounce: { type: "Transient" } } })).status()).toBe(200);
  expect((await byEmail("sam@example.org"))?.emailBounced).toBeUndefined();

  expect((await send({ type: "email.bounced", data: { to: ["Sam@Example.org"], bounce: { type: "Permanent" } } })).status()).toBe(200);
  expect((await byEmail("sam@example.org"))?.emailBounced).toBe(true);

  expect((await send({ type: "email.complained", data: { to: ["pat@example.org"] } })).status()).toBe(200);
  expect((await byEmail("pat@example.org"))?.emailOptOutAt).toBeTruthy();

  expect((await send({ type: "email.bounced", data: { to: ["stranger@example.org"], bounce: { type: "Permanent" } } })).status()).toBe(200);
  expect((await send({ type: "email.delivered", data: { to: ["sam@example.org"] } })).status()).toBe(200);
  expect((await members().get()).size).toBe(2);

  await members().doc("m2").update({ emailOptOutAt: null });
  expect((await send({ type: "email.complained", data: { to: ["pat@example.org"] } }, { secret: Buffer.from("wrong") })).status()).toBe(401);
  expect((await send({ type: "email.complained", data: { to: ["pat@example.org"] } }, { timestamp: "1" })).status()).toBe(401);
  expect((await request.post("/api/resend/webhook", { data: "{}" })).status()).toBe(401);
  expect((await byEmail("pat@example.org"))?.emailOptOutAt).toBeNull();

  const actions = await auditActions();
  expect(actions).toContain("member_email_bounced");
  expect(actions).toContain("member_email_opt_out");
});
