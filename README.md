# Greater Harrisburg Magar Organization (Next.js + Firebase + GoFundMe Pro)

Single-community App Router site for GHMO with admin-only magic-link authentication, structured meeting minutes governance, document generation, fundraising, and a multimedia hub.

## Current Focus
The approved plan is [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md). In short:
1. **Phase 0:** fix the React/Next version mismatch; add ESLint, tests and CI.
2. **Phase 1:** security hardening (security headers, revocable sessions, durable rate limits, remove PIN login, keep third-party scripts off admin pages).
3. **Phase 2:** required passkeys for admins; new UI on shadcn/ui + Tailwind v4.
4. **Phases 3–4:** end-to-end encryption for admin chat, Plans & Issues, draft minutes, signatures and document history.
5. **Phases 5–7:** governance features, public archive and integrations, external security review.

## Highlights
- One community (`ghmo-site`) backed by Firebase + GoFundMe Pro; no multi-tenant routing.
- Admins authenticate via allowlist-only email magic links; a revocable Firebase session cookie named `__session` is the source of truth for guarded pages/API routes.
- Modules: Plans & Issues (Admin Communication Log) for governed admin-only decision threads (conclusion required to close, append-only comments, read-only after closure, full auditability), Admin Chat (WhatsApp-style coordination for quick updates only; decisions belong in Plans & Issues), Meeting Minutes (agenda/decisions/action items + structured attendance), Document Generator (GHMO letterhead preview + PDF/JPEG export), Admin dashboard overview (KPIs/quick actions/recents/system status), Multimedia hub.
- Audit logs cover auth attempts, admin actions, document generation, webhook receipts, and reconciliation runs.

## Document Generator
- Single `/admin/document-generator` page hosts tab-based GHMO letter templates (no landing cards); desktop layouts pair the form on the left with the live preview on the right, and mobile stacks the panels responsively.
- Current tabs: General Meeting Invitation (renamed from Member Meeting Invitation), Board Meeting Invitation, Community Leader Invitation (external leader outreach), and Bhajan Program.
- Letter-size (8.5×11) PDF/JPEG exports reuse `/public/assets/docgen/ghmo-letterhead.png`, ensuring the preview and saved asset match the same branded background.
- Cross-device signing links require `NEXT_PUBLIC_APP_URL` during local dev (set to `http://<LAN_IP>:3000` so phones can open QR/sign links).

## Meeting Minutes
- Meeting Minutes are the official governance record; the legacy Timeline feature is deprecated and no longer used.
- Documents live at `organizations/{orgSlug}/minutes`, one per past event (the API enforces uniqueness) and surface on public event pages once approved while admins can still view drafts and submissions.
- Each record stores structured agenda items, discussion summary, decisions, action items, and attendance split into present/absent/guest lists, giving the Admin dashboard/public view a consistent, searchable format.
- Minutes export as Letter-size PDFs on the GHMO letterhead so the preview and the final file are identical.

## Communication Log
- Plans & Issues (`/admin/comms`) are governed threads for proposals, plans, and issues that need discussion and a documented conclusion.
- Threads require a conclusion to close and become read-only once closed; comments are append-only for audit clarity.
- Conclusion voting is isolated to the close workflow and retains full auditability.
- Admin Chat (`/admin/chat`) is the WhatsApp-style channel for quick coordination and day-to-day updates, not for decisions.
- A “Create sample threads” button appears when there are no existing threads to help onboard new admins.
- No third-party UI dependencies were added for the communication log UI.

## Stack
- Next.js 16.4 App Router, React 19.3, TypeScript 5.9, TailwindCSS 3.4 (v4 + shadcn/ui in Phase 2)
- Node.js 22.12 or newer
- Tooling: ESLint 9 (flat config, `eslint-config-next`), Vitest (unit), Playwright (browser smoke tests), GitHub Actions CI
- Firebase Client SDK (Auth/Firestore) + Firebase Admin SDK
- GoFundMe Pro webhook placeholder + reconcile endpoint
- @react-pdf/renderer + html-to-image for exports

## Routes
- Public: `/`, `/donate`, `/multimedia`
- Admin-only:
  - `/admin` (overview-only: KPIs, quick actions, recents, system status)
  - `/admin/comms` (Plans & Issues)
  - `/admin/chat` (Admin Chat)
  - `/admin/minutes` (Create/Edit + Records tabs)
  - `/admin/events`
  - `/admin/gumba-project`
  - `/admin/document-generator`
  - `/admin/document-gallery`
- Auth: `/admin/login` (admin magic link) with `POST /api/auth/email/start`, `POST /api/auth/email/verify`, `POST /api/auth/session`, and the dev-only `/api/auth/dev/admin-session` (always disabled in production). `/login` is the member magic-link page.
- API: `/api/auth/send-login-link`, `/api/auth/post-auth`, `/api/admin/*`, `/api/docgen/log`, `/api/gfmpro/*`

## Admin Dashboard Search
- The admin dashboard includes an inline command-palette style search bar that filters quick actions, recent minutes, and audit activity.
- Shortcut: Cmd+K / Ctrl+K focuses the search input; Esc clears the query (or blurs if empty).

## Authentication
- Admins request magic links via `/admin/login`. The allowlist is the `organizations/ghmo/admins` collection: each doc has `emailLower` and `status: "active"`. Magic-link login only works when `FEATURE_EMAIL_ADMIN_LOGIN=true`. Every admin route goes through `requireActiveAdmin`, so only those whitelist entries can perform writes.
- Session state lives in one `__session` cookie: a Firebase **session cookie** (HttpOnly, Secure in production, SameSite=Lax, 8 hours), checked for revocation on every request. `/api/auth/session` only issues it to active admins or allowlisted members. Signing out revokes all of the user's tokens (every device) and signs the browser's Firebase client out.
- Firestore rules require an active `admins/{uid}` record in addition to the admin claim, so setting an admin's `status` to anything but `active` cuts off their database access immediately.
- The dev helper `/api/auth/dev/admin-session` is disabled unless `NODE_ENV !== "production"` plus explicit flags (`NEXT_PUBLIC_DEV_LOGIN`, `DEV_LOGIN_SECRET`) are present.
- The magic-link workflow is the only supported login path; there is no member login option.
- **PIN login has been removed** (plan decision D3). The PIN routes, the `pins` collection rules and `FEATURE_PIN_LOGIN` no longer exist; any old `organizations/ghmo/pins` documents can be deleted.
- **First admin:** set `BOOTSTRAP_ADMIN_SECRET` (32+ random characters) and call `POST /api/admin/bootstrap` with `{ "secret", "email", "name" }`. It creates one `super_admin` in `organizations/ghmo/admins` and then locks itself permanently. Remove the secret afterwards.
- **Passkeys will be required** for every admin from Phase 2 (decision D2). Magic links will then be used only for first enrollment and lost-device recovery.

## Data Model (single community)
- `organizations/ghmo` document: metadata, theme, GoFundMe config.
- Subcollections under `organizations/ghmo`:
  - `members/{memberId}`: `emailLower`, optional `email`, optional `name`, `status` (active/disabled), `uid` (nullable until member auth is added), `roles`, `createdAt`, `updatedAt`.
  - `content/pages/home`: `{ blocks[] }`.
  - `admin/minutes`: structured meeting minutes tied to published events (admin-only).
  - `docgen/{templateId}` (Document Generator templates) and `docgen/generations/{genId}`.
  - Seed templates by writing documents under `organizations/{orgSlug}/docgen` (e.g., `{ name: "Default Letter", letterhead: {...}, fields: ["Recipient", "Body"] }`) so the admin UI has options.
  - `donations/stats` + `donations/webhookEvents/{eventId}`.
  - `auditLogs/{logId}`.
- Communication log collections (all under `organizations/ghmo`):
  - `commsThreads/{threadId}`: `title`, `body`, `status`, `priority`, `pinned`, `createdBy`, `createdAt`, `lastActivityAt`, `conclusion`, `closedBy`, `closedAt`.
    - `comments/{commentId}`: append-only comment records.
    - `votes/{uid}`: used only for conclusion voting when closing.
  - `adminChatMessages/{messageId}`: `body`, `createdBy`, `createdAt`.
Legacy community paths are no longer supported; please migrate any old data into `organizations/{orgSlug}`.

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

## Upcoming Roadmap
> **Superseded:** the current plan — security hardening, end-to-end encryption and the UI upgrade — is in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md). The list below is kept for history.

- **Governance & Compliance**
  - Approval/sign-off workflow for minutes (draft → submitted → approved with attribution/signatures).
  - Minutes versioning and revision history to track changes over time.
  - Action item tracking (status, assignee, due date) derived from minutes entries.
  - Admin audit log for logins, edits, approvals, and document exports.
- **Document Generator**
  - Digital signatures and official stamp placement on generated letters/minutes.
  - Template versioning to prevent layout drift as letterheads evolve.
  - QR code verification for certificates and official outreach letters.
- **Search & Analytics**
  - Search across minutes (event title, agenda, decisions, actions, attendance names).
  - Filters for date range, meeting type, and approval status.
  - Attendance and governance analytics (participation, trends, completion rates).
- **Attendance & Membership**
  - Member directory lookup to standardize attendance names when recording presence/absence.
  - Exportable attendance reports (CSV/PDF) for governance review.
- **Notifications & Integrations**
  - Email alerts for minutes review, approvals, and upcoming events.
  - Calendar export (`.ics`) plus optional calendar integrations for events/minutes.
- **Public Transparency**
  - Public governance archive showcasing approved minutes by year and meeting type.
  - Event history page that surfaces minutes alongside related media.
- **Performance & Reliability**
  - Autosave drafts for minutes and document generator forms.
  - Optional cloud storage for generated PDFs/JPEGs with retention policies.

## Getting Started
1) Install deps: `npm install`
2) Copy envs: `cp .env.example .env.local` and fill Firebase client config, Admin service account fields, GoFundMe secrets, social handles.
3) Run dev server: `npm run dev`
4) Set `FEATURE_EMAIL_ADMIN_LOGIN=true`. For a brand-new project, create the first admin with `POST /api/admin/bootstrap` (see Authentication).
5) Allowlist admin emails by creating documents under `organizations/ghmo/admins` (set `emailLower`, `status: "active"`, `roles`, and optional `name`) so the magic-link flow recognizes them.
6) Configure GoFundMe Pro webhook + reconcile schedule when ready.

## Development Checks
| Command | What it does |
|---|---|
| `npm run typecheck` | Generates Next route types, then runs TypeScript (no emit) |
| `npm run lint` | ESLint. Fails on any error, or on more than 137 warnings (legacy debt ceiling; lower it as code is cleaned up, never raise it) |
| `npm test` | Vitest unit tests in `tests/unit/` |
| `npm run build` | Production build. Works without Firebase secrets |
| `npm run test:e2e` | Playwright smoke tests in `tests/e2e/` against the production build (run `npm run build` first). In this sandbox set `PLAYWRIGHT_CHROMIUM_PATH` to a local Chromium |
| `npm run test:emulators` | Firestore rules tests and auth/session integration tests against the Firebase emulators (needs Java 11+) |
| `npm run check` | typecheck + lint + unit tests |

CI (`.github/workflows/ci.yml`) runs all of these on every pull request and push to `main`, and fails on critical production advisories from `npm audit`. Dependabot opens weekly update PRs.

## Security Notes
> The full threat model, the 17 known findings (S-01 to S-17) and the end-to-end encryption design are in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) §2–§4. Notable open issues until Phase 1 ships: the GoFundMe script loads on admin pages, disabling an admin does not end their session, and the rate limiter is in-memory only.

- Magic-link auth endpoints are rate-limited, return generic responses, and only honor allowlisted emails in Firestore so the attacker cannot enumerate addresses.
- Rate limits are stored in Firestore (`organizations/ghmo/rateLimits`, keys SHA-256 hashed) so they hold across serverless instances, and fail closed if Firestore is unavailable. **Owner action:** in the Firebase console, add a TTL policy on the `expiresAt` field for the `rateLimits` collection group.
- Client IPs come from the right-most `X-Forwarded-For` entry (configurable with `TRUSTED_PROXY_HOPS`), or `x-real-ip` on Vercel, so clients cannot spoof their IP to dodge limits.
- Sessions are anchored to the revocable `__session` cookie and verified via `requireActiveAdmin` (which re-reads the admin record) before any admin page/API executes logic.
- The dev helper `/api/auth/dev/admin-session` only works when the build is not production, `ALLOW_DEV_ADMIN_LOGIN=true`, and a 32+ character `DEV_ADMIN_LOGIN_TOKEN` is sent in the `x-dev-login-token` header. (Before Phase 1 the code did not check the environment and the token was optional.)
- Webhooks are validated with a constant-time HMAC-SHA256 check, a 64 KB size cap and a Zod schema; the target organization is never taken from the payload. Replace the HMAC placeholder with the provider's documented verification when credentials are available.
- Signing links: the session ID must be 64 hex characters; submissions are rate-limited, must be a real PNG under 200 KB, and are accepted exactly once (Firestore transaction). Signatures are encrypted with AES-256-GCM bound to their session, with key IDs for rotation. QR codes for signing links are generated in the browser.
- Firestore rules are deny-by-default; admin access needs the `admin` custom claim **and** an active admin record. Rules are tested against the emulator (`npm run test:emulators`).
- All communication log features are admin-only, and closed threads are immutable.

## Dropped Features
- **Admin Activity Analytics** (silent instrumentation) and the **Admin Leaderboard** were dropped on 2026-10-21 (plan decision D4). They conflict with the privacy and end-to-end encryption goals. Aggregate governance stats from approved minutes are still allowed.

## Reset Build Artifacts & Start Dev Server

If you encounter caching or build issues, run the following commands to fully reset the local environment and restart the development server:

```bash
rm -rf .next
rm -rf node_modules/.cache
rm -rf .turbo
npm run dev
```
