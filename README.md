# Greater Harrisburg Magar Organization (Next.js + Firebase + GoFundMe Pro)

Single-community App Router site for GHMO with whitelist member access, admin PIN login, fundraising, document generation, and a multimedia hub.

## Current Focus
- Solidify single-community routing (`/`, `/login`, `/admin`) and remove orgSlug/tenant assumptions.
- Stabilize auth + env handling (NEXT_PUBLIC_FIREBASE_*).
- Multimedia aggregation page with Facebook/YouTube/TikTok/Instagram fallbacks.
- Timeline/Events system (admin authored, member visibility).

## Highlights
- One community (`ghmo-site`) backed by Firebase + GoFundMe Pro; no multi-tenant routing.
- Member whitelist + Firebase Auth magic link; admin login via PIN/custom token; session cookie set server-side.
- Modules: Home, Donate, GUMBA project timeline, Document Generator (PDF + PNG/JPEG), Admin dashboard (content/timeline/PINs/webhooks/audit), Multimedia hub.
- Audit logs for auth attempts, admin actions, document generations, webhook receipts, and reconciliations.

## Stack
- Next.js 14 App Router, TypeScript, TailwindCSS
- Firebase Client SDK (Auth/Firestore) + Firebase Admin SDK
- GoFundMe Pro webhook placeholder + reconcile endpoint
- @react-pdf/renderer + html-to-image for exports

## Routes
- Public: `/`, `/donate`, `/multimedia`
- Admin-only: `/admin`, `/admin/events`, `/admin/gumba-project`, `/admin/document-generator`
- Auth: `/login` (magic link), `/admin/login` (PIN)
- API: `/api/auth/send-login-link`, `/api/auth/post-auth`, `/api/auth/pin`, `/api/auth/session`, `/api/auth/dev/admin-session`, `/api/admin/*`, `/api/docgen/log`, `/api/gfmpro/*`

## Auth Flow
- Members: whitelist-only magic link. `/login` → `POST /api/auth/send-login-link` (generic response) → email link → `POST /api/auth/post-auth` re-checks whitelist and links `uid/emailLower` → session cookie via `/api/auth/session`.
- Admins: submit PIN to `POST /api/auth/pin` → receive custom token with `{ communityId, role }` → `/api/auth/session` sets cookies.
- Protected pages/APIs verify Firebase ID token server-side; member/admin routes query `organizations/ghmo/members` for `emailLower/status="active"`.
- Middleware only guards `/admin*` for presence of a session cookie; server components perform the real checks.

-## Data Model (single community)
- `organizations/ghmo` document: metadata, theme, GoFundMe config.
- Subcollections under `organizations/ghmo`:
-  - `members/{memberId}`: `emailLower`, optional `email`, optional `name`, `status` (active/disabled), `uid` (nullable until member auth is added), `roles`, `createdAt`, `updatedAt`.
-  - `pins/{pinId}`: `{ role, pinHash, status, failedAttempts, lockedUntil }`.
-  - `content/pages/home`: `{ blocks[] }`.
-  - `gumba/timeline/{entryId}`: timeline entries.
-  - `docgen/{templateId}` (Document Generator templates) and `docgen/generations/{genId}`.
-  - Seed templates by writing documents under `organizations/{orgSlug}/docgen` (e.g., `{ name: "Default Letter", letterhead: {...}, fields: ["Recipient", "Body"] }`) so the admin UI has options.
-  - `donations/stats` + `donations/webhookEvents/{eventId}`.
-  - `auditLogs/{logId}`.
- Legacy community paths are no longer supported; please migrate any old data into `organizations/{orgSlug}`.

## Multi-Admin + Email Login Plan

- **Stage 1 (Admins):** Extend `/api/auth/pin` + `/api/auth/session` while introducing `/api/auth/email/start` and `/api/auth/email/verify` for allowlisted `organizations/{orgSlug}/admins`. Implement `requireActiveAdmin(orgSlug)` guards, keep `FEATURE_PIN_LOGIN` fallback, and log everything via `logAuditEvent`.
- **Dev login (local only):** Firebase email-link quotas can trip during development. Keep `FEATURE_PIN_LOGIN=true` for a fallback, and enable `NEXT_PUBLIC_DEV_LOGIN=true` + `DEV_LOGIN_SECRET` (and optionally share it via `NEXT_PUBLIC_DEV_LOGIN_SECRET` locally) so you can call `POST /api/auth/dev/admin-session` to mint a session on demand. This route only runs when `NODE_ENV !== "production"`, requires the secret, and should never be enabled in production.
- **Stage 2 (Members schema readiness):** Ensure `organizations/{orgSlug}/members` docs expose name/status/uid fields, keep admin CRUD, and reuse the same email start/verify endpoints (feature-gated for members). No member-only routes yet.
- **Stage 3 (Future):** Wire member-only pages/routes, enforce member guards, expand member audit logging, and phase out PIN login once email flows stabilize.
- **Environments:** Stage 1 requires `FEATURE_EMAIL_ADMIN_LOGIN=true` (plus `NEXT_PUBLIC_FEATURE_EMAIL_ADMIN_LOGIN=true` for the login UI) and the existing Firebase client keys (`NEXT_PUBLIC_FIREBASE_API_KEY`, etc.). Keep `FEATURE_PIN_LOGIN`/`NEXT_PUBLIC_FEATURE_PIN_LOGIN` toggled to control whether PIN login remains available while the email flow rolls out. Admin login now hits `/api/auth/email/start` and `/api/auth/email/verify` as part of the email link flow.

## GoFundMe Pro
- Set `NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET` to inject the install script when enabled.
- Configure campaign IDs under `community.gofundmePro.campaignIds[]`; `/donate` and `/` render the embed.
- Webhook: point GoFundMe Pro to `/api/gfmpro/webhook` with `GOFUNDME_PRO_WEBHOOK_SECRET`.
- Reconcile: call `/api/gfmpro/reconcile` (admin-only) manually or via scheduler.

## Multimedia
- Server-side fetchers with caching (5m) and graceful fallbacks.
- Env placeholders:
  - Facebook: `FACEBOOK_PAGE_ID`, `FACEBOOK_GRAPH_TOKEN`, `FACEBOOK_PAGE_URL`
  - YouTube: `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`, `YOUTUBE_CHANNEL_URL`
  - TikTok: `TIKTOK_PROFILE_URL`, `TIKTOK_FEATURE_THUMBNAIL`
  - Instagram: `INSTAGRAM_PROFILE_URL`, `INSTAGRAM_FEATURE_THUMBNAIL`
- Without tokens, the page renders embeds/profile links and curated placeholder cards.

## Getting Started
1) Install deps: `npm install`
2) Copy envs: `cp .env.example .env.local` and fill Firebase client config, Admin service account fields, GoFundMe secrets, social handles.
3) Run dev server: `npm run dev`
4) Seed admin PINs via `/api/admin/pins` (or add a UI hook). Whitelist members in `organizations/ghmo/members` with `emailLower` set.
5) Configure GoFundMe Pro webhook + reconcile schedule when ready.

## Security Notes
- PINs are bcrypt-hashed; lockout enforced on `/api/auth/pin`.
- Magic-link endpoints are rate-limited and always return generic responses to avoid enumeration.
- Firebase email-link quotas can also block a developer’s ability to test the admin UI; keep `FEATURE_PIN_LOGIN` active and optionally use the local `POST /api/auth/dev/admin-session` route with `DEV_LOGIN_SECRET` + `NEXT_PUBLIC_DEV_LOGIN` until the quota resets. This route is disabled in production—do not expose the secret outside of a trusted dev environment.
- Webhooks validated via shared-secret HMAC placeholder; replace with provider verification if supplied.
- Firebase rules: see `firestore.rules` for a draft locked to `organizations/ghmo` paths.

## Reset Build Artifacts & Start Dev Server

If you encounter caching or build issues, run the following commands to fully reset the local environment and restart the development server:

```bash
rm -rf .next
rm -rf node_modules/.cache
rm -rf .turbo
npm run dev
```
