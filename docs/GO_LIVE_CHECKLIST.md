# Go-live checklist (owner)

Everything here needs a person with access to Firebase, Vercel or GitHub settings. It collects the "owner actions" from every phase of `docs/PROJECT_PLAN.md` in the order to do them. Tick each box and note the date.

## 1. Hosting and settings (Vercel / Firebase)

- [ ] **Environment variables are set** in Vercel for Production: all `NEXT_PUBLIC_FIREBASE_*`, `FIREBASE_ADMIN_PROJECT_ID`, `FIREBASE_ADMIN_CLIENT_EMAIL`, `FIREBASE_ADMIN_PRIVATE_KEY`, and `NEXT_PUBLIC_APP_URL` (the exact production origin; passkeys are bound to it).
- [ ] `DOCGEN_SIGNATURE_ENC_KEY_BASE64` is set (**required**: authenticator-app sign-in encrypts its seeds with a key derived from it). `CERTIFICATE_SIGNING_KEY_BASE64` is set (`openssl rand -base64 32`) and backed up with your other secrets; losing it invalidates every certificate QR code.
- [ ] **Removed from production:** `FEATURE_PIN_LOGIN`, `ALLOW_DEV_ADMIN_LOGIN`, `NEXT_PUBLIC_ALLOW_DEV_ADMIN_LOGIN`, `DEV_ADMIN_LOGIN_TOKEN`. Old `organizations/ghmo/pins` documents are deleted.
- [ ] **Never** point a local or dev environment at the production Firebase project.
- [ ] `TRUSTED_PROXY_HOPS` matches the real proxy chain (on Vercel the default `x-real-ip` handling applies; confirm after deploying).
- [x] **One address for everything.** Pick the address people use (for example `https://ghmo.rob2rhyme.app`) and set `NEXT_PUBLIC_APP_URL` to exactly that in Vercel (Production, no trailing slash), then **redeploy**. Passkeys are tied to that domain, and sign-in emails link to it. If you open the site at a different address, passkey sign-in now says so in plain words.
- [ ] In Vercel → Domains, make the other addresses (such as `ghmo.vercel.app`) redirect to that one.
- [x] Firebase Auth → Settings → Authorized domains lists that domain (and only your real domains).
- [ ] Node version in Vercel is 22 or later (the app requires `>=22.12`).
- [ ] Optional: Resend account, verified sending domain, `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL`. Each admin then opts in under Admin → Security.

## 2. Firestore

- [ ] Deploy the rules: `npx firebase deploy --only firestore:rules` (or paste `firestore.rules` into the console). Redeploy after every release that changes them.
- [ ] TTL policies on the field `expiresAt` for the collection groups `rateLimits` and `webauthnChallenges`.
- [ ] Delete Firestore backups and exports made **before** encryption was turned on (they contain plaintext), and review who can still read the Firebase console.

## 3. GitHub

- [ ] Branch protection on `main`, requiring the CI, CodeQL and secret-scan checks.
- [x] Dependabot alerts page shows no open alerts (rescan from Insights → Dependency graph → Dependabot if it looks stale).

## 4. People and keys

- [ ] At least two admins are active.
- [ ] Each admin signs in once at `/admin/login` (email link), sets up the **authenticator app** (scan the QR code, type the first code) and saves the 8 recovery codes **somewhere other than their email**. A passkey is optional. Everyone has to sign in again after the session change.
- [ ] A super admin opens Admin → Encryption and runs setup **with both trustees present**; each takes a paper copy of the recovery key straight away.
- [ ] Every other admin sets up each of their devices; another admin approves each after comparing the **safety code and the workspace fingerprint** by phone or in person.
- [ ] **Existing workspace (encryption was already on before the signed device list):** a super admin presses **Seal the device list** once, after checking every listed device with its owner.
- [ ] Encryption is on and every admin has an approved device; then a super admin runs **Encrypt existing records** once and keeps the page open until it says Done.
- [ ] Any signatures collected before encryption was turned on were finalized or discarded.

## 5. Assurance (outside this codebase)

- [ ] **External review** of `src/lib/e2ee/` and the key routes by someone qualified in applied cryptography, including the signed device list.
- [ ] **Penetration test** of sign-in (passkeys, magic link), sessions and public pages on the real deployment.
- [ ] **Key-rotation drill** (`docs/KEY_ROTATION_DRILL.md`) and **recovery-key test** with both trustees; record the dates here: ____________.
- [ ] Fill in names and phone numbers in `docs/RUNBOOK_INCIDENT.md`, print it, and keep it with the recovery keys.
- [ ] Calendar reminder: test the recovery key every year (Admin → Encryption → Test).

## 6. After going live

- [ ] Open `/admin/login`, `/admin`, `/admin/encryption`, `/minutes` and a public page in a normal browser window with the console open. There should be no red errors.
- [ ] If the Encryption page shows "The device list failed its integrity check", stop and follow `docs/RUNBOOK_INCIDENT.md` case E.
