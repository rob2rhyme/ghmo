import crypto from "node:crypto";
import { defineConfig, devices } from "@playwright/test";
import webpush from "web-push";

// Full sign-in flows against the Firebase emulators. Run with `npm run test:e2e:auth`
// (wraps this in `firebase emulators:exec` and builds the app with emulator settings first).
const PORT = Number(process.env.E2E_AUTH_PORT ?? 3300);

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

// Push notifications (plan §18): a fresh VAPID pair for every run, shared with the test workers the same way. The push
// tests start a local HTTPS stub that stands in for a browser's push service; this flag lets the server call it (it is
// honoured only in this emulator build, never on a production deployment).
const vapid = process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY } : webpush.generateVAPIDKeys();

export const EMULATOR_ENV = {
  FIREBASE_ADMIN_PROJECT_ID: "demo-ghmo",
  FIREBASE_ADMIN_CLIENT_EMAIL: "test@demo-ghmo.iam.gserviceaccount.com",
  FIREBASE_ADMIN_PRIVATE_KEY: privateKey,
  GCLOUD_PROJECT: "demo-ghmo",
  FIREBASE_AUTH_EMULATOR_HOST: process.env.FIREBASE_AUTH_EMULATOR_HOST ?? "127.0.0.1:9099",
  FIRESTORE_EMULATOR_HOST: process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080",
  NEXT_PUBLIC_FIREBASE_API_KEY: "fake-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: "demo-ghmo",
  NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true",
  FEATURE_EMAIL_ADMIN_LOGIN: "true",
  // A fresh throwaway key for every run.
  CERTIFICATE_SIGNING_KEY_BASE64: crypto.randomBytes(32).toString("base64"),
  // Server data-encryption key (authenticator-app seeds, collected signatures), also fresh every run. The
  // test workers load this file again, so they reuse the value the first load put in the environment;
  // tests that sign things the server must accept (unsubscribe links) rely on it.
  DOCGEN_SIGNATURE_ENC_KEY_BASE64: process.env.DOCGEN_SIGNATURE_ENC_KEY_BASE64 || crypto.randomBytes(32).toString("base64"),
  // Notification emails go to a stub server that the notifications test starts on this port.
  RESEND_API_KEY: "test-key",
  NOTIFY_FROM_EMAIL: "GHMO <no-reply@example.org>",
  MAIL_API_URL: "http://127.0.0.1:4010/emails",
  BROADCAST_ORG_NAME: "Test Org",
  FEATURE_BROADCASTS: "true",
  // The daily digest's schedule calls /api/cron/task-digest with this secret. A fresh throwaway value every run
  // (the test workers reuse what the first load put in the environment), so no secret-looking text is committed.
  CRON_SECRET: process.env.CRON_SECRET || crypto.randomBytes(24).toString("hex"),
  VAPID_PUBLIC_KEY: vapid.publicKey,
  VAPID_PRIVATE_KEY: vapid.privateKey,
  VAPID_SUBJECT: "mailto:admin@example.org",
  PUSH_TEST_ALLOW_INSECURE: "true",
  BROADCAST_CHUNK_SIZE: "2",
  BROADCAST_POSTAL_ADDRESS: "1 Main Street, Springfield",
  RESEND_WEBHOOK_SECRET: "whsec_" + Buffer.from("test-webhook-secret-bytes").toString("base64")
};
Object.assign(process.env, EMULATOR_ENV);

export default defineConfig({
  testDir: "tests/e2e-auth",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  reporter: process.env.CI ? [["github"], ["list"]] : "list",
  use: {
    // The service worker is tested on its own (pwa.spec.ts); elsewhere it would only add caching noise.
    serviceWorkers: "block",
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } : undefined
  },
  // Virtual authenticators are a Chromium feature.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: `http://localhost:${PORT}/admin/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: EMULATOR_ENV
  }
});
