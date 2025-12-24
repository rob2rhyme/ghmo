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
- Member-gated: `/gumba-project`, `/document-generator`
- Auth: `/login` (magic link), `/admin/login` (PIN)
- Admin dashboard: `/admin`
- API: `/api/auth/send-login-link`, `/api/auth/post-auth`, `/api/auth/pin`, `/api/auth/session`, `/api/admin/*`, `/api/docgen/log`, `/api/gfmpro/*`

## Auth Flow
- Members: whitelist-only magic link. `/login` → `POST /api/auth/send-login-link` (generic response) → email link → `POST /api/auth/post-auth` re-checks whitelist and links `uid/emailLower` → session cookie via `/api/auth/session`.
- Admins: submit PIN to `POST /api/auth/pin` → receive custom token with `{ communityId, role }` → `/api/auth/session` sets cookies.
- Protected pages/APIs verify Firebase ID token server-side; member routes query `community/ghmo-site/members` for `emailLower/status="active"`.
- Middleware only guards `/admin*` for presence of a session cookie; server components perform the real checks.

## Data Model (single community)
- `community/ghmo-site` document: metadata, theme, GoFundMe config.
- Subcollections under `community/ghmo-site`:
  - `members/{memberId}`: `emailLower` (lowercased), `email`, `uid`, `status`, `roles`.
  - `pins/{pinId}`: `{ role, pinHash, status, failedAttempts, lockedUntil }`.
  - `content/pages/home`: `{ blocks[] }`.
  - `gumba/timeline/{entryId}`: timeline entries.
  - `docgen/templates/{templateId}` and `docgen/generations/{genId}`.
  - `donations/stats` + `donations/webhookEvents/{eventId}`.
  - `auditLogs/{logId}`.

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
4) Seed admin PINs via `/api/admin/pins` (or add a UI hook). Whitelist members in `community/ghmo-site/members` with `emailLower` set.
5) Configure GoFundMe Pro webhook + reconcile schedule when ready.

## Security Notes
- PINs are bcrypt-hashed; lockout enforced on `/api/auth/pin`.
- Magic-link endpoints are rate-limited and always return generic responses to avoid enumeration.
- Webhooks validated via shared-secret HMAC placeholder; replace with provider verification if supplied.
- Firebase rules: see `firestore.rules` for a draft locked to `community/ghmo-site` paths.
