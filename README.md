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
- Next.js 16.4 App Router, React 19.3, TypeScript 5.9, Tailwind CSS 4.3
- UI: shadcn/ui-style primitives in `src/components/ui` (Radix), semantic design tokens with light/dark themes in `app/globals.css`, self-hosted Inter, lucide icons, sonner toasts
- Passkeys: `@simplewebauthn/server` + `@simplewebauthn/browser`
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
  - `/admin/calling-tree` (who calls whom; super admins plan and save, plan §12) and `/admin/my-calls` (a caller's own people)
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
- **Strong sign-in is required** for every admin: an authenticator-app code after the email link (decision D6, the default), or a passkey (optional, decision D2). The sections below about passkeys apply to admins who choose them.
- **Passkeys** (decision D2). Admins sign in at `/admin/login` with a passkey (fingerprint, face or device PIN). The email magic link only starts a limited session that can create a passkey; it cannot open admin pages, admin APIs or admin data in Firestore.
- **Recovery:** if an admin who already has a passkey adds a new one through a magic link, the new passkey stays *pending* until **another** admin approves it under Admin → Security, so access to someone's email alone is not enough. If no other admin with a passkey exists, it activates immediately (audited).
- **Security page** (`/admin/security`): list, add and remove your passkeys (you can't remove your last one), and approve other admins' pending passkeys. Super admins can remove another admin's passkey (lost device).
- Sessions record how they were created (`authMethod` claim: `passkey`, `totp`, `magic_link` or local-only `dev`); `requireActiveAdmin` and the Firestore rules both require `passkey` or `totp`.
- **Authenticator app (D6):** after the email link the admin enters a 6-digit code (Google Authenticator, Authy, 1Password...). Set-up shows a QR code and 8 one-time recovery codes. Codes can't be replayed and attempts are rate limited. A super admin can reset an admin's app from Admin → Security. Seeds are encrypted with a key derived from `DOCGEN_SIGNATURE_ENC_KEY_BASE64`, so that variable must be set.

## Data Model (single community)
- `organizations/ghmo` document: metadata, theme, GoFundMe config.
- Subcollections under `organizations/ghmo`:
  - `members/{memberId}`: `emailLower`, optional `email`, optional `name`, `status` (active/disabled), `uid` (nullable until member auth is added), `roles`, `createdAt`, `updatedAt`.
    Email consent (Phase 8): optional `emailConsent` {`at`, `source` (`admin_on_request` / `signed_up` / `imported`), `byUid`}, `emailOptOutAt`, `emailBounced`. Only members who are active, have a recorded consent and have not opted out or bounced can be emailed. Members are written only by the server (`/api/organizations/ghmo/members`, `/members/[id]`, `/members/import`); Firestore rules let admins read the list but never write it.
    Phone and call contact (Phase 9-A, plan §12): `contact` is one end-to-end encrypted envelope (phone, second phone, language, household, notes) made in the admin's browser and bound to the member id, so the server never sees a number; beside it `hasPhone`, `phoneConsent` {`at`, `source`, `byUid`} and `callOptOutAt` are plaintext flags for filtering. Numbers can only be stored once encryption is on and are shown masked until tapped.
  - `content/pages/home`: `{ blocks[] }`.
  - `admin/minutes`: structured meeting minutes tied to published events (admin-only).
  - `docgen/{templateId}` (Document Generator templates) and `docgen/generations/{genId}`.
  - Seed templates by writing documents under `organizations/{orgSlug}/docgen` (e.g., `{ name: "Default Letter", letterhead: {...}, fields: ["Recipient", "Body"] }`) so the admin UI has options.
  - `donations/stats` + `donations/webhookEvents/{eventId}`.
  - `callingTree/current` (`callers[]`, `version`, `updatedAt`, `updatedBy`) and `callingTree/current/assignments/{memberId}` (`callerUid`, `assignedAt`, `assignedBy`): the calling tree (plan §12), server-only; no client may read or write it.
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

## End-to-End Encryption
- Admin → **Encryption** (`/admin/encryption`) manages end-to-end encryption keys. The design and owner steps are in `docs/PROJECT_PLAN.md` §4 and §8 (Phase 3).
- Each admin device has its own keys. They are stored in the browser, locked with a passphrase (or with the admin's passkey, if they have one that supports it), and unlocked once per session.
- A shared workspace key per key generation ("epoch") is wrapped for each approved device and for the **recovery key**. Two named trustees each hold a paper copy of the recovery key.
- **New devices** must be approved by another admin after comparing a 20-digit safety code, or activated with the paper recovery key.
- **Signed device list.** Every device, key change and rotation is recorded in a signed, hash-chained log that each browser verifies and pins. An existing workspace needs a super admin to press "Seal the device list" once on the Encryption page (after checking the listed devices with their owners). When adding a device, also compare the 20-digit workspace fingerprint shown on both screens.
- **Lost devices:** revoking a lost device rotates to a new epoch it can't read.
- The server only ever stores public keys and wrapped keys (`organizations/ghmo/e2ee/**`, server-only in Firestore rules).
- **What is encrypted:** Admin Chat; Plans & Issues (titles, details, comments, conclusions, votes); draft and submitted minutes; signatures (sealed in the signer's browser); saved documents and finalized certificates. Approved minutes are public by design and are published as a plaintext copy on approval.
- **Existing data:** after turning encryption on, run Admin → Encryption → **Encrypt existing records** once. Backups taken earlier still contain plaintext; delete them when no longer needed.
- **Tests:** `npm run test:e2e:auth` runs the real-browser encryption tests (needs Chromium; set `PLAYWRIGHT_CHROMIUM_PATH` if the bundled browser is missing).

## Governance workflow (Phase 5)
- **Minutes:** the admin who submits minutes can't approve them. Approval is tied to a fingerprint of the submitted content, so nothing can change during approval; editing submitted minutes sends them back to draft. Each approval keeps an immutable version, and reopening approved minutes needs a written reason and is audited.
- **Action items:** Admin → Action Items tracks tasks from approved minutes. Status and notes are private (encrypted once encryption is on).
- **Attendance:** Meeting Minutes → Records → "Export attendance (CSV)" exports what the filters show.
- **Certificates:** issuing a signed certificate prints a QR code that leads to `/verify/{code}`. The page shows the certificate number, type and issue date (never names) and lets anyone check a PDF copy against the issued file in their browser. Records are HMAC-signed with `CERTIFICATE_SIGNING_KEY_BASE64`, which you must set to issue certificates. The issued PDF downloads when you finalize; keep that file, since re-exported copies won't match its fingerprint.
- **Templates:** each document template has a version; saved documents remember it.

## Public pages & integrations (Phase 6)
- **Minutes archive:** `/minutes` lists approved minutes (attendance as counts only). Drafts are never shown.
- **Calendar:** `/api/calendar` is a subscribable `.ics` feed of published events; each event page has "Add to calendar".
- **Installable app (PWA):** `app/manifest.ts`, icons in `public/icons/`, and a conservative service worker (`public/sw.js`, production only) that caches only hashed build files and icons, never pages or API answers, and shows `public/offline.html` when offline. See plan §11.
- **Broadcasts (Phase 8-C):** `/admin/broadcasts` drafts an email to all members who agreed to receive it. A second admin must approve the exact text (the writer and submitter cannot); editing resets the approval; admins can send themselves a test. Stored in `organizations/ghmo/broadcasts`, written only by the server.
- **How to send a broadcast:** see `docs/BROADCASTS_GUIDE.md` (for admins) and `docs/RUNBOOK_INCIDENT.md` cases H–J (if something goes wrong).
- **Sending broadcasts (Phase 8-D):** off unless `FEATURE_BROADCASTS=true`. An approved broadcast is sent from its page in chunks (`BROADCAST_CHUNK_SIZE`, Resend batch API with an idempotency key per chunk), each member getting a personal unsubscribe link. It pauses at `BROADCAST_DAILY_LIMIT` per UTC day and resumes the next day; closing the page pauses and any admin can resume. Delivery rows live under `broadcasts/{id}/deliveries/{memberId}`; the daily count under `broadcastQuota/{day}`.
- **Member unsubscribe and bounces (Phase 8-B):** broadcast emails carry a signed unsubscribe link (`/unsubscribe`, a page that only acts when the button is pressed) and the one-click `List-Unsubscribe` headers (`POST /api/unsubscribe`). Links do not expire and can only opt that one member out. `POST /api/resend/webhook` marks hard bounces and opts out spam complaints; it is signature-checked with `RESEND_WEBHOOK_SECRET` and does not exist without it. The footer name and address come from `BROADCAST_ORG_NAME` and `BROADCAST_POSTAL_ADDRESS`.
- **Notification emails:** off unless `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` are set. Admins opt in under Admin → Security. Emails contain no content, only a link.
- **Draft autosave:** with encryption on and the device unlocked, unsent minutes and new threads are kept encrypted in the browser and offered back after a reload. Signing out wipes them.

## Security operations (Phase 7)
- **Incident runbook:** `docs/RUNBOOK_INCIDENT.md` (lost device, stolen session, departed admin, recovery key, database compromise). Fill in the names and print it with the recovery keys.
- **Yearly drill:** `docs/KEY_ROTATION_DRILL.md`. The automated version runs with `npm run test:e2e:auth`.
- **Route sweep:** `tests/e2e-auth/route-sweep.spec.ts` calls every API route as anonymous / stranger / disabled / magic-link-only users and fails if one is open.
- **Known limits and accepted risks:** see the Phase 7 entry in `docs/PROJECT_PLAN.md`.

## Development Checks
| Command | What it does |
|---|---|
| `npm run typecheck` | Generates Next route types, then runs TypeScript (no emit) |
| `npm run lint` | ESLint. Fails on any error, or on more than 132 warnings (legacy debt ceiling; lower it as code is cleaned up, never raise it) |
| `npm test` | Vitest unit tests in `tests/unit/` |
| `npm run test:coverage` | Unit tests with the coverage gate for the E2EE library (`src/lib/e2ee`) |
| `npm run build` | Production build. Works without Firebase secrets |
| `npm run test:e2e` | Playwright smoke tests in `tests/e2e/` against the production build (run `npm run build` first). In this sandbox set `PLAYWRIGHT_CHROMIUM_PATH` to a local Chromium |
| `npm run test:emulators` | Firestore rules tests and auth/session/passkey/signing integration tests against the Firebase emulators (needs Java 11+) |
| `npm run test:e2e:auth` | Real-browser passkey sign-in and E2EE setup/unlock/approval (Chromium virtual authenticator with PRF) against the emulators. Run `npm run build` first |
| `npm run check` | typecheck + lint + unit tests |

CI (`.github/workflows/ci.yml`) runs all of these on every pull request and push to `main`, and fails on critical production advisories from `npm audit`. Dependabot opens weekly update PRs.

## Security Notes
> The full threat model, the 17 known findings (S-01 to S-17) and the end-to-end encryption design are in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) §2–§4. Notable open issues until Phase 1 ships: the GoFundMe script loads on admin pages, disabling an admin does not end their session, and the rate limiter is in-memory only.

- Magic-link auth endpoints are rate-limited, return generic responses, and only honor allowlisted emails in Firestore so the attacker cannot enumerate addresses.
- Rate limits are stored in Firestore (`organizations/ghmo/rateLimits`, keys SHA-256 hashed) so they hold across serverless instances, and fail closed if Firestore is unavailable. **Owner action:** in the Firebase console, add a TTL policy on the `expiresAt` field for the `rateLimits` collection group.
- **Going live / owner tasks:** `docs/GO_LIVE_CHECKLIST.md` lists every setting, secret, rule deployment and person-dependent step in order.
- **Vercel deployments.** `vercel.json` runs `scripts/vercel-ignore-build.sh`, which skips preview builds for `dependabot/*` branches and for pushes that only change docs, tests or CI config, so the free plan's daily deployment limit goes to changes that can affect the site. `main` always builds.
- Client IPs come from the right-most `X-Forwarded-For` entry (configurable with `TRUSTED_PROXY_HOPS`), or `x-real-ip` on Vercel, so clients cannot spoof their IP to dodge limits.
- Sessions are anchored to the revocable `__session` cookie and verified via `requireActiveAdmin` (which re-reads the admin record) before any admin page/API executes logic.
- The dev helper `/api/auth/dev/admin-session` only works when the build is not production, `ALLOW_DEV_ADMIN_LOGIN=true`, and a 32+ character `DEV_ADMIN_LOGIN_TOKEN` is sent in the `x-dev-login-token` header. (Before Phase 1 the code did not check the environment and the token was optional.)
- Webhooks are validated with a constant-time HMAC-SHA256 check, a 64 KB size cap and a Zod schema; the target organization is never taken from the payload. Replace the HMAC placeholder with the provider's documented verification when credentials are available.
- Signing links: the session ID must be 64 hex characters; submissions are rate-limited, must be a real PNG under 200 KB, and are accepted exactly once (Firestore transaction). With end-to-end encryption on, the signer's browser seals the signature to the workspace key and the server stores only ciphertext; before that, signatures use server-side AES-256-GCM bound to their session. QR codes for signing links are generated in the browser.
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
