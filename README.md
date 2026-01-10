# Greater Harrisburg Magar Organization (Next.js + Firebase + GoFundMe Pro)

Single-community App Router site for GHMO with admin-only magic-link authentication, structured meeting minutes governance, document generation, fundraising, and a multimedia hub.

## Current Focus
- Solidify identical single-community routing (`/`, `/admin`) and remove orgSlug/tenant assumptions.
- Stabilize whitelist-based admin email magic-link auth + env handling (NEXT_PUBLIC_FIREBASE_* + session cookies).
- Multimedia aggregation page with Facebook/YouTube/TikTok/Instagram fallbacks.
- Timeline/Events system deprecated; replace with structured Meeting Minutes for the official governance record.

## Highlights
- One community (`ghmo-site`) backed by Firebase + GoFundMe Pro; no multi-tenant routing.
- Admins authenticate via whitelist-only email magic links (OTP); `sessionToken` (with `__session` fallback) is the source of truth for guarded pages/API routes.
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
- Next.js 14 App Router, TypeScript, TailwindCSS
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
- Auth: `/login` (magic link request) with `POST /api/auth/email/start`, `POST /api/auth/email/verify`, `POST /api/auth/session`, and the dev-only `/api/auth/dev/admin-session` (gated and disabled in production).
- API: `/api/auth/send-login-link`, `/api/auth/post-auth`, `/api/admin/*`, `/api/docgen/log`, `/api/gfmpro/*`

## Admin Dashboard Search
- The admin dashboard includes an inline command-palette style search bar that filters quick actions, recent minutes, and audit activity.
- Shortcut: Cmd+K / Ctrl+K focuses the search input; Esc clears the query (or blurs if empty).

## Authentication
- Admins request magic links via `/login`, and Firestore stores their email in a whitelist (e.g., `organizations/{orgSlug}/members` with `status: "active"`). Every admin route goes through `requireActiveAdmin`, so only those whitelist entries can perform writes.
- Session state lives in the `sessionToken` cookie (with `__session` fallback) handled by `/api/auth/session`; public routes stay readable without a session token, while admin-only routes and APIs validate the token before running.
- The dev helper `/api/auth/dev/admin-session` is disabled unless `NODE_ENV !== "production"` plus explicit flags (`NEXT_PUBLIC_DEV_LOGIN`, `DEV_LOGIN_SECRET`) are present.
- The magic-link workflow is the only login path; there is no member login option, and all admin actions depend on the authored session token.

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
4) Whitelist admin emails by creating documents under `organizations/ghmo/members` (set `emailLower`, `status: "active"`, and optional profile data) so the magic-link auth flow recognizes them.
5) Configure GoFundMe Pro webhook + reconcile schedule when ready.

## Security Notes
- Magic-link auth endpoints are rate-limited, return generic responses, and only honor allowlisted emails in Firestore so the attacker cannot enumerate addresses.
- Sessions are anchored to the `sessionToken` cookie (with `__session` fallback) and verified via `requireActiveAdmin` before any admin page/API executes logic.
- The dev helper `/api/auth/dev/admin-session` is gated by `NODE_ENV !== "production"` plus `NEXT_PUBLIC_DEV_LOGIN` and `DEV_LOGIN_SECRET`, and it remains disabled unless those flags are explicitly set.
- Webhooks are validated via the shared-secret HMAC placeholder; replace that check with a provider-backed verification when credentials are available.
- Firestore rules are deny-by-default and access is controlled by the `admin: true` custom claim.
- All communication log features are admin-only, and closed threads are immutable.

## Feature Enhancements (Planned)
- Admin Activity Analytics (Planned)
  - Silent instrumentation (no UI yet).
  - Tracks thread creation, comments posted, documents generated, meeting participation, and admin visits/interactions.
- Admin Leaderboard (Future / Optional)
  - Derived from analytics (not active).
  - Time-boxed (monthly / quarterly).
  - Category-based (participation, governance, documentation).
  - Intended for insights, not competition; future and opt-in.

## Reset Build Artifacts & Start Dev Server

If you encounter caching or build issues, run the following commands to fully reset the local environment and restart the development server:

```bash
rm -rf .next
rm -rf node_modules/.cache
rm -rf .turbo
npm run dev
```
