import crypto from "node:crypto";
import { defineConfig, devices } from "@playwright/test";

// Full sign-in flows against the Firebase emulators. Run with `npm run test:e2e:auth`
// (wraps this in `firebase emulators:exec` and builds the app with emulator settings first).
const PORT = Number(process.env.E2E_AUTH_PORT ?? 3300);

const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

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
