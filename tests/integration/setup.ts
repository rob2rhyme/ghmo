import crypto from "node:crypto";

// Firebase Admin needs credentials in a valid format even against the emulators.
// Generate a throwaway key per run; nothing here talks to real Google services.
const { privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" }
});

process.env.FIREBASE_ADMIN_PROJECT_ID ??= "demo-ghmo";
process.env.FIREBASE_ADMIN_CLIENT_EMAIL ??= "test@demo-ghmo.iam.gserviceaccount.com";
process.env.FIREBASE_ADMIN_PRIVATE_KEY ??= privateKey;
process.env.GCLOUD_PROJECT ??= "demo-ghmo";
process.env.FIREBASE_AUTH_EMULATOR_HOST ??= "127.0.0.1:9099";
process.env.FIRESTORE_EMULATOR_HOST ??= "127.0.0.1:8080";
