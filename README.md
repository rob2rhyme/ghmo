# Greater Harrisburg Magar Organization (Next.js + Firebase + GoFundMe Pro)

Single-community App Router site for GHMO: an admin area (email link plus an authenticator-app code, passkeys optional) with structured meeting minutes governance, end-to-end encrypted member records, outreach and push alerts, document generation, fundraising, a multimedia hub, and a separate member login at `/login`.

## Current Focus
The phased roadmap and the status of every phase (0–17) are in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) §6. Admin sign-in is an email link plus an authenticator-app code; passkeys are optional (decision D6).

## Highlights
- One community (`ghmo-site`) backed by Firebase + GoFundMe Pro; no multi-tenant routing.
- Admins authenticate via allowlist-only email magic links; a revocable Firebase session cookie named `__session` is the source of truth for guarded pages/API routes.
- Modules: Plans & Issues (Admin Communication Log) for governed admin-only decision threads (conclusion required to close, append-only comments, read-only after closure, full auditability), Admin Chat (WhatsApp-style coordination for quick updates only; decisions belong in Plans & Issues), Meeting Minutes (agenda/decisions/action items + structured attendance), Document Generator (GHMO letterhead preview + PDF/JPEG export), Admin dashboard overview (KPIs/quick actions/recents/system status), Multimedia hub.
- Audit logs cover auth attempts, admin actions, document generation, webhook receipts, and reconciliation runs.

## Document Generator
- Single `/admin/document-generator` page hosts tab-based GHMO letter templates (no landing cards); desktop layouts pair the form on the left with the live preview on the right, and mobile stacks the panels responsively.
- Current tabs: General Meeting Invitation (renamed from Member Meeting Invitation), Board Meeting Invitation, Community Leader Invitation (external leader outreach), and Bhajan Program.
- Letter-size (8.5×11) PDF/JPEG exports reuse `/public/assets/docgen/ghmo-letterhead.webp` (full-size originals of the letterhead, seal and building artwork are in `design/originals/`, outside `public/` so they are not served), ensuring the preview and saved asset match the same branded background.
- Cross-device signing links require `NEXT_PUBLIC_APP_URL` during local dev (set to `http://<LAN_IP>:3000` so phones can open QR/sign links).

## Meeting Minutes
- Meeting Minutes are the official governance record; the legacy Timeline feature is deprecated and has no page.
- The Timeline API routes, the sample-topic seed route and the home-blocks route were removed on 2026-11-06 (they had no caller); older activity entries from them still read correctly.
- Documents live at `organizations/{orgSlug}/minutes`, one per past event (the API enforces uniqueness) and surface on public event pages once approved while admins can still view drafts and submissions.
- Each record stores structured agenda items, discussion summary, decisions, action items, and attendance split into present/absent/guest lists, giving the Admin dashboard/public view a consistent, searchable format.
- Minutes export as Letter-size PDFs on the GHMO letterhead so the preview and the final file are identical.

## Communication Log
- Plans & Issues (`/admin/comms`) are governed threads for proposals, plans, and issues that need discussion and a documented conclusion.
- Threads require a conclusion to close and become read-only once closed; comments are append-only for audit clarity.
- Conclusion voting is isolated to the close workflow and retains full auditability.
- Admin Chat (`/admin/chat`) is the WhatsApp-style channel for quick coordination and day-to-day updates, not for decisions.
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
- Public: `/`, `/donate`, `/multimedia`, `/c/[orgSlug]/events` and `/c/[orgSlug]/events/[eventId]` (published events), `/minutes` and `/minutes/[id]` (approved minutes), `/verify/[code]` (certificate check), `/document-generator`, `/sign/[sessionId]` (signing link), `/unsubscribe`, `/docs/onboarding`
- Admin-only:
  - `/admin` (overview-only: KPIs, quick actions, recents, system status)
  - `/admin/comms` (Plans & Issues) and `/admin/comms/[threadId]` (one thread)
  - `/admin/chat` (Admin Chat)
  - `/admin/minutes` (Create/Edit + Records tabs)
  - `/admin/action-items` (tasks from approved minutes)
  - `/admin/broadcasts` and `/admin/broadcasts/[broadcastId]` (member emails)
  - `/admin/events`, `/admin/events/new`, `/admin/events/[eventId]/edit`
  - `/admin/members` (member list)
  - `/admin/encryption` (end-to-end encryption keys) and `/admin/security` (passkeys, authenticator app, notifications)
  - `/admin/calling-tree` (who calls whom; super admins plan and save, plan §12) and `/admin/my-calls` (a caller's own people)
  - `/admin/call-campaigns` and `/admin/call-campaigns/[id]` (one campaign per announcement: who was reached, RSVPs, call log, CSV export; plan §12)
  - `/admin/positions` (who holds each officer position and since when; super admins change it, plan §15) and `/admin/groups`, `/admin/groups/[groupId]` (teams of members with a lead, including the phone tree callers; any admin)
  - `/admin/events/templates` (ready-made task checklists) and, on each event's edit page, its Tasks section with Send reminders (plan §15 and §16)
  - `/admin/admins` (who can sign in: add an admin, turn one off or on, change a role, fix a name; super admins only, plan §22)
  - `/admin/members/[memberId]` (a member's profile: member since, city and state, family members, notes, call history and how calls went; plan §17)
  - `/admin/gumba-project`
  - `/admin/document-generator`
  - `/admin/document-gallery`
- Managing admins (plan §22, Phase 17), super admin only: `GET/POST /api/admin/admins` (list and add) and `PATCH /api/admin/admins/[adminId]` (turn off or on, change role, fix a name). You cannot turn yourself off or change your own role, and the last active super admin can never be turned off or demoted (checked inside a transaction). Turning off can also turn off that admin's push devices.
- Deleting a member (plan §20, Phase 15): `GET /api/organizations/ghmo/members/[memberId]/deletion` (what would be removed and kept) and `DELETE /api/organizations/ghmo/members/[memberId]` with `{ confirm }` (the member's name). Super admin only.
- Member list export (plan §19): `POST /api/admin/member-export` only records the download (the CSV is built in the browser); the **Export list** button is on `/admin/members`.
- Scheduled: `GET /api/cron/task-digest` (Vercel Cron, once a day, needs `CRON_SECRET`; plan §16). `GET/PUT /api/admin/task-digest` is its switch.
- Auth: `/admin/login` (admin magic link) with `POST /api/auth/email/start`, `POST /api/auth/email/verify`, `POST /api/auth/session`, and the dev-only `/api/auth/dev/admin-session` (always disabled in production). `/login` is the member magic-link page.
- API: `/api/auth/send-login-link`, `/api/auth/post-auth`, `/api/admin/*`, `/api/gfmpro/*`, and:
  - Sign-in: `/api/auth/me`, `/api/auth/firebase-custom-token`, `/api/auth/passkey/{login,register}/{options,verify}`, `/api/auth/totp` (plus `/setup`, `/confirm`, `/verify`, `/recovery-codes`)
  - Public data: `/api/calendar`, `/api/calendar/[eventId]`, `/api/media/youtube`, `/api/organizations/[orgSlug]/events`, `/api/organizations/[orgSlug]/donations/stats`
  - Admin data under the organization: `/api/organizations/[orgSlug]/admin/dashboard`, `/api/organizations/[orgSlug]/admin/events`, `/api/organizations/[orgSlug]/docgen/templates`, `/api/organizations/[orgSlug]/members/[memberId]/calls`, `/notes` and `/notes/[noteId]`
  - Signing links: `/api/signing-sessions/[sessionId]` and `/api/signing-sessions/[sessionId]/sign`
  - Tests only: `/api/test/expire-public-cache` (emulator only)

## Admin Jump to a Page
- Ctrl K / ⌘ K opens "Jump to a page" from anywhere in the admin area (`src/components/admin/shell/AdminShell.tsx`, `AdminJumpDialog.tsx`).

## Authentication
- Admins request magic links via `/admin/login`. The allowlist is the `organizations/ghmo/admins` collection: each doc has `emailLower` and `status: "active"`. Magic-link login only works when `FEATURE_EMAIL_ADMIN_LOGIN=true`. Every admin route goes through `requireActiveAdmin`, so only those whitelist entries can perform writes.
- Session state lives in one `__session` cookie: a Firebase **session cookie** (HttpOnly, Secure in production, SameSite=Lax, 8 hours), checked for revocation on every request. `/api/auth/session` only issues it to active admins or allowlisted members. Signing out revokes all of the user's tokens (every device) and signs the browser's Firebase client out.
- Firestore rules require an active `admins/{uid}` record in addition to the admin claim, so setting an admin's `status` to anything but `active` cuts off their database access immediately.
- The dev helper `/api/auth/dev/admin-session` is disabled unless the build is not production and `ALLOW_DEV_ADMIN_LOGIN=true` and `DEV_ADMIN_LOGIN_TOKEN` (32+ characters) are set (`src/lib/security/devLogin.ts`).
- **PIN login has been removed** (plan decision D3). The PIN routes, the `pins` collection rules and `FEATURE_PIN_LOGIN` no longer exist; any old `organizations/ghmo/pins` documents can be deleted.
- **First admin:** set `BOOTSTRAP_ADMIN_SECRET` (32+ random characters) and call `POST /api/admin/bootstrap` with `{ "secret", "email", "name" }`. It creates one `super_admin` in `organizations/ghmo/admins` and then locks itself permanently. Remove the secret afterwards.
- **Strong sign-in is required** for every admin: an authenticator-app code after the email link (decision D6, the default), or a passkey (optional, decision D2). The sections below about passkeys apply to admins who choose them.
- **Passkeys** (decision D2, optional since D6). An admin who sets one up can sign in at `/admin/login` with it (fingerprint, face or device PIN). On its own, the email magic link only starts a limited session: it cannot open admin pages, admin APIs or admin data in Firestore until the second step (an authenticator-app code, or creating or using a passkey) is done.
- **Recovery:** if an admin who already has a passkey adds a new one through a magic link, the new passkey stays *pending* until **another** admin approves it under Admin → Security, so access to someone's email alone is not enough. If no other admin with a passkey exists, it activates immediately (audited).
- **Security page** (`/admin/security`): list, add and remove your passkeys (you can't remove your last one), and approve other admins' pending passkeys. Super admins can remove another admin's passkey (lost device).
- Sessions record how they were created (`authMethod` claim: `passkey`, `totp`, `magic_link` or local-only `dev`); `requireActiveAdmin` and the Firestore rules both require `passkey` or `totp`.
- **Authenticator app (D6):** after the email link the admin enters a 6-digit code (Google Authenticator, Authy, 1Password...). Set-up shows a QR code and 8 one-time recovery codes. Codes can't be replayed and attempts are rate limited. A super admin can reset an admin's app from Admin → Security. Seeds are encrypted with a key derived from `DOCGEN_SIGNATURE_ENC_KEY_BASE64`, so that variable must be set.

## Data Model (single community)
- `organizations/ghmo` document: metadata, theme, GoFundMe config.
- Subcollections under `organizations/ghmo`:
  - `members/{memberId}`: `emailLower` (`""` for a member who doesn't use email; such a member has a `name` and an encrypted phone number, and is called but never emailed), optional `email`, optional `name`, `status` (active/disabled), `uid` (nullable until member auth is added), `roles`, `createdAt`, `updatedAt`.
    Email consent (Phase 8): optional `emailConsent` {`at`, `source` (`admin_on_request` / `signed_up` / `imported`), `byUid`}, `emailOptOutAt`, `emailBounced`. Only members who are active, have a recorded consent and have not opted out or bounced can be emailed. Members are written only by the server (`/api/organizations/ghmo/members`, `/members/[id]`, `/members/import`); Firestore rules let admins read the list but never write it.
    Phone and call contact (Phase 9-A, plan §12): `contact` is one end-to-end encrypted envelope (phone, second phone, language, household, notes) made in the admin's browser and bound to the member id, so the server never sees a number; beside it `hasPhone`, `phoneConsent` {`at`, `source`, `byUid`} and `callOptOutAt` are plaintext flags for filtering. Numbers can only be stored once encryption is on and are shown masked until tapped.
  - `minutes/{id}`: structured meeting minutes tied to published events, with a `versions/{n}` subcollection (one immutable copy per approval). Admin-read; written only through `/api/admin/minutes`.
  - `docgen/{templateId}` (Document Generator templates). Read only by the server; closed to browsers.
  - Seed templates by writing documents under `organizations/{orgSlug}/docgen` (e.g., `{ name: "Default Letter", letterhead: {...}, fields: ["Recipient", "Body"] }`) so the admin UI has options.
  - `documents/{id}`: saved generated documents (Document Gallery); encrypted once encryption is on. Server-only.
  - `donations/stats` + `donations/webhookEvents/events/{eventId}`. Admin-only.
  - `events/{id}`: events. Server-only; the public site reads published events through the server.
  - `admins/{id}`: who can sign in (`emailLower`, `status`, `roles`, `name`), with `passkeys/{credentialId}` and `totp/main` (the encrypted authenticator-app seed). Server-only; the rules only check that the admin record is active.
  - `passkeyIndex/{credentialId}` (passkey to admin lookup) and `webauthnChallenges/{id}` (single-use, 5-minute challenges). Server-only.
  - `rateLimits/{key}`: rate-limit windows (see Security Notes). Server-only.
  - `config/bootstrap`: marker written by `/api/admin/bootstrap`; once it exists the route is locked. Server-only.
  - `e2ee/**`: public keys, wrapped keys and the signed device list (see End-to-End Encryption). Server-only.
  - `broadcasts/{id}` with `deliveries/{memberId}`: member emails and per-member delivery rows. Admin-read, server-written. `broadcastQuota/{day}`: emails sent per UTC day (shared by broadcasts, task reminders and the digest). Server-only.
  - `actionItemStatus/{key}`: private status and note for each action item from approved minutes (key = minutes id + task hash). Admins read and write; encrypted once encryption is on.
  - `callingTree/current` (`callers[]`, `version`, `updatedAt`, `updatedBy`) and `callingTree/current/assignments/{memberId}` (`callerUid`, `assignedAt`, `assignedBy`): the calling tree (plan §12), server-only; no client may read or write it.
  - `callCampaigns/{id}` and `callCampaigns/{id}/calls/{memberId}`: call campaigns (plan §12): title, event, encrypted script, counts; per member the caller, outcome, RSVP and append-only attempts with encrypted notes. Server-only.
  - `positions/{id}` and `positionTerms/{id}`: officer positions (title, Nepali title, order, active, several-holders flag) and who held each from which date to which (`startsOn`, `endsOn` or null). `groups/{id}`: name, description, `leadMemberId`, `kind` (`callers` for the phone tree group). Group membership is `members/{id}.groupIds[]`. All plaintext, admin-read, server-written (plan §15).
  - `eventTasks/{id}`: one task of an event (`eventId`, title, notes, `groupId`, `memberIds[]`, `dueOn`, `status` open or done, `order`, `doneAt`, `doneBy`). `eventTaskTemplates/{id}`: name, description and `items[]` (title, notes, `groupId`, `dueOffsetDays` from the event day). Plaintext, admin-read, server-written, outside the event documents so they never reach the public site (plan §15, 11-B).
  - `eventTaskReminders/{eventId}~{memberId}`: the last time a person was reminded about an event's tasks (`lastSentAt`, `lastSentBy`, `count`) and any send in progress (`claimId`, `claimedAt`); keeps the 24-hour limit. Server-only, admin-read (plan §16).
  - `taskDigest/settings`: whether the daily overdue-task digest is on (off by default), who changed it, the day it last ran and a summary of the last run. The per-person digest record is `eventTaskReminders/digest~{memberId}` with `kind: "digest"`. Admin-read, server-written (plan §16, 12-B).
  - `emailSuppressions/{hash}`: a "do not email" record kept when a member who opted out (or whose address bounced) is deleted: a keyed hash of the address (never the address), the reason and the date. Closed to every browser; the add and import routes read it so the address starts out opted out again (plan §20).
  - `pushSettings/settings`: the site-wide push switch (`enabled`, missing means on; `updatedAt`, `updatedBy`). Admin-read, server-written (plan §21).
  - `pushSubscriptions/{id}`: one record per device that turned push on (`uid`, secret push `endpoint`, `p256dh`, `auth`, `label`, `kinds[]`, `createdAt`, `lastSentAt`); the id is a hash of the address. Closed to every browser, even an admin's; the API shows a person only their own devices and never the address or keys (plan §18).
  - On each member document (plan §17): `memberSince` ("YYYY-MM-DD"), `city` and `state` (plain; no street address is kept). Family members (`family[]` of name, relationship, phone) live inside the encrypted `contact` envelope.
  - On each call attempt inside `callCampaigns/{id}/calls/{memberId}.attempts[]` (plan §17, 13-C): an optional encrypted `manner` envelope (polite, neutral or rude), never returned to the campaign dashboard.
  - `members/{memberId}/notes/{noteId}`: one note on a member's profile (plan §17, 13-B): `enc` (the encrypted text), `authorUid`, `authorName`, `createdAt`. Server-written only, admin-read; append-only (a note is added or deleted, never edited).
  - `auditLogs/{logId}`.
- Communication log collections (all under `organizations/ghmo`):
  - `commsThreads/{threadId}`: `title`, `body`, `status`, `priority`, `pinned`, `createdBy`, `createdAt`, `lastActivityAt`, `conclusion`, `closedBy`, `closedAt`.
    - `comments/{commentId}`: append-only comment records.
      - `likes/{uid}`: one like per admin on a comment.
    - `conclusionVotes/{voteId}`: used only for conclusion voting when closing (the id is the voter's uid).
  - `adminChatMessages/{messageId}`: `body`, `createdBy`, `createdAt`.
- Root-level collections (server-only):
  - `signingSessions/{id}`: signing-link sessions and their sealed signatures.
  - `certificates/{code}`: issued certificate records, checked by `/verify/{code}`.
- Legacy paths are still read as fallbacks: `community/ghmo-site/...` (events, members, donation stats) and `organizations/ghmo-site/events` (`src/lib/events.ts`, `app/api/admin/minutes/route.ts`, `app/api/auth/send-login-link/route.ts`, `src/lib/publicData.server.ts`). New data is written only under `organizations/ghmo`; an old event is edited or deleted where it is.

## GoFundMe Pro
- Donations go through GoFundMe's own campaign page (`GOFUNDME_PUBLIC_URL`); no GoFundMe script runs on this site.
- Webhook: point GoFundMe Pro to `/api/gfmpro/webhook` with `GOFUNDME_PRO_WEBHOOK_SECRET`.
- Reconcile: call `/api/gfmpro/reconcile` (admin-only) manually or via scheduler.

## Multimedia
- Server-side fetchers with caching (5m) and graceful fallbacks.
- Env placeholders:
  - Facebook: `FACEBOOK_PAGE_ID`, `FACEBOOK_GRAPH_TOKEN`, `FACEBOOK_PAGE_URL`
  - YouTube: `YOUTUBE_API_KEY`, `YOUTUBE_CHANNEL_ID`, `YOUTUBE_CHANNEL_URL`
  - TikTok: `TIKTOK_PROFILE_URL`
  - Instagram: `INSTAGRAM_PROFILE_URL`
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
5) The first super admin is created once with the bootstrap route (`app/api/admin/bootstrap`). After that, a super admin adds admins under Admin → Admins → **Add admin**.
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
- **Attendance:** Meeting Minutes → Records → "Download attendance (CSV)" exports what the filters show.
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
- **Push notifications (Phase 14, plan §18):** off unless `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` are set (make the pair with `npx web-push generate-vapid-keys`). An admin turns push on per device under Admin → Security, with a switch for each alert (chat, Plans & Issues, minutes, a broadcast waiting for approval, calls, security). A push carries only fixed words and a page on this site, never a name, title or message. `GET/POST/PATCH/DELETE /api/admin/push` manage your own devices. For super admins (plan §21): `GET /api/admin/push-devices` lists every admin's devices (names and times only, never an address or key), `DELETE /api/admin/push-devices/[deviceId]` turns one off, and `GET/PUT /api/admin/push-settings` is the site-wide push switch. The server only calls known push-service hosts (Google, Mozilla, Apple, Microsoft).
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
> The full threat model, the known findings (S-01 to S-21) and the end-to-end encryption design are in [`docs/PROJECT_PLAN.md`](docs/PROJECT_PLAN.md) §2–§4.

- Magic-link auth endpoints are rate-limited, return generic responses, and only honor allowlisted emails in Firestore so the attacker cannot enumerate addresses.
- Rate limits are stored in Firestore (`organizations/ghmo/rateLimits`, keys SHA-256 hashed) so they hold across serverless instances, and fail closed if Firestore is unavailable. **Owner action:** in the Firebase console, add a TTL policy on the `expiresAt` field for the `rateLimits` collection group.
- **Going live / owner tasks:** `docs/GO_LIVE_CHECKLIST.md` lists every setting, secret, rule deployment and person-dependent step in order.
- **Vercel deployments.** `vercel.json` runs `scripts/vercel-ignore-build.sh`, which skips builds for `dependabot/*` branches and for changes that only touch docs, tests or CI config since the last successful deployment of that branch (`VERCEL_GIT_PREVIOUS_SHA`), so the free plan's daily deployment limit goes to changes that can affect the site. This includes docs-only merges to `main` (since 2026-11-06); `main` always builds when Vercel can't tell what it last deployed.
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
