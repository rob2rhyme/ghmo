import { expect, test } from "@playwright/test";
import { clearEmulators } from "./helpers";

test.beforeEach(async () => {
  await clearEmulators();
});

test("passkey sign-in says plainly when the site is opened at a different address", async ({ request }) => {
  const wrong = await request.post("/api/auth/passkey/login/options", { headers: { "x-forwarded-host": "wrong.example.org" } });
  expect(wrong.status()).toBe(409);
  const body = (await wrong.json()) as { error: string; code: string };
  expect(body.code).toBe("wrong_address");
  expect(body.error).toContain("wrong.example.org");
  expect(body.error).toContain("NEXT_PUBLIC_APP_URL");

  // The normal address still works.
  const ok = await request.post("/api/auth/passkey/login/options");
  expect(ok.status()).toBe(200);
});
