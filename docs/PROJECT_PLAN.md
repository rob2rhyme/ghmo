# GHMO Platform — Upgraded Project Plan (v2)

_Status: **approved** (all §7 recommendations accepted 2026-10-21) · Last updated: 2026-11-06 (Phases 0–17 built; see §6)_

This plan replaces the "Upcoming Roadmap" in `README.md` as the source of truth for what gets built next.
It has three parts:

1. **Analysis.** Where the current plan and codebase stand.
2. **Security upgrade.** Fixes to the current system, then end-to-end encryption (E2EE) for admin data.
3. **UI upgrade.** A shared design system, a mobile-first admin shell, and accessibility.

Work ships in the phases in §6. Each phase must be deployable on its own. Do not start E2EE work (Phase 3+) until Phases 1–2 are done, because E2EE in a browser is only as strong as the page that runs it.

---

## 1. Analysis of the current plan

### 1.1 What the README roadmap gets right
- Governance is the core: minutes, Plans & Issues, and audit logs.
- Append-only comments and immutable closed threads, enforced in Firestore rules.
- The magic-link allowlist with generic responses avoids leaking which emails are admins.

### 1.2 Gaps in the current plan
| Gap | Why it matters |
|---|---|
| No threat model | Nothing says what attackers we defend against, so security work is ad hoc. |
| Security is a feature list, not a phase | Items like "audit log" are listed next to "calendar export" with no priority. |
| No encryption story beyond signatures | Admin chat, internal threads, draft minutes and audit metadata are plaintext to anyone with Firebase console or service-account access. |
| No testing or CI plan | `npm run lint` is only `tsc --noEmit`; there are no tests. Security code without tests is not acceptable. |
| No UI foundation | Each page invents its own cards, buttons and inputs (see §5). |
| Docs drift | README says Next.js 14; `package.json` has Next 16.1.6 with React 18.2. Next 16 expects React 19. This must be resolved before anything else. |
| "Admin Activity Analytics (silent instrumentation)" | Silent tracking of admins conflicts with a privacy-first, E2EE design. **Dropped** (decision D4). |

---

## 2. Threat model

**Assets:** admin chat, Plans & Issues threads and votes, draft minutes, member/attendance PII, signatures, generated letters, admin identities, donation data.

| # | Attacker | Today | Goal after this plan |
|---|---|---|---|
| T1 | Internet attacker (no account) | Partly defended | Defended: hardened auth, durable rate limits, security headers |
| T2 | Stolen session cookie / XSS | Weak: no CSP, third-party script on admin pages, no revocation | Defended: strict CSP, revocable sessions, passkeys |
| T3 | Removed or disabled admin | **Not defended**: Firestore client access survives disable (see S-03) | Defended: revocation and key rotation |
| T4 | Leaked service-account key, Firebase console access, backups, Google | **Not defended**: all admin data readable | Defended for E2EE data: server holds only ciphertext |
| T5 | Compromised admin device | Not defended | Limited: per-device keys, remote device revoke; full defense is impossible |
| T6 | Malicious code served by our own app (supply chain, hosting compromise) | Not defended | Reduced: CSP, SRI, pinned deps, no third-party scripts on admin routes. **This is the fundamental limit of web E2EE**; document it. |

---

## 3. Security findings in the current code (fix first)

Severity: **C**ritical · **H**igh · **M**edium · **L**ow.

| ID | Sev | Finding | Location | Fix |
|---|---|---|---|---|
| S-01 | C | GoFundMe install snippet (raw HTML/JS from env) loads in the **root** layout, so it runs on every admin page with full DOM access. | `app/layout.tsx:31`, `src/components/GoFundMeProInstallSnippet.tsx` | Load only in `app/(public)` donate/home layouts. Never on `/admin`, `/sign`, `/login`. |
| S-02 | H | No Content-Security-Policy, HSTS, frame-ancestors, Referrer-Policy or Permissions-Policy headers. | `next.config.mjs` | Add headers. Use a strict nonce-based CSP on admin routes; relaxed CSP only on public embed pages. |
| S-03 | H | Disabling an admin does not revoke access. Session cookie is a raw Firebase ID token (no revocation check), and custom claims (`admin: true`) persist across refresh tokens, so Firestore client access continues. `revokeRefreshTokens` is never called. | `src/lib/sessionCookies.ts`, `src/lib/auth.ts`, `firestore.rules:4` | Use `createSessionCookie` / `verifySessionCookie(…, true)`. Call `revokeRefreshTokens` on disable and logout. In rules, also check `exists()`/`get()` on an active admin doc. |
| S-04 | H | Rate limiter is an in-memory `Map`. On serverless it resets per instance, so it barely limits anything. | `src/lib/rateLimit.ts` | Firestore transaction-based counter (free tier) keyed by hashed IP + email. |
| S-05 | H | Shared per-role PIN login: one PIN for all admins, fixed 15-minute lockout (anyone can lock everyone out), rate key uses spoofable raw `x-forwarded-for`. `FEATURE_PIN_LOGIN` defaults to **on**. | `app/api/auth/pin/route.ts`, `app/api/admin/pins/route.ts`, `src/lib/env.server.ts` | **Remove PIN login entirely in Phase 1** (decision D3): delete the PIN routes, the `pins` collection and rules, and the flag. Until then set `FEATURE_PIN_LOGIN=false` in every environment. Magic link is the only login until passkeys land in Phase 2. |
| S-06 | M | Secrets compared with `!==` / `===` (timing leaks). | `app/api/admin/bootstrap-pin/route.ts`, `src/lib/gofundme.ts:21` | `crypto.timingSafeEqual` on equal-length buffers. |
| S-17 | M | First-admin bootstrap creates a PIN and uses the PIN document ID as the admin ID. | `app/api/admin/bootstrap-pin/route.ts` | Replace with `POST /api/admin/bootstrap` (secret + email only) that creates the first `admins` doc; the admin then signs in by magic link and enrolls a passkey. Delete the endpoint once used, or keep it permanently locked by the `config/bootstrap` marker. |
| S-18 | H | Signing-link QR codes were rendered by `api.qrserver.com`, sending the secret signing URL to a third party. | `src/features/docgen/components/DocBuilder.tsx` | Generate QR codes locally in the browser (`qrcode` package). |
| S-19 | M | Open redirect: login pages accepted any `next` starting with `/`, including `//evil.com`; `/login` accepted absolute URLs. The admin login page also read Next 16's async `searchParams` synchronously, so `next` never worked. | `app/(auth)/admin/login/page.tsx`, `app/(auth)/login/page.tsx` | `safeRedirectPath()` allows same-origin paths only. |
| S-20 | C | Dev login bypass (`/api/auth/dev/admin-session`) never checked the environment, and its token was optional: with `ALLOW_DEV_ADMIN_LOGIN=true` and no token, anyone could sign in as any admin by email. Token also accepted in the query string. | `app/api/auth/dev/admin-session/route.ts` | Always off in production; 32+ char token required, header only, constant-time compare, rate-limited. |
| S-21 | M | Magic-link verify checked the admin allowlist before the link, so its error messages revealed which emails are admins. | `app/api/auth/email/verify/route.ts` | Verify the link first; one generic error for every failure. |
| S-07 | M | Magic-link `continueUrl` is built from the request's own origin (Host header). | `app/api/auth/email/start/route.ts` | Build from a fixed `NEXT_PUBLIC_APP_URL`; restrict Firebase authorized domains. |
| S-08 | M | Admin emails, continue URLs and partial OOB codes are written to logs. | email start/verify routes, `sessionCookies.ts` | Remove debug logs; log hashed identifiers only. |
| S-09 | M | Session cookie `secure` flag depends on `x-forwarded-proto`; can be false in production behind some proxies. | `src/lib/sessionCookies.ts` | Always `secure: true` in production; use `__Host-` cookie prefix; `sameSite: "strict"` for admin. |
| S-10 | M | Signing endpoint: no size limit on the PNG, no transaction (two submits can race), signer not bound to anything. | `app/api/signing-sessions/[sessionId]/sign/route.ts` | Size cap (e.g. 200 KB), Firestore transaction, single-use. Move to client-side sealed encryption in Phase 4. |
| S-11 | M | Signature encryption key is one static env var: no key ID, no rotation, no AAD binding the ciphertext to its session. | `src/lib/signatureEncryption.ts` | Add `kid` + AAD (`sessionId`) now; replace with E2EE in Phase 4. |
| S-12 | M | `middleware.ts` only checks that a cookie **exists**. Next 16 renamed the file to `proxy.ts`. | `middleware.ts` | Rename to `proxy.ts`; keep it as a fast redirect only; full verification stays in `requireActiveAdmin`. |
| S-13 | L | `/api/debug/env` is reachable in production (returns booleans only). `/api/debug/cookies` is gated. | `app/api/debug/*` | Delete both, or gate both behind non-production + admin. |
| S-14 | L | Webhook trusts `communityId` from body/header (currently forced to `ghmo` downstream, so harmless now, but fragile). | `app/api/gfmpro/webhook/route.ts` | Remove the branch; always use `COMMUNITY_SLUG`. Validate payload with Zod. |
| S-15 | L | No Zod validation on most API bodies despite `zod` being installed. | many routes | Validate every request body. |
| S-16 | L | No dependency/secret scanning in CI. | — | Add GitHub Actions: `npm audit`, typecheck, lint, tests, CodeQL, secret scanning. |

---

## 4. End-to-end encryption design

### 4.1 Goal and scope

**Goal:** private admin data is encrypted in the admin's browser and only decrypted in another admin's browser. Firebase, Vercel, Google and anyone holding the service-account key see only ciphertext.

| Data | E2EE? | Reason |
|---|---|---|
| Admin Chat messages | **Yes** | Purely internal. |
| Plans & Issues: thread title/body, comments, conclusion text | **Yes** | Internal governance discussion. |
| Conclusion votes | Value encrypted; voter ID stays plaintext | Rules must enforce one vote per admin. |
| Draft / unapproved minutes | **Yes** | Internal until approved. |
| Approved, published minutes | No | Public by design. Published as a separate plaintext copy on approval. |
| Signatures from signing sessions | **Yes** (sealed to the workspace key) | Highly sensitive; signer is unauthenticated. |
| Generated document history / gallery | **Yes** | PDFs/JPEGs are already rendered client-side. |
| Attendance names in drafts | **Yes** (inside the minutes envelope) | PII. |
| Admin emails | No (needed for magic-link lookup) | Store plaintext, minimize exposure. |
| Audit log | Metadata only plaintext (action, actor ID, time); details encrypted | Server must still write audit entries. |
| Donations, events, home content, media | No | Public. |

### 4.2 Cryptography (Web Crypto API only, no custom primitives)

- **Device identity:** each admin device generates an ECDH P-256 key pair (encryption) and an ECDSA P-256 key pair (signing) with `extractable: false`, stored in IndexedDB.
- **Unlocking the device keys:** wrap them with a key derived from the admin's **passkey via the WebAuthn PRF extension** (HKDF-SHA-256). Passkeys are **required** for every admin (decision D2), so this is the normal path. Fallback only for authenticators without PRF support: a local passphrase through PBKDF2-SHA-256 (≥ 600k iterations), still behind passkey login.
- **Workspace Data Key (WDK):** a random AES-256-GCM key per **epoch**. All E2EE records are encrypted with the current WDK.
- **Workspace sealing key pair:** an ECDH P-256 key pair whose public half is published, so unauthenticated signers can encrypt to the workspace (sealed-box style: ephemeral ECDH → HKDF → AES-GCM). Its private half is wrapped like the WDK.
- **Key wrapping:** for each enrolled device, `ECDH(device, wrapper-ephemeral) → HKDF → AES-KW` wraps the WDK and the sealing private key. Stored at `organizations/ghmo/keyring/{epoch}/devices/{deviceId}`.
- **Record envelope** (stored in Firestore instead of plaintext fields):
  ```json
  { "v": 1, "epoch": 3, "iv": "<base64 96-bit>", "ct": "<base64>", "sig": "<base64 ECDSA>", "dev": "<deviceId>" }
  ```
  AAD = `ghmo|<collection path>|<docId>|<v>|<epoch>`, which stops ciphertext being moved between documents. The signature lets readers verify which enrolled device wrote it.
- **Library:** one module, `src/lib/e2ee/`, pure functions over Web Crypto, with 100% unit-test coverage (Vitest + Node's `webcrypto`). No other code touches keys.

### 4.3 Key lifecycle

1. **Bootstrap:** the first super-admin creates epoch 1 (WDK + sealing key) and a **recovery key**: the private half of a P-256 key pair, shown once as a printable code; every epoch's WDK is wrapped to its public half (see §8, Phase 3, for the design as built). **Required** (decision D1): E2EE cannot be switched on until two named trustees have each confirmed they hold a paper copy. The trustees' names (not the key) are recorded in the keyring doc. Without the key, losing all devices means losing all E2EE data; the UI says this plainly.
2. **New device or new admin:** the device generates keys and posts its public keys plus a fingerprint. An existing admin approves it after comparing a 6-word **safety code** in person or by phone, then wraps the WDK for it. The server cannot add a device on its own.
3. **Admin removed or device lost:** revoke the device, then **rotate**: a new epoch is created and wrapped only for remaining devices. New data uses the new epoch. Old data stays readable to current admins (old epoch keys are re-wrapped for them) but the removed device can't read anything new. Optional background re-encryption of old records.
4. **Recovery:** with both trustees present, the recovery key unwraps the current WDK onto a new device; then rotate the recovery key and re-issue paper copies.
5. **Annual drill:** once a year, recover onto a spare device to prove the paper copies still work.

### 4.4 What changes in the app
- Realtime listeners (`onSnapshot` in chat and comms clients) decrypt in a client hook, `useDecryptedCollection()`.
- **Search:** minutes and thread search moves to the client (decrypt, then search in memory). Fine at this community's scale (hundreds to low thousands of records).
- **Firestore rules** can no longer validate content (e.g. non-empty title). They validate envelope shape, `createdBy == auth.uid`, timestamps, the epoch, and immutability. Content rules move to the client and to shared Zod schemas.
- **Server routes** that read private content (minutes API, comms seed, dashboard recents) change to pass ciphertext through or are removed. The server-side minutes PDF route only serves approved/public minutes.
- **Email notifications** may only say "new activity"; never content.
- **Migration:** a one-time, admin-run client-side job encrypts existing plaintext docs, verifies by decrypting, then deletes plaintext fields. Firestore backups taken before migration still contain plaintext; delete them after a retention window.

### 4.5 Limits (state these to admins)
- Web E2EE trusts the JavaScript the server sends. Mitigation: strict CSP, no third-party scripts on admin routes, pinned dependencies, signed deploys from protected `main`. A later option is shipping the admin area as an installed PWA with integrity checks.
- Metadata (who posted, when, thread count, sizes) is not hidden.
- A compromised, unlocked admin device can read everything that admin can.

---

## 5. UI upgrade

_Detailed findings from the UI audit are in §5.4._

### 5.1 Design system
- Define semantic tokens as CSS variables in `app/globals.css` (`--bg`, `--surface`, `--text`, `--muted`, `--primary`, `--danger`, `--success`, `--warning`, `--ring`, radii, shadows) with light and dark values. Map them in `tailwind.config.ts`. Replace hardcoded colors gradually.
- Build the primitives set in `src/components/ui/` with **shadcn/ui** (decision D5): source is copied into the repo, built on Radix, no runtime vendor. Add components with `npx shadcn@latest add <name>`: `button`, `input`, `textarea`, `select`, `label`, `form` (Field: label + help + error), `card`, `badge`, `tabs`, `dialog`, `sheet`, `sonner` (toasts), `skeleton`, `table`. Plus our own `EmptyState`.
- Current shadcn/ui targets **Tailwind v4**; this repo is on Tailwind 3.4. Upgrade Tailwind to v4 at the start of Phase 2 (`npx @tailwindcss/upgrade`) before adding components.
- Typography scale and spacing scale documented in one place.

### 5.2 Admin shell (mobile-first)
- One persistent shell: sidebar on desktop, bottom tab bar + "More" sheet on mobile.
- Page header pattern: title, breadcrumb, primary action.
- Standard loading (skeleton), empty and error states on every list.
- Security surfaces built into the shell:
  - **Lock state indicator:** shows whether this device's keys are unlocked; one-tap lock.
  - **Devices & keys** settings page: enrolled devices, fingerprints, revoke, rotate.
  - **Safety code** approval flow for new devices.
  - **Recovery key** setup wizard with a forced "I have stored this" confirmation.
  - Lock icon on E2EE content and a short "Encrypted end-to-end" note in chat and threads.

### 5.3 Accessibility
- Every input has a label; every icon-only button has `aria-label`.
- Visible focus rings via the `--ring` token.
- Status never shown by color alone (add text or icon).
- Dialogs trap focus and close on Esc.
- Target WCAG 2.2 AA; check with axe in CI (Playwright).

### 5.4 UI audit findings (2026-10-21)
| Area | Finding | Where |
|---|---|---|
| Tokens | Only 3 flat colors (`primary`, `secondary`, `muted`); no semantic, radius, shadow or font tokens. Five different radii in use. | `tailwind.config.ts` |
| Font | "Inter" is declared but never loaded, so the system font is used. | `app/globals.css:14` |
| Dark mode | Mostly `!important` overrides of specific slate/white classes. Only 13 of 62 TSX files use `dark:`; admin clients (comms, chat, minutes, dashboard, docgen) have none, so badges, chips and hover states stay light. | `app/globals.css:25-47` |
| Hardcoded colors | `#121212` footer, `#FF0000`, raw emerald/rose/red/amber status colors; red split between `red-*` and `rose-*`. | `app/layout.tsx:39`, `MediaSection.tsx` |
| Admin nav | 8 small pills, no active state or `aria-current`, rendered **twice** (layout + header). Static "System home" heading on every page. | `AdminNavControls.tsx`, `CommunityHeader.tsx:49`, `app/(admin)/admin/layout.tsx` |
| Mobile | Public mobile nav crams 4 links + toggles in one row (overflows at ~360px); `<main>` has `px-1`; fixed widths/heights on previews. | `CommunityHeader.tsx:58-71`, `app/layout.tsx:35`, `MinutesPreview.tsx:85` |
| Forms | 47 `<label>`s but only 2 `htmlFor`, so most inputs have no accessible name; 42 placeholders used as labels. | events pages, `AdminDashboardClient.tsx` |
| Focus | 39 × `focus:outline-none`; buttons and links have no visible focus style. | many |
| ARIA | 2 `aria-label`s total; no `aria-pressed` on filter chips; errors not announced (`role="alert"`). | `CommsBoardClient.tsx:255`, `app/(auth)/login/page.tsx:155` |
| Duplication | 22 copies of the same card class string; 7+ primary-button variants; no Button/Input/Field/Badge/EmptyState. | — |
| Bloat | `AdminDashboardClient.tsx` 1251 lines / 21 `useState`; `MinutesEditorClient.tsx` 958 (overlaps the dashboard's minutes editor); `CommsThreadDetailClient.tsx` 784; `DocBuilder.tsx` 732. | — |
| States | No `loading.tsx`, `error.tsx` or `not-found.tsx` anywhere; no skeletons or toasts. | `app/` |

### 5.5 UI work items (priority order)
1. Semantic CSS-variable tokens + real dark mode; delete the `!important` overrides.
2. `src/components/ui/` primitives, with `Field` wiring label `htmlFor`/`id` (fixes unlabeled inputs at once).
3. Admin shell: sidebar / mobile drawer with active state; remove the duplicate nav and the static heading.
4. Responsive public header with a mobile menu; show "Admin" only to admins.
5. `loading.tsx` / `error.tsx` per route group + root `not-found.tsx`; skeletons and a toast system.
6. Split `AdminDashboardClient` and `MinutesEditorClient`; share one minutes form + export module.
7. Focus-visible rings and ARIA pass (`aria-pressed`, `role="alert"`, `aria-current`).
8. Load Inter via `next/font`; define type, radius and primary shade scales.
9. Fluid preview sizes (`w-full max-w-[520px] aspect-[8.5/11]`), `px-4` main gutter.
10. Security UI from §5.2 (lock state, Devices & keys, safety codes, recovery wizard).

---

## 6. Phased roadmap

Every phase ends with: typecheck, lint, tests and build green; a deploy; and README/plan updated.

| Phase | Name | Scope | Exit criteria |
|---|---|---|---|
| **0** | Foundation repair | **Built (§8).** Fix React/Next version mismatch (React 19 for Next 16). Add ESLint, Vitest, Playwright and GitHub Actions CI. | CI green on `main`; branch protection on. |
| **1** | Security hardening | **Built (§8).** S-01 → S-21. Security headers + CSP. Revocable session cookies. Durable rate limiting. **Remove PIN login and PIN bootstrap.** Remove debug routes. Zod on every route. `proxy.ts`. | Header scan (securityheaders.com) A; disabled admin loses access within 1 minute in a test; no third-party script on `/admin`. |
| **2** | Passkeys + UI foundation | **Built (§8); passkeys made optional by D6 (2026-10-25): sign-in is an email link plus an authenticator-app code.** WebAuthn passkeys **required** for admin login (magic link only for first enrollment and lost-device recovery). Tailwind v4 upgrade, design tokens, shadcn/ui primitives, new admin shell. | Every admin enrolled with a passkey; admin routes reject sessions without passkey auth; all admin pages on the new shell. |
| **3** | E2EE core | **Built (§8).** `src/lib/e2ee/` (keys, envelopes, wrapping, sealing) with full tests. Keyring collection + rules. Device enrollment, safety codes, recovery key with two-trustee confirmation, Devices & keys page. | Two devices can share the WDK; removing one + rotating blocks it from new data (automated test); recovery drill passes. |
| **4** | E2EE rollout | **Built (§8).** Encrypt Admin Chat → Plans & Issues → draft minutes → signatures (sealed) → document history. Client-side search. Migration job. Rules updated to envelope validation. | Firestore console shows no plaintext in E2EE collections; migration verified; plaintext backups scheduled for deletion. |
| **5** | Governance features | **Built (§8).** Original roadmap items, built on the encrypted base: minutes approval workflow + versioning (with separation of duties: an admin cannot approve minutes they submitted, approval cannot change content in the same request, and approved minutes need an explicit, audited reopen), action-item tracking, template versioning, QR verification (signed hash of the published document; finalize must build the certificate PDF server-side from stored inputs and check each signature's role and certificate ID, instead of trusting a client-rendered PNG; store PDFs in Cloud Storage, not inside Firestore documents), attendance exports. | Per-feature acceptance. |
| **6** | Public & integrations | **Built (§8).** Public governance archive, `.ics` export, notification emails (content-free), autosave drafts (encrypted locally). | — |
| **7** | Assurance | **Built and merged; the external review, pen test and drills need people outside the codebase (§8, Phase 7).** External review of `src/lib/e2ee/`, pen-test of auth, incident-response runbook, key-rotation drill. | Findings fixed or accepted in writing. |
| **8** | Email broadcasts to members | **Built (8-A to 8-E, §10.8). Waiting on the owner's set-up steps before the first real send.** (§10). Members page with consent fields, unsubscribe + suppression, composer with a second-admin approval, resumable sending through Resend, delivery log. | Decisions D7–D11 accepted; a test broadcast reaches a seed list; one-click unsubscribe works; nothing is sent without approval. |
| **9** | Member outreach: calling tree and call campaigns | **Built and merged 2026-11-01 (9-A to 9-D, §12.7); members without email added 2026-11-04 (#82).** Encrypted phone numbers on the member roster, a persistent calling tree that splits members equally across BOD callers, call campaigns per announcement with an append-only, audited call log, a BOD progress view, and a "Copy for Messenger" bridge for the existing group chats. No SMS, voice, Messenger or Meta API integration (decisions D12–D16). | Decisions D12–D16 accepted; numbers are ciphertext in Firestore; a campaign splits members equally and every call attempt appears in the audit log without a number. |
| **10** | UI layout audit and upgrade | **Built and merged 2026-11-03 (§13; PR #77).** Two layout audits of every page at phone, tablet and desktop widths, and the upgrades they called for. | Audit findings fixed or accepted. |
| **11** | Officer positions, member groups and event tasks | **Built and merged 2026-11-05 (11-A to 11-D, §15.7; PRs #86, #87, #88, #94).** Editable officer positions with term dates, member groups with a lead (including the phone-tree callers group), a task checklist per event with templates, calling-tree suggestions from the callers group, and task counts on the Events list. Admins only. | Owner publishes the Firestore rules again and enters the officers (go-live checklist). |
| **12** | Reminders to team members | **Built and merged 2026-11-05 (12-A to 12-C, §16.6; PRs #95 and #96).** Email reminders about the tasks a person owns: sent by an admin from the event page (12-A), and an optional automatic daily digest of overdue tasks that is off until a super admin switches it on (12-B). Consented members only, with the unsubscribe link and the shared daily email limit. Admins only trigger it. Decisions D21–D26 taken as recommended. | Owner adds `CRON_SECRET` in Vercel if they want the digest, publishes the Firestore rules again, and sends one test reminder (go-live checklist). |
| **13** | Member profile | **Built 2026-11-05 (13-A to 13-D, §17.6).** A page per member with how long they have been a member, city and state (no street address), family members with optional phone numbers, a log of notes admins add, the history of calls to them, and how polite or rude each call was. Admins only. Decisions D27–D31 taken as recommended. | Owner reads §17.2 (what is encrypted, who can write notes and ratings) and §17.5 (privacy). |
| **14** | Push notifications | **Built 2026-11-06 (14-A, 14-B, 14-C; §18.6 to §18.8).** A phone or desktop notification for new admin chat messages, Plans & Issues activity and other alerts (minutes waiting, calls to make, a broadcast waiting for approval, security), on the devices where an admin switched it on. Content-free, like the emails. Admins only. Decisions D32–D36 accepted 2026-11-06. | Owner sets the three `VAPID_*` variables in Vercel and publishes the Firestore rules (go-live checklist) before push is used. |
| **15** | Delete a member | **Built 2026-11-06 (15-A, 15-B, 15-C; §20.6 to §20.8).** A super admin can remove a member and what is held about them from inside the app, with a preview, a typed confirmation and a record in the activity log, so a removal request no longer needs the Firebase console. Decisions D41–D46 accepted 2026-11-06. | Owner reads §20.2 and publishes the Firestore rules (go-live checklist). |
| **16** | Admin devices and push controls | **Built 2026-11-06 (16-A, 16-B, 16-C; §21.6 to §21.8).** A super admin can see every admin's push devices and turn any of them off, and can switch push off for the whole site and back on, closing the gaps listed in §18.8 (a lost phone that still gets alerts, no site-wide switch). Decisions D47–D50 accepted 2026-11-06. | Owner reads §21.2 and publishes the Firestore rules (go-live checklist). |
| **17** | Admin management | **Built 2026-11-06 (17-A, 17-B, 17-C; §22.6 to §22.8).** A super admin can see who is an admin, add an admin, turn an admin off or on, and change a role, inside the app, instead of editing Firestore by hand (runbook cases B and C). It can never turn off the last active super admin or yourself. Decisions D51–D56 accepted 2026-11-06. | Owner reads §22.2 before 17-A is used. |
| **18** | Change a member's email | **Built 2026-11-06 (18-A, 18-B; §25.6, §25.7).** A super admin can add, correct or remove a member's email address from the profile, keeping their history, notes, calls, groups and positions, instead of deleting and re-adding them. Decisions D57–D63 accepted 2026-11-06. | None before 18-A. |
| **19** | Minutes for any meeting | **Built 2026-11-06 (19-A, 19-B; §26.6, §26.7).** Record minutes for a meeting that isn't an event yet (a board call, an unplanned meeting) without leaving the minutes page, find the meeting in a searchable list, and move draft minutes to the right meeting. Decisions D64–D69 accepted 2026-11-06. | None before 19-A. |
| **20** | Search people and records | **Built 2026-11-06 (20-A, 20-B; §27.6, §27.7).** Ctrl/⌘ K (and the search button on phones) finds members, events, minutes, groups, positions and broadcasts by name, not only pages, and opens the record with Enter. Decisions D70–D75 accepted 2026-11-06. | None before 20-A. |
| **21** | Members list on phones, and changing many at once | **Built 2026-11-06 (21-A, 21-B, 21-C; §28.6 to §28.8).** Also: Set holder offers members' relatives (21-C). Each member row shows **Profile** and a **More…** menu instead of up to nine buttons, the list loads 50 at a time, and admins can tick several members to add them to a group, take them out of one, or turn them off or on in one step. Decisions D76–D81 accepted 2026-11-06. | None before 21-A. |
| **22** | Activity log page | **Built 2026-11-06 (22-A, 22-B; §29.6, §29.7).** A page that lists everything in the activity log, newest first, 50 at a time, filtered by person, area and dates, with links to the record and what changed; super admins also see the internet address and browser, and can download the filtered list. Decisions D82–D87 accepted 2026-11-06. | Owner runs the Firestore deploy for the two new indexes after it ships. |
| **23** | Copy, and email one group | **Planned 2026-11-06 (§30).** **Copy** an event (optionally with its tasks) or a broadcast as a new draft, and send a broadcast to **one group** (for example the cooking team) instead of everyone. Decisions D88–D93 accepted 2026-11-06. | None before 23-A. |

**Dropped (decision D4):** silent Admin Activity Analytics and the Admin Leaderboard. They conflict with the privacy goal. Aggregate governance stats (e.g. attendance per meeting) computed from approved minutes are still allowed.

---

## 7. Decisions (resolved 2026-10-21)

The owner accepted every recommendation.

| ID | Decision | Effect on the plan |
|---|---|---|
| D1 | **Paper recovery key held by two trustees** is required. | E2EE stays off until both trustees confirm (§4.3). Yearly recovery drill. |
| D2 | **Passkeys are required** for all admins. | Phase 2 makes passkey login mandatory; passkey PRF unlocks device keys (§4.2). |
| D3 | **PIN login is removed.** | Set `FEATURE_PIN_LOGIN=false` now; code, collection and rules deleted in Phase 1 (S-05, S-17). |
| D4 | **Silent admin analytics and the leaderboard are dropped.** | Removed from the roadmap (§6). |
| D5 | **UI library: shadcn/ui.** | Tailwind v4 upgrade + shadcn primitives in Phase 2 (§5.1). |
| D6 | **2026-10-25: authenticator app is the default strong sign-in; passkeys are optional.** Supersedes the "required" part of D2. Admins found passkeys too hard to set up. | Sign-in = email link + 6-digit authenticator code (TOTP), or a passkey. Both count as strong (`authMethod` `totp` / `passkey`). Device keys unlock with a passphrase unless the admin has a PRF passkey (D2's PRF unlock still works for those who choose it). |

---

## 8. Progress log

### Phase 0 — Foundation repair · done 2026-10-21
- **Upgrades:** React 18.2 → 19.3.1, Next 16.1.6 → 16.4.2, next-themes 0.4.6, @react-pdf/renderer 4.9, TypeScript 5.9.3, @types/node 22.
- **Build without secrets:** `src/lib/auth.ts` no longer connects to Firebase at import time, so `npm run build` works in CI without credentials.
- **Bug fixed:** the event announcement PDF route sent a stream cast to bytes; it now uses `renderToBuffer`.
- **Lint:** ESLint 9 flat config with `eslint-config-next`. 0 errors. 160 legacy warnings (mostly `any` and React Compiler hook rules) are capped by `--max-warnings 160`; the cap only goes down. Dead "home content blocks" code removed from the admin dashboard.
- **Tests:** Vitest (14 unit tests: signature encryption, rate limiter, HTML escaping, email normalization). Playwright smoke tests on desktop and mobile (admin redirect, login page, debug route hidden).
- **CI:** GitHub Actions runs typecheck, lint, unit, build, e2e and `npm audit --audit-level=critical`. Dependabot weekly.
- **Dependencies:** production advisories 44 → 18, 0 critical. `package.json` overrides were pinning vulnerable `undici` and `protobufjs`; now pinned to fixed versions. Remaining:
  - Tailwind 3 file-watcher chain (`braces`, `micromatch`, `chokidar`, `postcss-selector-parser`): build-time only, cleared by the Tailwind v4 upgrade in Phase 2.
  - `@grpc/grpc-js` 1.9 via the Firebase client and `firebase-admin` (plus `uuid`/`gaxios` via `google-gax`): even Firebase 13 pins this line. Not forced, because Firebase can't be exercised against real credentials in CI. Re-check on each Firebase release.
- **Owner action:** enable branch protection on `main` requiring the `CI` checks (GitHub → Settings → Branches).

### Phase 1 — Security hardening · done 2026-10-21
All 21 findings (S-01 to S-21) are fixed. Four were found during this phase: S-18 (signing links sent to a third-party QR service), S-19 (open redirect), S-20 (dev login usable in production), S-21 (admin email enumeration).

| Area | What changed | Proven by |
|---|---|---|
| Third-party scripts (S-01) | Public pages and secure areas use separate root layouts; only the public one loads the GoFundMe snippet. Crossing between them is a full page load. | e2e: marker script runs on `/`, is gone after clicking into `/admin` |
| CSP and headers (S-02, S-12) | `proxy.ts` sets a strict nonce CSP on `/admin`, `/login`, `/sign`, `/c/`, `/docs` and a baseline CSP on public pages. HSTS, nosniff, frame denial, Referrer-Policy (no-referrer on signing links), Permissions-Policy, no-store on API and secure pages. | Unit tests for the policy; e2e checks every secure page loads with zero CSP violations and that injected inline scripts and event handlers are blocked |
| Sessions (S-03, S-09) | Revocable Firebase session cookie `__session` (HttpOnly, Secure, SameSite=Lax, 8 h), verified with revocation checks. Issued only to active admins or allowlisted members. Logout revokes all of the user's tokens and signs out the Firebase client. | Emulator integration tests: allowlist, cookie flags, a copied cookie stops working after logout |
| Database access (S-03) | Firestore rules require an active `admins/{uid}` record as well as the admin claim. | Emulator rules tests (disabled and deleted admins are refused; the old rules fail these tests) |
| Rate limits and IPs (S-04) | Firestore-backed limiter with hashed keys, fails closed. Right-most `X-Forwarded-For` (`TRUSTED_PROXY_HOPS`) or Vercel `x-real-ip`. | Unit tests |
| PIN login (S-05, S-17) | Removed entirely. One-time `POST /api/admin/bootstrap` (secret + email) for the first admin. | — |
| Secrets and logs (S-06, S-08) | Constant-time comparisons; no emails, links, codes or claims in logs. | Unit tests for `safeEqual` |
| Links (S-07, S-19) | Magic links built from `NEXT_PUBLIC_APP_URL`; `safeRedirectPath()` on both login pages. | Unit tests |
| Signing (S-10, S-11, S-18) | ID format check, rate limits, real-PNG and 200 KB checks, single-use transaction, AES-GCM bound to the session with key IDs for rotation; QR codes generated in the browser. | Emulator integration tests; unit tests |
| Debug and dev routes (S-13, S-20) | `/api/debug/*` deleted; dev login always off in production. | e2e (404); unit tests |
| Webhook (S-14) | Fixed organization, size cap, Zod schema. | Unit tests for the HMAC check |
| Input validation (S-15) | `parseJsonBody()` + Zod schemas on every route that reads a body. | Unit tests for the helper |
| CI (S-16) | CodeQL (security-extended), gitleaks secret scan, emulator job, critical-advisory audit gate. History scanned: no committed keys found. | CI |

**Owner actions after deploying Phase 1**
1. Set `NEXT_PUBLIC_APP_URL` to the production origin. Make sure Firebase Auth's authorized domains list only your real domains.
2. Deploy the new Firestore rules: `npx firebase deploy --only firestore:rules` (or paste `firestore.rules` into the console).
3. In Firestore, add a TTL policy on the `expiresAt` field for the `rateLimits` collection group.
4. Remove `FEATURE_PIN_LOGIN`, `ALLOW_DEV_ADMIN_LOGIN` and `DEV_ADMIN_LOGIN_TOKEN` from production settings, and delete any old `organizations/ghmo/pins` documents.
5. Set `DOCGEN_SIGNATURE_ENC_KEY_BASE64` if it isn't already set.
6. Everyone has to sign in again once, because old session cookies are no longer accepted.
7. Turn on branch protection for `main`, requiring the CI, CodeQL and secret-scan checks.

### Phase 2 — Passkeys + UI foundation · done 2026-10-21
**UI foundation**
- Tailwind 3.4 → 4.3.3 (official upgrade tool). This also cleared the Tailwind 3 advisory chain: production advisories 18 → 11.
- Semantic design tokens (light and dark) using shadcn/ui names. Real dark mode: the `!important` overrides are gone and 865 hard-coded palette classes were migrated. Printed-document previews stay white.
- shadcn/ui primitives in `src/components/ui` on Radix (button, input, textarea, label, field, card, badge, alert, dialog, sheet, separator, skeleton, toasts, empty state). The shadcn CLI couldn't reach `ui.shadcn.com` from the build sandbox, so the sources were written in shadcn's format. `components.json` is in place, so `npx shadcn add` works wherever the site is reachable.
- Self-hosted Inter (no Google Fonts request), a global focus ring, and reduced-motion support.
- **Admin shell:** grouped sidebar with `aria-current` on desktop; top bar with a slide-out menu on phones; a skip link. The duplicate nav and static heading are gone.
- **Public header:** a mobile menu; the Admin link shows only to admins, and the footer has "Admin sign in".
- `loading.tsx` / `error.tsx` for the admin, public and member areas.
- Fix: after streaming was added, admin pages' redirects became client-side and could be hidden. The admin layout is now a single server-side gate that redirects before anything streams.
- Only Admin Chat and Plans & Issues wait for the browser Firestore connection; other admin pages no longer block on it.

**Passkeys (decision D2)**
- WebAuthn with user verification and discoverable credentials. Challenges are single-use and expire after 5 minutes. The RP ID and origin come from `NEXT_PUBLIC_APP_URL`. Failures are rate-limited and all give the same answer.
- Sessions carry `authMethod`. Admin pages, admin APIs and Firestore rules require `passkey`. A magic-link session can only create a passkey, check its status, or sign out.
- Recovery approval: a new passkey added through a magic link by an admin who already has one stays pending until another admin approves it.
- `/admin/security`: list, add, remove and approve passkeys. Each passkey records PRF support ("Encryption-ready"), which Phase 3 uses to unlock device keys.
- **Tests:**
  - A software WebAuthn authenticator plus 10 emulator integration tests: setup, approval, phishing origin, replay, missing user verification, disabled admin, last-key guard.
  - Rules tests for magic-link and pre-passkey tokens.
  - A real-browser end-to-end test with Chromium's virtual authenticator against the emulators.

**Owner actions after deploying Phase 2**
1. Make sure `NEXT_PUBLIC_APP_URL` is the exact production origin. Passkeys are bound to that domain, so changing the domain later means re-creating passkeys.
2. Deploy the updated `firestore.rules`.
3. Each admin: open `/admin/login`, request an email link, create a passkey, and then (recommended) add a second passkey on another device under Admin → Security.
4. Add a Firestore TTL policy on `expiresAt` for the `webauthnChallenges` collection group (like `rateLimits`).

### Phase 3 — E2EE core · done 2026-10-21
**Design as built** (refines §4.2–§4.3):
- **Device keys:** P-256 ECDH + ECDSA per browser. The private keys are kept in IndexedDB only in sealed form, under a key derived (HKDF) from the admin's **passkey PRF** output. A passphrase (PBKDF2-SHA-256, 600k) is the fallback for passkeys without PRF. Unlocking needs the device *and* the passkey/biometric. Opened keys are non-extractable and live in memory only until lock, sign-out or tab close.
- **Workspace key per epoch:** each copy is wrapped to a recipient with ephemeral ECDH → HKDF-SHA-256 → AES-256-GCM. The epoch and recipient are bound as AAD, so a copy can't be replayed for another epoch or recipient.
- **Recovery key:** the **private half of a P-256 key pair**. The paper copy is that private scalar: 14 groups of Crockford base32 plus a checksum, with look-alike letters tolerated. Every epoch is wrapped to the recovery *public* key, so rotation never needs the paper copy.
  - **Proof of possession:** to activate a device with the recovery key, the client decrypts a token that was wrapped to the recovery key; the server stores only the token's hash.
- **Record envelopes:** AES-256-GCM with AAD = exact Firestore path + document ID + epoch + writing device, plus an ECDSA signature by that device. Ready for Phase 4.
- **Safety codes:** 20 digits computed from a device's public keys, compared by phone or in person before approving it.

**Server rules (transactions):**
- Setup is super admin only, happens once, and needs two different trustees.
- Approval is done from one of the approver's active devices, or with recovery proof on the admin's own device. The key copies must cover every epoch.
- Rotation must be exactly the next epoch, wrapped for every remaining active device plus recovery. Revoked devices' copies are deleted, and only super admins can revoke another admin's device.
- Replacing the recovery key rewraps every epoch, so the old paper copies stop working.
- Firestore rules keep the whole keyring server-only.

**UI:** Admin → Encryption:
- the setup wizard (device keys → recovery key shown once with Print → re-type two groups → two trustees confirmed);
- unlock and lock, plus a lock-state badge in the sidebar;
- pending approvals with safety-code confirmation;
- device list with revoke + rotate, and "Rotate keys now" (the button now reads "Make new keys now");
- recovery-key test (drill), recovery-key replacement, and activating a device with the recovery key.

**Exit criteria met:**
- Two devices share the workspace key; revoking one and rotating locks it out of new data. Covered by a unit lifecycle test and emulator API tests.
- The recovery drill passes, in unit tests and in the browser.
- Tests:
  - 34 crypto unit tests, with a coverage gate (100% lines and functions) on `src/lib/e2ee`.
  - 8 keyring API integration tests with real crypto against the emulators.
  - A real-browser test using Chromium's virtual authenticator with PRF: Alice turns encryption on, locks, unlocks after a reload, and runs the recovery drill; Bob sets up a device; Alice compares safety codes and approves; Bob unlocks.

**Bugs found and fixed during the phase:**
- Admins without a `createdAt` field were dropped from `listAdmins` (an `orderBy` quirk), so they showed as "Unknown admin" and were flagged as inactive.
- A just-approved device looked unlocked while holding no workspace keys; it now loads them as soon as it is approved.

**Known limits** (also in §4.5):
- A device revoked later keeps whatever it already decrypted. Rotation only protects data written afterwards.
- Web E2EE trusts the JavaScript the server sends; safety codes guard against a server swapping keys, but not against malicious code.

**Owner actions after deploying Phase 3**
1. A super admin opens Admin → Encryption and runs setup. Do this with both trustees present, so each can take a paper copy straight away.
2. Every other admin sets up each of their devices; another admin approves each one after comparing the safety code by phone or in person.
3. Put a yearly reminder on the calendar: test the recovery key (Admin → Encryption → Test).


### Phase 4 — E2EE rollout · done 2026-10-21
**Design as built** (refines §4.4 and §6):
- **Gating:** rules treat the workspace as "encrypted" once `e2ee/state.enabled` is true. From then on, private fields must be stored as an envelope written by one of the caller's own active devices, and plaintext writes are refused. Before that, plaintext still works. Pages that show private data ask the admin to unlock first (`EncryptionGate`).
- **Admin Chat:** `{body}` is encrypted. The audit log records that a message was sent, never what it said (the audit route ignores `summary`).
- **Plans & Issues:** title and body, the conclusion text, comments and each vote's value are encrypted. Status, priority, timestamps, authors and who voted stay readable (rules need them). Vote counts are no longer stored on the thread: each browser decrypts the votes and tallies them, because public counts would have revealed how each admin voted.
- **Meeting minutes:** drafts and submitted minutes keep their content (chair, agenda, summary, decisions, action items, attendance, signatures) inside `enc`; approval notes inside `approvalEnc`. Minutes are server-written only (rules deny direct writes); the API validates the envelope and the writing device, and refuses plaintext content once encryption is on. **Approval publishes a plaintext copy** (`published`) for the public pages, supplied by the approver's browser; returning to draft deletes it. Approving and saving content are separate requests. Lists and search decrypt on the client.
- **Signatures:** the signing page seals the image to the workspace sealing key (ephemeral ECDH → HKDF → AES-GCM, bound to the session and epoch). The server stores only ciphertext; an unlocked admin device opens it. The old server-side AES key is used only for signatures collected before encryption.
- **Document history:** saved documents keep inputs inside `enc`. On finalize, the browser builds the PDF (as JPEG, to stay under the 1 MiB document limit) and encrypts it with the inputs. Finalized documents now get `status: "finalized"`, so the existing edit lock works.
- **Migration:** Admin → Encryption → "Encrypt existing records". An unlocked device encrypts each legacy record, decrypts it again to prove it matches, and the server swaps plaintext for the envelope only if the record is unchanged and the envelope comes from the caller's own device. Covers chat, threads, conclusions, comments, votes, draft/submitted minutes and saved documents. **Approved minutes stay public.** Safe to run again.

**Exit criteria met:**
- With encryption on, browser tests read the stored data directly and find only ciphertext for chat, threads, comments, conclusions, votes, draft minutes, signatures and saved documents; audit entries contain no content.
- Migration test: seeds plaintext in every area, runs the job, finds none left, and the data is still readable afterwards.
- Tests: 116 unit, 67 rules, 7 real-browser (virtual passkey with PRF) including a second admin reading and voting.

**Bugs found and fixed during the phase:**
- Chat audit entries sent the first 80 characters of every message in plaintext.
- Next 16 passes `params`/`searchParams` as promises: the thread detail page, the minutes page (`?mode=records` was ignored), the document generator (`?docId=` was ignored) and the signing page all read them synchronously.
- The admin events list returned timestamps the minutes editor couldn't parse, so no past event could be selected.
- Finalized certificates never got `status: "finalized"`, so the edit lock never applied.
- CSP `base-uri 'none'` blocked html-to-image (document exports); it is now `'self'`. Cross-origin base tags are still refused.
- Removed the unused `AdminDashboardClient` (it still wrote plaintext minutes).

**Known limits:**
- **Backups made before the migration still contain the old plaintext.** Delete them once they are no longer needed (Firestore exports/PITR retention, any manual exports).
- Approval trusts the approver's browser to supply the content to publish; Phase 5 adds separation of duties and server-side checks.
- The migrated record's envelope is signed by the migrating admin's device, not the original author's (the readable `createdBy` is unchanged).
- Encrypted finalized certificates are capped near 1 MiB; Phase 5 moves PDFs to Cloud Storage.
- The events collection is read from two paths (`organizations/ghmo-site/events` by the admin list, `organizations/ghmo/events` by the public minutes route). Worth unifying. *(2026-11-02: every read now merges both, edits act where the event is, new events go to `organizations/ghmo/events`; see §13.6 10-B.)*
- Metadata stays readable: who wrote what and when, thread status, event titles, who voted.

**Owner actions after deploying Phase 4**
1. Make sure encryption is on and every admin has an approved device (Admin → Encryption).
2. A super admin (or any admin with an unlocked device) opens Admin → Encryption and runs **Encrypt existing records** once. Keep the page open until it says Done.
3. Deploy the updated `firestore.rules` (`firebase deploy --only firestore:rules`).
4. Delete older Firestore backups/exports, and review who can still read the Firebase console.
5. Any signatures collected before encryption was turned on must be finalized or discarded; they expire within minutes.

### Phase 5 — Governance features · done 2026-10-21
**Built:**
- **Minutes approval workflow.** `planTransition` (pure, unit-tested) decides every status change inside a Firestore transaction.
  - The approver can't be the submitter.
  - Submitting stores a SHA-256 of the canonical content (the browser computes it for encrypted minutes). Approving must publish content with the same hash, so approval can't change the minutes. A mismatch is refused (`CONTENT_CHANGED`).
  - Editing submitted minutes returns them to draft.
  - Every approval writes an immutable `versions/{n}` snapshot (published content, hash, who submitted and approved).
  - Reopening approved minutes needs a reason of at least 10 characters, unpublishes them, and is audited (`minutes_reopened`).
- **Action-item tracking.** Admin → Action Items lists items from approved minutes (public content). Status and notes are separate records keyed by minutes ID + a hash of the task, encrypted once encryption is on (rules enforce the envelope), and covered by the migration job.
- **Attendance export.** CSV of the filtered records, one row per person. Cells starting with `= + - @` are defused against spreadsheet formula injection.
- **Template versioning.** Each template has a `version`; documents store it and warn when opened against a newer template.
- **Certificate verification.**
  - Each certificate gets a random 16-character code, shown as a QR code on the certificate.
  - On issue, the server writes a record (certificate number, template, version, issue time, SHA-256 of the issued PDF) signed with an HMAC. The key is `CERTIFICATE_SIGNING_KEY_BASE64`, kept out of the database, so someone who can only write to Firestore can't forge a record.
  - `/verify/{code}` shows the number, type and date, never names. Visitors can check a PDF against the issued file; hashing happens in their browser.
  - Finalize now checks every signature: it was collected for this certificate number and for the role it's placed under, and no signature fills two roles. The certificate, its verification record and the used sessions are written in one batch.
  - The issued PDF downloads on finalize.

**Decisions and limits:**
- **Cloud Storage for PDFs was not built.** New Firebase projects may need a paid plan for Storage, which conflicts with the free-tier rule. Encrypted certificates stay inside their Firestore document (about 1 MiB cap, JPEG-compressed). Revisit if the owner enables billing.
- **The server does not rebuild the certificate from stored inputs.** With end-to-end encryption on, the server can't read the inputs. The browser builds the PDF and sends its hash; the server verifies who signed what and for which certificate, then signs the record. An admin could still issue a certificate with wording that differs from the signed template; this is bounded by trust in the issuing admins and the audit log.
- **Only one admin?** The approver can't be the submitter, so minutes can't be approved. Keep at least two active admins.
- A reopen reason is stored in plain text on the minutes record and in the audit log.
- The verification page has no revoke screen yet. The record has a `status` field, and an admin can set `revoked` in Firestore for now.

**Owner actions after deploying Phase 5**
1. Set `CERTIFICATE_SIGNING_KEY_BASE64` in the hosting environment (`openssl rand -base64 32`). Back it up with your other secrets; losing it invalidates every QR code.
2. Deploy the updated `firestore.rules`.
3. Make sure at least two admins are active.

### Phase 6 — Public & integrations · done 2026-10-22
**Built:**
- **Public minutes archive** (`/minutes`, `/minutes/{id}`, linked from the footer). Approved minutes only, grouped by year. The page shows agenda, discussion, decisions, action items and signatories, but **attendance only as counts** (names are not shown, since the pages are indexable), and nothing about who recorded, submitted or approved. Drafts and submitted minutes are not reachable by id.
- **Calendar export:** `/api/calendar` (subscribable feed of published events) and `/api/calendar/{id}` ("Add to calendar" on the event page). Output is escaped and line-folded per RFC 5545, in UTC, and a title can't inject extra properties.
- **Notification emails (content-free, opt-in):**
  - Each admin turns them on under Admin → Security.
  - They say that something happened and link to the page: new Admin Chat activity, new Plans & Issues activity, or minutes waiting for approval. They never include titles, names or text.
  - At most one email of each kind per person every 30 minutes. The person who caused the activity is not emailed.
  - They are sent through Resend's free tier, and only when `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL` are set; otherwise nothing is sent.
  - Chat and thread activity is written straight to Firestore, so the browser asks the server to send the email (`POST /api/admin/notify`, which takes only the kind of activity). Minutes submissions trigger it server-side.
- **Encrypted local autosave:** unsent minutes and new-thread forms are saved in the browser, encrypted with the workspace key and bound to the admin. They are offered back as "Restore draft" after a reload or crash, removed when the form is sent or discarded, and wiped on sign-out or when the device is forgotten. Nothing is saved while encryption is off or the device is locked, and drafts never go to the server.

**Decisions and limits:**
- The email provider sees recipient addresses and that activity happened (timing), though never content. If that is too much, leave the two env vars unset.
- Autosave covers minutes and new threads. Comments, chat compose and the document builder are not autosaved yet.
- A draft is readable by any admin who unlocks a device in the same browser profile; sign out when sharing a computer (sign-out wipes drafts).
- The calendar feed is public for published events only; unpublished events never appear.

**Owner actions after deploying Phase 6**
1. Optional: create a Resend account (free), verify the sending domain, and set `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL`. Each admin then opts in under Security.
2. Nothing else; no rules or data changes.

### Phase 7 — Assurance · built and merged; remaining work needs people outside the codebase (updated 2026-10-23)
All code, tests and documents for this phase are done and merged (the signed device list closed R1/R2/R9). What is left is in the checklist below and, in order, in `docs/GO_LIVE_CHECKLIST.md`.
**Done in this session:**
- **Independent code review.** A separate reviewer, given only the code and a threat model, traced the encryption design, the Firestore rules, the key routes and the auth flows. Its 16 findings were triaged by reading the code paths; results below.
- **Automated anonymous and wrong-user sweep** (`tests/e2e-auth/route-sweep.spec.ts`): every API route is called (a) with no credentials and (b) as a stranger, a disabled admin and a magic-link-only admin. Everything not public by design must answer 401/403/404/405, and nothing may answer an anonymous write with success or a server error. A new route that forgets its guard fails here. Also checks that cross-site, cookie-authenticated writes are refused.
- **Key-rotation drill automated** (`tests/e2e-auth/rotation-drill.spec.ts`) and written up as a yearly manual drill (`docs/KEY_ROTATION_DRILL.md`).
- **Incident-response runbook** (`docs/RUNBOOK_INCIDENT.md`): lost device, stolen session, departed admin, lost recovery key, database compromise, forged certificate, wrongly published minutes.
- **Dependency audit.** Updated 2026-10-23: `firebase` 13, `firebase-admin` 14, `@firebase/rules-unit-testing` 6, `lodash`/`basic-ftp` overrides raised, and `@grpc/grpc-js` pinned to 1.14.6 under the Firebase web SDK. `npm audit --omit=dev` reports 0 vulnerabilities. The five moderate findings inside the dev-only `firebase-tools` were cleared with scoped overrides (`uuid` 11.1.1 under `gaxios`, `@opentelemetry/core` 2.8.0 under `@google-cloud/pubsub`); the emulator, integration and browser suites pass with them. `npm audit` reports 0 vulnerabilities including dev dependencies. Remove the overrides once `firebase-tools` ships the fixes itself. **`jwks-rsa` pinned to 3.2.2 under `firebase-admin` (2026-10-23):** `firebase-admin` 14 pulls `jwks-rsa` 4, which needs the ES-module-only `jose` 6; on Vercel that crashed every server-rendered page that loads `firebase-admin/auth` (including `/admin/login`) with `ERR_REQUIRE_ESM`. `jwks-rsa` 3.2.2 uses `jose` 4 (CommonJS-compatible) and exposes the calls `firebase-admin` uses. `tests/unit/firebaseAdminLoad.test.ts` guards it; remove the override only once that test passes without it. **`zod` 3.22 → 4.6.7 and `body-parser` patched (2026-10-26)** for GHSA-mrhx-c7xc-m3w5 (memory exhaustion while validating oversized arrays; fixed only in zod 4) and the body-parser denial-of-service advisory (dev tooling). Zod 4 changes handled: `z.record` now needs an explicit key type, `ZodError.errors` is `.issues`, and a record keyed by a fixed set of names must be `z.partialRecord` when keys may be missing (the signing finalize request was rejected until that was changed; `tests/e2e-auth/signing-encryption.spec.ts` covers it). `npm audit` reports 0 vulnerabilities.
- **Dependency audit, 2026-10-31.** New moderate advisories in `glob` (GHSA-3g3m-2fjr-6pw4) and `minimatch` (GHSA-g3hv-75wg-m249) reached production through `firebase-admin` → `gaxios`/`google-gax` → `rimraf` → `glob`. The project-wide `glob` override moved from 10.5.0 to 14.0.3, which also brings the fixed `minimatch` 11 with it. `npm audit --omit=dev` reports 0 again. Still flagged, dev tools only: `minimatch` 3/5/6/10 inside the ESLint plugins and `firebase-tools`. The only fixed version (11) changes how the package is loaded, so forcing it would break those tools; they run only on developer machines against our own patterns. Smoke-tested `rimraf`, `archiver`, `archiver-utils` and `exegesis` with `glob` 14, plus the full test suite. Same day: Dependabot PRs #62 (Next.js 16.4.3) and #66 (radix-ui 1.8.1) merged after the full local gate; #64 (svix) closed and the unused package removed; #65 (`@types/node` 26) and #63 (TypeScript 7) closed with Dependabot ignore rules, because the site runs on Node 22 and typescript-eslint does not support TypeScript 7 yet.
- **Removed the `@google-cloud/storage` stub, 2026-10-31.** The override pointed `firebase-admin`'s optional storage dependency at `stubs/google-cloud-storage` to drop its vulnerable dependencies. npm resolves `file:` overrides relative to the dependent package, though, so the stub was never installed (a dangling link, and `npm ls` reported errors). The real `@google-cloud/storage` 8.4.0 now has no advisories, so the override and the stub are gone. The app doesn't use Cloud Storage; the package is only loaded if `firebase-admin/storage` is. `npm ls` is clean and the production audit is still 0. The browser-test fix for the CI failures (waiting for React's streamed page parts after sign-in) is in `tests/e2e-auth/helpers.ts`.

**Fixed (from the review and the drill):**
| # | Finding | Fix |
|---|---|---|
| R3 | Donation webhook payloads were publicly readable: Firestore ORs overlapping `match` blocks, so the public read of `donations/**` also covered `webhookEvents`. | Donations are admin-only in the client SDK (public totals come from the API route). Rules test added. |
| R8 | Any admin could erase or forge audit logs. | `auditLogs` is read-only for admins; the server writes them. Rules test added. |
| R7 | Writes weren't tied to the current epoch, so a device that missed a rotation (or a revoked device) could keep writing under an old key. | Rules and server routes require `enc.epoch == currentEpoch` for new envelopes. Rules test added. |
| R5 | The 12-digit safety code (~40 bits) was short enough to search for a look-alike key pair. | 20 digits (~66 bits). Docs updated. |
| R4 | A stolen super-admin session cookie could replace the recovery key, so the attacker could read data after the next rotation. | The change must be signed by one of the admin's active devices over the exact new key (2-minute window). Integration tests added. |
| R1 (part) | A server could offer wraps for an invented future epoch. | Clients ignore wraps above the current epoch. |
| R11 | One bad wrap blocked unlock. | Unreadable older epochs are skipped; the newest must open. Unit tests added. |
| R6 (part) | A thread could go from open straight to closed. | Rules refuse it. |
| R13 | An approver could change the meeting type during approval (not covered by the content fingerprint). | Meeting type can't change with a status change. |
| R15 | Notification links used the request origin. | They use the configured app URL. |
| — | Defense in depth against cross-site requests. | Cookie-authenticated writes marked cross-site / same-site by the browser (`Sec-Fetch-Site`) are refused. |
| Drill | Pending, revoked and no-device admins saw "Something went wrong" instead of guidance (the gate's button crashed). | Button `asChild` fixed. Found by the rotation drill. |

**Signed device list (fixes R1/R2/R9):**
Every key change is now an entry in an append-only, hash-chained log (`organizations/ghmo/e2ee/state/roster`), signed by an already-trusted device (or by the recovery key when a lost device is re-enrolled). Entries commit to the digest of each key copy ("wrap") they create. Each browser replays the log, checks the server's device, recovery-key, epoch and wrap records against it, and pins the newest entry it has seen (rollback or rewrite is refused). Workspaces created before this get a one-time "Seal the device list" action for a super admin. A 20-digit workspace fingerprint (hash of the first entry) is read out when adding a device, so the first entry is trustworthy. The server also refuses unsigned or inconsistent changes. Tests: `tests/unit/e2ee/roster.test.ts`, the "signed device log" integration suite, and `tests/e2e-auth/roster-integrity.spec.ts`.
Residual limits: a server that also serves the site's JavaScript can still serve a modified client; people who have never opened the page can be rolled back to any older log head until they next pin; signers on the public signing page cannot verify the sealing key and rely on the link.

**Accepted, in writing (owner to sign off):**
| # | Finding | Why accepted for now |
|---|---|---|
| R6 (rest) | Rules don't count votes: any admin can overwrite a conclusion while earlier approvals stand, or finalize without quorum. | The board is a small trusted group, actions are audited, and the UI enforces the workflow. A server-side finalize route is the fix if quorum must be enforced. |
| R10 | Any admin can overwrite another admin's draft document or migrate someone else's legacy record. | Admins share these documents by design; every change is audited. |
| R12 | One admin can create, sign and finalize a certificate; with encryption on, the server endorses the browser's PDF hash. | By design for a small organization; the certificate record names the issuing admin. Require two finalizers if that is wanted. |
| R14 | Rate limits depend on `TRUSTED_PROXY_HOPS` matching the real proxy chain. | Hosting-specific. **Owner action:** confirm the setting after deploying. |
| R16 | Rules accept `authMethod == "dev"` tokens. | Only the dev login can mint them and it is disabled in production. **Owner rule:** never point a local/dev environment at the production Firebase project. |

**Still needs people outside this session (Phase 7 is not complete until these are done; see also `docs/GO_LIVE_CHECKLIST.md`):**
1. **External review** of `src/lib/e2ee/` and the key-handling routes by someone qualified in applied cryptography, including the signed-roster design above.
2. **Penetration test** of sign-in (passkeys, magic link), session handling and the public pages by an independent tester on the real deployment.
3. **Run the manual key-rotation drill** and the **recovery-key test** with both trustees, and record the date.
4. Fill in names and numbers in `docs/RUNBOOK_INCIDENT.md`, and print it with the recovery keys.
5. Confirm `TRUSTED_PROXY_HOPS`, delete pre-encryption backups, set `CERTIFICATE_SIGNING_KEY_BASE64`.

### Authenticator-app sign-in (decision D6) · built 2026-10-25
**Why:** passkeys were too hard for some admins. The replacement has to stay strong against a stolen email inbox and against guessing.

**Built:**
- **Flow.** Email link (first factor) then a 6-digit code from an authenticator app (second factor) → session with `authMethod: "totp"`. First time: the admin scans a QR code, types the first code, and is shown 8 one-time **recovery codes** once. Passkeys still work and are optional.
- **Code checking** (`src/lib/totp.ts`, RFC 6238 SHA-1/30 s/6 digits, tested against the RFC vectors): ±1 step for clock drift; a step at or before the last one used is refused (no replay), checked inside a Firestore transaction; 6 tries per admin and 30 per IP per 10 minutes; every failure and success is audited.
- **Seeds** are stored encrypted (AES-256-GCM, key derived per admin from the server's `DOCGEN_SIGNATURE_ENC_KEY_BASE64` via HKDF, bound to the admin; supports the existing previous-keys rotation). The Firestore rules give clients no access to `admins/{uid}/totp`. Recovery codes are stored only as SHA-256 hashes and work once.
- **Takeover protection.** An admin who already has an approved passkey cannot add an authenticator app from an email link alone (they must be signed in with the passkey). An admin who has an authenticator app cannot replace it from an email link: they sign in with a code or a recovery code, or a **super admin resets it** (Security page; signs the admin out everywhere). A first-time enrolment from an email link is trusted exactly as a first passkey was: whoever controls the inbox at that moment.
- **Encryption unlock.** Admins without a passkey lock their device keys with a passphrase (12+ characters, PBKDF2-SHA-256 600k, entered at each unlock); the setup form now defaults to that when the admin has no passkey.
- **Rules / gates.** `isStrongAdminAuth` and the Firestore `hasStrongAuth()` accept `totp`; `magic_link` alone is still never enough. Rules tests cover it.
- **Tests.** `tests/unit/totp.test.ts`; `tests/e2e-auth/authenticator.spec.ts` (setup, wrong and replayed codes, recovery code once, no email-only enrolment next to a passkey, super-admin reset and sign-out, passphrase encryption setup and unlock).

**Trade-offs to know about:**
- An email link plus the code is weaker than a passkey (a phishing page can relay both live) but far stronger than an email link alone. Admins who can use a passkey are still better protected.
- TOTP seeds are readable by the server, so someone who gets both the database and `DOCGEN_SIGNATURE_ENC_KEY_BASE64` could generate codes. Passkeys have no such secret on the server.
- Losing the phone and the recovery codes needs a super admin to reset the app.

**Owner actions:** make sure `DOCGEN_SIGNATURE_ENC_KEY_BASE64` is set in Vercel (the authenticator feature needs it); each admin sets up their app at next sign-in; tell admins to store recovery codes somewhere other than their email.

### Admin interface refresh · built 2026-10-26
**What changed (all of `/admin`):**
- **Shell:** wider sidebar with a branded header, an active-page marker, a signed-in user card (name and role), and the encryption status, theme switch and Sign out always in view. A slim top bar holds **"Jump to a page" (Ctrl/⌘ K)**: type a few letters, arrow keys and Enter. On phones the menu drawer keeps the user card and Sign out pinned and every page reachable.
- **Pages:** one clean page header (no repeated "Admin" label or heavy box), consistent page width and padding on every page (five pages had added their own), calmer cards.
- **Dashboard:** greeting with the admin's first name; stat tiles with a progress bar toward the fundraising goal and a "to approve" count; compact quick-action tiles; recent minutes with status badges that work in dark mode; a recent-activity timeline with relative times ("5 min ago"); the dashboard filter moved below the stats and is reached with the `/` key.
- **Bug fixed on the way:** "Recent audit activity" showed no titles for real events (it read fields the audit log doesn't have). It now uses the event's summary or a readable form of its action name.
- Small tidy-ups: double padding in the notification and encryption-migration cards, an unused icon set removed, the lint warning cap lowered from 114 to 110.

**Tests:** `tests/unit/adminView.test.ts`; `tests/e2e-auth/admin-shell.spec.ts` (greeting and audit titles, user card, Ctrl+K search with keyboard, `/` filter, phone menu keeps Sign out and every page in view).

---

## 9. What is next (updated 2026-11-03; Phases 11–17 since built, see §6 and §15–§22)

Phases 0–10 and decision D6 are built (Phase 10, the UI audits and upgrades, merged in PR #77), and the round-2 audit fixes and speed pass are done (§14). In the codebase, the round-3 leftover (L8 artwork) and the round-2 security lows (S7 per-email sign-in limit, S10 `__Host-` cookie, S15 Firestore rule shape checks, S16 SHA pinning, S18 permission matrix) are waiting; everything else left needs the owner or outside people. In order (the same list, with checkboxes, is `docs/GO_LIVE_CHECKLIST.md`; 6 of 38 items were ticked on 2026-11-03, including both Phase 10 audit reviews; the Dependabot line stays unticked while one dev-only alert waits on upstream):

1. ~~Make the repository public, or fix GitHub Actions billing.~~ Done: CI runs again (PR #77's checks ran on GitHub).
2. **Branch protection on `main`**, requiring the CI, CodeQL and secret-scan checks. Needs step 1 first.
3. **Firestore:** deploy the rules, set the `expiresAt` TTL policies (`rateLimits`, `webauthnChallenges`), delete backups made before encryption was on.
4. **People and keys:** at least two active admins, each with an authenticator app and recovery codes kept outside email; encryption set up with both trustees; every admin device approved; seal the device list; run "Encrypt existing records".
5. **Assurance (outside the codebase):** external cryptography review, penetration test, key-rotation drill and recovery-key test, fill in `docs/RUNBOOK_INCIDENT.md`.
6. **After going live:** open the main pages with the console open and confirm there are no red errors.
7. **Site settings for Phase 10's slots (owner):** `GOFUNDME_PUBLIC_URL` (Donate buttons), `CONTACT_EMAIL` (contact line), social profile links, and optionally community photos for the home and Donate pages (`src/components/public/homeHero.ts`).

**Weekly progress check.** A scheduled routine ("Weekly go-live checklist progress", Mondays 08:41 UTC) is meant to report checklist progress. As of 2026-10-27 its sessions start without the repository attached, so it fails; the same report was produced by hand from a normal session. Fix it in claude.ai (select `rob2rhyme/ghmo` on the routine) or recreate the routine there.

### 9.1 Mass text or call (Text-em-All style) — not in scope today

Checked 2026-10-27: **the platform has no text-message or phone-call feature.** The only outbound messaging is:
- **Admin sign-in email** (magic link).
- **Content-free notification emails** to other opted-in admins (Resend; a link only, at most one per kind per 30 minutes). Admin-only, not a broadcast tool.
- No phone numbers are stored anywhere (`members` holds name, email, status and roles), and there is no SMS or voice provider, queue or opt-out handling.

If the owner wants it, it would be a **new phase**. The owner chose email first; that is **Phase 8, planned in §10**. Text/call would be a later phase and needs these decisions first:
| Question | Why it matters |
|---|---|
| Who receives messages (members, donors, event attendees)? | Defines the audience list and where numbers live. |
| Text, voice, or both? | Voice adds recorded or text-to-speech calls and much higher cost. |
| Provider (for example Twilio, Telnyx) and budget | Per-message cost; US numbers need 10DLC brand and campaign registration, which takes days to weeks; Vercel's free tier limits long sends, so sending needs a queue. |
| Consent and opt-out | Recorded consent per number, STOP/HELP handling and quiet hours are legal requirements (TCPA in the US), not options. |
| Privacy | Phone numbers are personal data. They would sit outside the end-to-end encrypted set unless we encrypt them, and the server must see numbers to send. This conflicts with the "server sees no content" goal (§4), so it needs an explicit decision, like D4. |

Email broadcasts to members (no new provider, no number registration) are planned in §10. Text and call are not scheduled.

**Update 2026-10-31:** the owner looked at the alternatives (in-house SMS and voice on a carrier API, a Facebook Messenger Page integration, and merging the separate Rallaria repository) and chose none of them; see §12 for the findings and the chosen scope: BOD members phone the people assigned to them, and bulk announcements continue by hand in the existing Messenger group chats.

---

## 10. Phase 8 — Email broadcasts to members (planned 2026-10-27; built, §10.8)

**Goal.** An admin writes one message and it is emailed to all active members (or a role), with a second admin's approval, one-click unsubscribe, and a record of what went out. Email only: no SMS, voice, open tracking or click tracking.

### 10.1 What exists and what is missing
| Have | Missing |
|---|---|
| `members` collection and a members API (admin only; `emailLower`, `name`, `status`, `roles`) | No Members page in the admin UI, no consent or opt-out fields, no phone or address data |
| `sendMail` (Resend over HTTPS, plain text, one recipient per call) | No bulk send, no `List-Unsubscribe` headers, no bounce handling, no quota awareness |
| Rate limiter, audit log, Zod validation, separation-of-duties pattern from minutes | No unsubscribe page, no suppression list, no send queue |

### 10.2 Decisions needed from the owner (recommendations first, as in §7)
| ID | Question | Recommendation |
|---|---|---|
| D7 | **Consent.** Who may be emailed? | Only members with `emailConsent` recorded (date + source: "added by an admin on request", "signed up", "imported with attestation"). Importing a list needs an admin to tick "these people agreed to receive email". Never email donors or attendees unless they are also members. |
| D8 | **Approval.** Can one admin send alone? | No. A second active admin must approve the exact subject and body (content-bound, like minutes). The sender cannot approve their own broadcast. |
| D9 | **Volume and provider plan.** How many members? | Resend's free tier is about 100 emails a day and 3,000 a month. Under ~100 members the free tier works; above that, either the paid plan or sending in daily batches. The owner states the member count and the verified sending domain (SPF, DKIM, DMARC). |
| D10 | **Stored content.** Do sent broadcasts stay in the database? | Yes, subject, body, author, approver, time and counts, because members receive them as plain email anyway. Drafts stay in the encrypted-draft store (Phase 6-D) until submitted. Per-recipient delivery rows hold member id + status only, not addresses. |
| D11 | **Postal address and sender name.** | Required in the footer for US commercial-style mail (CAN-SPAM); the owner supplies the legal name and mailing address. If messages are purely organization updates this is still good practice. |

### 10.3 Design
**Data (server-written only; admins read):**
- `members/{id}` gains `emailConsent` {at, source, byUid}, `emailOptOutAt` (nullable), `emailBounced` (bool). Sending requires `status == "active"`, consent present, no opt-out, not bounced.
- `broadcasts/{id}`: `subject`, `body`, `audience` ({all} or {role}), `status` (draft → pending_approval → approved → sending → sent | cancelled), `contentHash`, `createdBy`, `approvedBy`, `createdAt`, `approvedAt`, counts (`total`, `sent`, `failed`).
- `broadcasts/{id}/deliveries/{memberId}`: `state` (pending | sent | failed | skipped), `attempts`, `providerId`. This makes sending resumable and idempotent: a retry never emails the same member twice.
- Firestore rules: clients read only; every write goes through the API (same approach as minutes and audit logs), with rules tests.

**Unsubscribe (build first, before any sending):**
- Every email carries a footer link and `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers (RFC 8058).
- The link holds a signed token (HMAC of member id + purpose, key derived from the existing server secret by HKDF as the TOTP seeds do). **Tokens do not expire** (decided in 8-B: an old email must still work, and a token can only opt that one member out). Public route `/unsubscribe`: no login, rate limited, shows a confirmation page, sets `emailOptOutAt`, audited. Re-subscribing needs an admin.
- Resend bounce and complaint webhook (signature verified) sets `emailBounced` / opt-out automatically.

**Sending engine:**
- Resend batch API, up to 100 messages per request; Vercel Hobby functions are short, so the send is **chunked and resumable**: the admin page calls "send next chunk" until done (same pattern as the encryption migration job: keep the page open, progress bar, safe to close and resume). No cron needed (Hobby cron is daily only).
- Before each chunk: re-check the broadcast is still `approved`/`sending`, the kill switch is on, and the daily quota is not exhausted; stop with a clear message when it is, and continue next day from where it left off.
- Open and click tracking turned off at the provider. No third-party scripts, consistent with the rest of the project.
- Plain text first; simple HTML later only if the owner wants it.

**Admin UI (`/admin/broadcasts`, `/admin/members`):**
- Members page: list, add, edit, disable, import CSV (with the consent attestation), show consent/opt-out/bounce state. Prerequisite for everything else.
- Composer: subject, body, audience, live preview exactly as sent, recipient count, "send a test to me".
- Approval queue (second admin), then a send screen with progress and a delivery summary; failed rows can be retried.

**Safety rails:** kill switch `FEATURE_BROADCASTS` (off by default); max one send per admin per hour and a daily cap per organization; maximum recipients per broadcast set by env; every step audited (create, submit, approve, cancel, chunk sent, unsubscribe); cancelling stops later chunks.

### 10.4 Sub-phases (each ends deployable: lint, tests, build green)
| Step | Scope | Exit criteria |
|---|---|---|
| **8-A** | Members page + consent fields + CSV import with attestation; rules for new fields | Add, import, disable and filter members; consent shown; rules tests pass |
| **8-B** | Unsubscribe route, signed tokens, suppression flags, bounce/complaint webhook, mailer headers and footer | One-click unsubscribe works in an e2e test; a forged token is refused; bounced members are skipped |
| **8-C** | Broadcast model, composer, test-send, second-admin approval (content-bound) | Sender cannot approve own; editing after approval resets it; audit entries written |
| **8-D** | Chunked, resumable sender, delivery log, quota stop/resume, cancel | Kill and restart mid-send: no duplicate emails; quota stop resumes next day; unit + emulator tests |
| **8-E** | Docs, runbook entry (wrong message sent, complaint spike), go-live checklist items, README | `docs/RUNBOOK_INCIDENT.md` and `docs/GO_LIVE_CHECKLIST.md` updated |

### 10.5 Tests
Unit: audience filter (consent, opt-out, bounce, status, role), token sign/verify/expiry, chunking and idempotency, quota arithmetic, content-hash binding. Rules: clients cannot write members' consent fields or any broadcast. Emulator/integration: approval separation of duties, resume after interruption, unsubscribe round trip. E2E: unsubscribe page, composer-to-approval flow with a stubbed mail API (`MAIL_API_URL`, as the notification tests do). The route sweep (`route-sweep.spec.ts`) must cover the new routes.

### 10.6 Risks
| Risk | Mitigation |
|---|---|
| Wrong or embarrassing message sent to everyone | Second-admin approval, test send, preview, cancel between chunks. It cannot be unsent; the runbook says what to do. |
| Spam complaints or poor deliverability | Consent only, one-click unsubscribe, verified domain with DMARC, no tracking, small first send to a seed list |
| Free-tier limits exhausted mid-send | Quota check per chunk, resume next day, count shown before sending |
| Member list leaks | Admin-only reads (existing rules); delivery rows hold ids, not addresses; the E2EE gate is not applied to member emails because the server must see them to send (state this to admins, like §4.5) |
| Legal | Consent record, unsubscribe, postal address in the footer; the owner should confirm local rules (CAN-SPAM, CASL, GDPR if members are outside the US) |

### 10.7 Out of scope for Phase 8
SMS and voice (§9.1), open and click analytics, HTML templates and drag-and-drop editors, scheduled sends, per-member personalization beyond name, public sign-up forms (a possible 8-F once the owner wants self-service consent).

### 10.8 Progress

**Decisions D7–D11: all recommendations accepted by the owner on 2026-10-27.** Still to supply before the first real send (8-D/8-E): the member count and the verified sending domain (D9), and the legal name and postal address for the footer (D11).

**8-A · Members page, consent fields, CSV import · built 2026-10-27 (local, not yet merged at the time of writing)**
- **Members page** (`/admin/members`, under Community): list with search and filters (can be emailed / no consent / opted out / disabled), add a member (consent only if the box is ticked), record consent, record an opt-out ("they asked to stop"), "they asked to be added back" (records new consent and clears the opt-out), disable or enable.
- **Import:** paste a list or CSV (`email` and optional `name` columns, or plain lines); a preview shows the valid addresses and the lines skipped. The admin must tick that these people agreed to receive email; the request is refused without it. Addresses already on the list are left alone, so an import can never re-subscribe someone who opted out. Up to 500 at a time, 5 imports per admin per hour. The audit log records counts only, not addresses.
- **Data:** `members` gain `emailConsent` {at, source, byUid}, `emailOptOutAt`, and `emailBounced` (set later by the 8-B webhook). `memberEmailState()` in `src/lib/members.ts` is the single rule for who can be emailed: active, consent recorded, no opt-out, no bounce.
- **Rules:** members are now **server-written only**. Admins can read the list but cannot write it from a browser, so consent can only be recorded through the audited API. (Before this, any admin's browser could write member documents directly; nothing used that.)
- **Tests:** `tests/unit/members.test.ts` (state rules, CSV parsing); two Firestore rules tests; `tests/e2e-auth/members.spec.ts` (consent only when ticked, consent/opt-out/re-subscribe/disable, import with attestation, no re-subscribe, API refuses without attestation, audit has no addresses). Two `admin-shell` tests were adjusted for the extra "Members" page (the phone menu list now scrolls while the user card and Sign out stay in view; the page-search test parks the mouse first).
- **Not in 8-A:** no email is sent, and nothing reads `emailConsent` yet except the Members page.

**8-B · Unsubscribe, bounces and complaints, mail headers and footer · built 2026-10-27 (local, not yet merged at the time of writing)**
- **Unsubscribe page** `/unsubscribe?token=…` (secure layout, no third-party scripts, added to the strict-CSP paths). Opening it changes nothing, because mail scanners open links; the person presses "Unsubscribe me", which calls `POST /api/unsubscribe`. A bad or damaged link shows a plain message and no button.
- **One-click unsubscribe** `POST /api/unsubscribe?token=…` for mail apps (RFC 8058). POST only (GET answers 405), public, rate limited to 30 per hour per IP, no login; the signed token is the credential. Repeating it keeps the first opt-out time and writes one audit entry.
- **Tokens** (`src/lib/unsubscribeToken.ts`): `memberId.HMAC`, key derived by HKDF from the server master key with its own purpose label, verified against current and previous keys (so key rotation does not break old emails). No expiry (see §10.3).
- **Resend webhook** `POST /api/resend/webhook`: Svix signature check (`src/lib/svix.ts`, 5-minute window, constant-time compare) with `RESEND_WEBHOOK_SECRET`; without the secret the route answers 404. `email.bounced` (permanent) sets `emailBounced`; transient bounces are ignored; `email.complained` opts the member out; unknown addresses are ignored; the response never says who was affected. Every change is audited.
- **Mail pieces** (`src/lib/broadcastMail.ts`): footer (reason for the email, unsubscribe link, organization name and postal address from `BROADCAST_ORG_NAME` / `BROADCAST_POSTAL_ADDRESS`) and the `List-Unsubscribe` / `List-Unsubscribe-Post` headers; `sendMail` now accepts extra headers. Nothing sends broadcasts yet (8-D).
- **Members page:** a "Bounced" filter.
- **Tests:** unit (`unsubscribeToken`, `svix`, `broadcastMail`, mailer headers, CSP path); e2e `unsubscribe.spec.ts` (page changes nothing until pressed, forged links, one-click, GET refused, idempotence, webhook bounce/soft bounce/complaint/unknown address/bad signature/stale timestamp, no CSP violations); the route sweep lists the two new public routes. The Playwright config now keeps one server encryption key across test workers so tests can mint valid links.
- **Owner to do before the first send (also in `docs/GO_LIVE_CHECKLIST.md`):** add the Resend webhook and set `RESEND_WEBHOOK_SECRET`; set the footer name and address; verify the sending domain.

**8-C · Broadcast model, composer, test send, second-admin approval · built 2026-10-28 (local, not yet merged at the time of writing)**
- **Pages:** `/admin/broadcasts` (new draft, list with status) and `/admin/broadcasts/[id]` (edit, preview exactly as sent with the footer, "Would go to N members", send a test, submit, approve, withdraw, cancel). New "Broadcasts" entry under Community.
- **Rules of the workflow** (`src/lib/broadcast.ts`, pure and unit-tested): draft → pending_approval → approved, and cancelled from any live status. **Nobody who wrote or submitted a broadcast can approve it** (server refuses with `SEPARATION_OF_DUTIES`; the button is also hidden). **Approval is bound to the text:** the approver's request carries the SHA-256 fingerprint of the subject and body they were shown, and it must match what is stored and what was submitted, otherwise `CONTENT_CHANGED`. **Editing a submitted or approved broadcast returns it to draft** and clears the submission and approval. "Withdraw to edit" does the same on purpose.
- **Recipients:** the count shown is `selectRecipients()`, which uses the same `memberEmailState()` rule as the Members page (active, consent recorded, no opt-out, no bounce). Audience is "everyone who can be emailed"; roles are not offered because members only have the `member` role.
- **Test send:** `POST /api/admin/broadcasts/[id]/test` emails only the signed-in admin, subject `[TEST] …`, with a note that it is a test and a dead preview unsubscribe link; limited to 5 per hour per admin; refused until `BROADCAST_ORG_NAME` and `BROADCAST_POSTAL_ADDRESS` are set and mail is configured.
- **Storage and rules:** `organizations/ghmo/broadcasts/{id}` (subject, body, contentHash, status, creator, submitter, approver, timestamps), server-written only; Firestore rules let admins read and nobody write. Sent content is stored in plain text, as decided in D10.
- **Audit:** created, updated, edited-returned-to-draft, submitted, approved, withdrawn, cancelled and test-sent. Entries hold status and fingerprint, never the message text.
- **Tests:** `tests/unit/broadcast.test.ts` (content limits, fingerprint, recipient selection, every transition and refusal); a Firestore rules test; `tests/e2e-auth/broadcasts.spec.ts` (writer cannot approve in the UI or API; a second admin approves; withdraw and edit clears approval; stale-hash approval refused; test email contents and recipient; cancelled broadcasts and bad input refused; audit holds no message text).
- **Not in 8-C:** nothing is sent to members. An approved broadcast just waits for 8-D.

**8-D · Sending: chunked, resumable, quota-aware · built 2026-10-28 (local, not yet merged at the time of writing)**
- **Kill switch:** nothing is sent unless `FEATURE_BROADCASTS=true`. The page says why sending is blocked: switch off, mail not configured, footer not set, or a daily limit of 0.
- **Flow:** on an approved broadcast, "Send to N members" → "Yes, send it now". That snapshots the recipients (the same `memberEmailState()` rule) into one delivery row per member, then the page sends chunk after chunk with a progress bar. Closing the page pauses; "Resume sending" (any admin) continues where it stopped. "Pause" stops after the current chunk. Cancelling stops the remaining chunks. Failed deliveries can be retried.
- **No double sends:** each chunk claims its rows in a Firestore transaction (two open pages never send to the same member). Each claim's id is the provider's `Idempotency-Key`. If a server function dies after Resend accepted the chunk, the abandoned claim is retried after 3 minutes with the same key, so Resend returns the first result instead of sending again (Resend keeps keys for 24 hours).
- **Daily limit:** `BROADCAST_DAILY_LIMIT` (default 100) emails per UTC day, across all broadcasts, reserved inside the same transaction so parallel chunks cannot overshoot. When it is used up the page shows when sending can continue (next UTC midnight). A chunk the provider refused gives its quota back.
- **Every chunk re-checks:** the kill switch, that the stored text still matches the approved fingerprint, the footer, and each member's current consent. Someone who unsubscribes mid-send is skipped.
- **Provider failures:** a refused chunk goes back to the queue. After 3 failed attempts a delivery is marked failed and can be retried by an admin.
- **Guards:** one start per admin per hour; refuses more than `BROADCAST_MAX_RECIPIENTS` (default 1000) recipients; chunk size `BROADCAST_CHUNK_SIZE` (default 50, max 100 = Resend's batch limit); the route allows 30 seconds per chunk.
- **Each email:** sent individually (one recipient per message) with the approved subject and body, the footer with the member's own unsubscribe link, and the one-click `List-Unsubscribe` headers.
- **Data:** `broadcasts/{id}` gains `total`, `sentCount`, `failedCount`, `skippedCount`, `startedAt`, `completedAt` and statuses `sending` / `sent`; `broadcasts/{id}/deliveries/{memberId}` holds state (pending, sending, sent, skipped, failed), attempts and the provider id, not the address; `broadcastQuota/{YYYY-MM-DD}` holds the day's count. All server-written; the broadcasts rule covers deliveries, and the quota documents are denied to clients by the default rule.
- **Audit:** sending started (with the total), each completed broadcast (sent, failed, skipped counts), retries.
- **Tests:** unit (`broadcastSending.test.ts`: config, quota day and reset, chunk sizing, stale claims, idempotency keys, start/cancel/edit rules, batch mailer); emulator integration (`broadcastSender.test.ts`: every consenting member gets one personal copy, refusals, tampered text, quota pause and next-day resume, **a crashed function does not cause duplicates**, two pages sending at once, mid-send unsubscribe skipped, provider failure to failed to retry, switched off and cancelled); browser (`broadcast-sending.spec.ts`: chunks of 2 with distinct keys, personal unsubscribe link works, close-and-resume without resending, unapproved broadcast refused).
- **Before the first real send (owner):** the steps under 8-B, then `FEATURE_BROADCASTS=true`, set `BROADCAST_DAILY_LIMIT` to the Resend plan's daily allowance, and send a first broadcast to a small test list.

**8-E · Runbook, admin guide, checklist · done 2026-10-28 (local, not yet merged at the time of writing)**
- `docs/RUNBOOK_INCIDENT.md`: new cases **H** (a broadcast went out wrong: pause and cancel, the kill switch, who received it, correction through the normal approval path), **I** (complaints or bounces rise, or Resend warns: pause, check rates, confirm the webhook is suppressing, find the cause) and **J** (Resend API key or webhook secret leaked: rotate, check for wrong opt-outs, check provider logs).
- `docs/BROADCASTS_GUIDE.md`: a plain-language guide for admins: consent on the Members page, writing and testing, second-admin approval, sending, pausing and resuming, the daily limit, retries.
- `docs/GO_LIVE_CHECKLIST.md`, `README.md` and `.env.example` already carry the set-up steps and settings from 8-B and 8-D.

**Phase 8 status:** all five steps are built and tested. Before the first real send the owner completes the steps in `docs/GO_LIVE_CHECKLIST.md` (verified domain, webhook and secret, footer name and address, `FEATURE_BROADCASTS=true`, daily limit) and sends a first broadcast to a small test list. Still open from D9/D11: the member count (to choose the Resend plan) and the legal name and postal address for the footer.

---

## 11. Installable app (PWA) · built 2026-10-28

The owner asked for the site to be a Progressive Web App. Checked first: it was not one (no manifest, no service worker, no app icons).

**What was added**
- **Manifest** (`app/manifest.ts`, served at `/manifest.webmanifest`): name "Greater Harrisburg Magar Organization", short name "GHMO", opens full screen (`standalone`) at `/`, theme colour #0f766e, an "Admin" shortcut. Every page links to it.
- **Icons** (`public/icons/`): 192 and 512 px, a 512 px *maskable* icon with the logo inside the safe zone (Android shapes it), and a 180 px Apple touch icon. Generated from `public/assets/logo-light.png` on white.
- **iPhone/iPad:** `appleWebApp` metadata (opens full screen, titled "GHMO") and the touch icon; theme colours for light and dark mode.
- **Service worker** (`public/sw.js`, registered in production only, `Cache-Control: no-cache` so fixes reach installed apps quickly). It is deliberately conservative because this site holds admin and end-to-end encrypted data:
  - **Pages and API answers are never cached.** Every page load goes to the network, so admin pages, decrypted content and session-dependent pages never sit in a cache on someone's device.
  - Only content-hashed build files (`/_next/static/…`) and the app icons are cached, for a faster start.
  - Without a connection, page loads show a static offline page (`public/offline.html`) with a "Try again" link.
  - Old caches are deleted when the worker is updated (bump `VERSION` in `sw.js` when its caching rules change).
- **Security notes:** the worker script is first-party and same-origin; third-party scripts on public pages cannot register a different one (service workers must be same-origin files, not blob: URLs). The secure-page CSP already allows `worker-src 'self'` and `manifest-src 'self'`.
- **Tests:** `tests/e2e-auth/pwa.spec.ts` (manifest fields, icons served as PNG, every page links the manifest and Apple icon, the worker activates, the offline page appears offline and "Try again" recovers, and no `/admin`, `/api` or page HTML is ever in the cache). The other browser tests block service workers so caching cannot affect them.

**How people install it:** on Android/Chrome, the "Install app" prompt or menu → *Install app*; on iPhone/iPad, Safari → Share → *Add to Home Screen*; on a computer, the install icon in Chrome or Edge's address bar.

**Not included (on purpose):** offline reading of pages, background sync and push notifications. Each would mean storing or delivering content on the device, which conflicts with the privacy goals in §4. They can be planned separately if wanted.

---

## 12. Phase 9 — Member outreach: calling tree and call campaigns (planned 2026-10-31, built 2026-11-01)

**Goal.** The community member list is stored in the site so that only the BOD (the admin allowlist) can read it, with phone numbers end-to-end encrypted. Members are split equally across BOD callers once, and kept. For each announcement (for example a General Meeting with its agenda) a campaign tells each caller whom to phone, lets them record the outcome, and gives the whole BOD an audited view of who was reached. Bulk announcements continue by hand in the existing Messenger group chats; the site only prepares the text.

### 12.1 What was checked and ruled out (2026-10-31)

The owner first asked for Text-em-All-style mass text and voice, then for a Facebook Messenger integration, and for merging the separate `rob2rhyme/Rallaria` repository "for community use". Each was researched before deciding; the findings are kept here so they are not re-done.

| Option | Finding | Decision |
|---|---|---|
| **In-house mass text and voice** (clone of Text-em-All) | Feasible on top of the Phase 8 broadcast pipeline, but every text or call must still leave through a carrier API (Twilio, Telnyx, Bandwidth…), exactly as email leaves through Resend; "no third party" is not possible at the carrier layer. It also needs 10DLC or toll-free registration (days to weeks), recorded consent per number, STOP handling and quiet hours (TCPA), and phone numbers readable by the server, which breaks the E2EE model for that data. | **Dropped** (D13). |
| **Messenger Page integration** (Meta Send API) | The API only serves one-to-one Page-to-person chats: it cannot post into the Messenger group chats the community uses, and the Facebook Groups API was removed in April 2024. Each member would have to message the Page first; outside a 24-hour window the event-update message tags were withdrawn in April 2026 and the opt-in "notification messages" product replaced Recurring Notifications in January 2026. Business Verification and App Review are required and Meta changed these rules twice in 2026. | **Dropped** (D14): the policy risk is not worth it. Group chats stay manual. |
| **Merging the Rallaria repository** | Rallaria is a Phase 0 plan for a consent-first "who's nearby" mobile app: about 3,000 lines of throwaway prototype (React + Vite, fake data, no backend), a Cloudflare waitlist relay and a static site; the rest is brand assets, research and sales material. Different stack, identity model and legal posture; its own rules forbid sending SMS from the app and call the prototype throwaway. | **Not merged** (D16). It stays a separate repository. Two ideas may be rebuilt later as small GHMO features: QR check-in at an event (feeding minutes attendance) and an RSVP on events. |

### 12.2 Decisions (recommendations accepted 2026-10-31 unless noted)

| ID | Decision | Effect |
|---|---|---|
| D12 | **Phone numbers and call notes are end-to-end encrypted** in the existing workspace keyring (§4): stored as record envelopes, decrypted only in an admin's browser. The server never sees a number. | Tap-to-dial from the caller's phone; no server-side sending of any kind. CSV import of numbers happens in the browser. |
| D13 | **No SMS, voice or carrier integration.** | §9.1 stays closed. |
| D14 | **No Messenger or Meta API integration.** Announcements go to the existing group chats by hand; the site provides a "Copy for Messenger" button on an approved announcement and records the manual post in the audit log. | No Meta app, Page, verification or webhook. |
| D15 | **Callers are active admins** (the BOD allowlist). The number of callers is a setting, not fixed at six. A persistent calling tree assigns each member to one caller and stays stable across campaigns. | Super admins can swap or reassign by hand. |
| D16 | **Rallaria is not merged.** | See §12.1. |
| — | Web push through the installed app (§11) stays out of scope, as decided there. | — |

### 12.3 Design

**Data (all under `organizations/ghmo`):**
- `members/{id}` gains `contact` (envelope: `phone`, `altPhone`, `language`, `household`, `notes`) and plaintext flags `hasPhone` (bool), `callOptOutAt` (nullable), `phoneConsent` {at, source, byUid}. Name, email and status stay plaintext as today. Members remain server-written through the members API; the envelope is produced in the browser and passed through with the device check already used for minutes (`e2eeEnvelope.server.ts`).
- `callingTree/current`: `callers[]` (admin uids in a fixed order), `version`, `updatedAt`, `updatedBy`; `callingTree/current/assignments/{memberId}`: `callerUid`, `assignedAt`, `assignedBy` (`auto` or an admin uid). Plaintext: member id and caller id only, never a number.
- `callCampaigns/{id}`: `title`, `eventId` (optional link to `events`), `script` (envelope; the agenda and talking points), `dueAt`, `status` (open → closed), `createdBy`, `createdAt`, `closedBy`, `closedAt`, counts (`total`, `reached`, `attempted`, `rsvpYes`, `rsvpNo`).
- `callCampaigns/{id}/calls/{memberId}`: `callerUid`, `outcome` (`reached` | `voicemail` | `no_answer` | `wrong_number` | `callback` | `declined`), `rsvp` (`yes` | `no` | `maybe` | null), `attempts` (append-only: {at, outcome, note envelope}), `updatedAt`.
- `announcements/{id}` (optional, 9-D): approved text for the group chats, `contentHash`, `approvedBy`, and `manualPosts[]` {at, byUid, channel: "messenger_bod" | "messenger_community"}.
- Firestore rules: members, calling tree, campaigns and announcements are server-written (clients read only), as for members, broadcasts and minutes today, so every write is audited and the separation of duties cannot be bypassed from a browser.

**Splitting members equally:** sort members by a stable key (household, then name, then id), keep a household with one caller, then round-robin across the callers in their fixed order. Counts differ by at most one. New members go to the caller with the fewest. Removing a caller redistributes only that caller's slice. The split is a pure function with unit tests; the stored result is what callers see, so a later change in the rule never silently moves people.

**Caller page (`/admin/my-calls`, phone-first; the installed app from §11 fits):** the open campaign's script beside the caller's list: name, `tel:` link (number decrypted in the browser), language, last outcome, outcome buttons, RSVP, an encrypted note. Numbers are masked until tapped. Attempts are append-only, written through `/api/admin/call-campaigns/{id}/calls/{memberId}` with the actor, time, member id and outcome going to `auditLogs` (no number, no note text).

**BOD view (`/admin/call-campaigns`):** create a campaign from an event (title, date, agenda becomes the script), progress per caller (reached / attempted / remaining), members not yet reached, RSVP totals, the full attempt log, CSV export without numbers. Closing a campaign is audited. Reminders reuse the content-free notification emails from Phase 6 ("you have calls left, due Friday").

**"Copy for Messenger" (9-D):** on an approved announcement, one button copies the text formatted for a chat, and asks which group it was posted to; the answer is recorded with the actor and time. This is the only bridge to the group chats (D14).

**Safety rails:** callers see only their own slice (API filters by uid; super admins see all); one open campaign per event; a member with `callOptOutAt` is never assigned to a campaign; every create, assign, reassign, attempt, close, export and manual post is audited; numbers never appear in audit entries, exports or notification emails.

### 12.4 Sub-phases (each ends deployable: lint, tests, build green)

| Step | Scope | Exit criteria |
|---|---|---|
| **9-A** | Encrypted `contact` envelope on members, consent and opt-out flags, masked display, browser-side CSV import with a phone column, rules and schema | A number saved from the Members page is ciphertext in Firestore; another admin's device decrypts it; the import never sends a number to the server in plaintext; rules tests pass |
| **9-B** | Calling tree: callers setting, deterministic split, manual swap and reassign, new-member placement, caller-removed redistribution; `/admin/my-calls` list | Split is equal within one and stable across runs (unit tests); a caller sees only their members (emulator test) |
| **9-C** | Campaigns: create from an event, script envelope, outcomes, RSVP, append-only attempts, audit, BOD dashboard, close, CSV export, reminder emails | Every attempt is in the audit log without a number; a closed campaign refuses new attempts; dashboard counts match the rows |
| **9-D** | "Copy for Messenger" on approved announcements with the manual-post record; admin guide and runbook entries | A manual post is recorded with actor, time and group; `docs/BROADCASTS_GUIDE.md` and `docs/RUNBOOK_INCIDENT.md` updated |

### 12.5 Tests
Unit: split rule (equal counts, household grouping, stability, add and remove callers), outcome and status transitions, masking, CSV phone parsing. Rules: clients cannot write members' contact fields, the tree, campaigns or calls. Emulator: a caller cannot read or write another caller's members; attempts are append-only; audit entries carry no number. Browser (`e2e-auth`): add a member with a number on one device, decrypt on another; run a two-caller campaign end to end; export has no numbers. The route sweep covers the new routes.

### 12.6 Risks
| Risk | Mitigation |
|---|---|
| A caller's unlocked phone exposes their slice | Same limit as all E2EE data (§4.5); numbers masked until tapped; only one caller's slice per device |
| Numbers typed into a text note | Notes are encrypted; the UI warns not to paste numbers into audit-visible fields (there are none) |
| Callers stop updating outcomes | Reminder emails; the BOD dashboard shows stale campaigns |
| Group-chat posts drift from the approved text | The copy button only exists on approved announcements and records the post |

### 12.7 Progress

**9-A · Encrypted member contacts · built 2026-10-31 (merged in PR #76)**
- `members/{id}.contact` is one envelope (phone, altPhone, language, household, notes) encrypted in the browser with the workspace key and bound to `members/{id}#contact`; plaintext flags `hasPhone`, `phoneConsent` {at, source, byUid} and `callOptOutAt` sit beside it. The browser chooses the member id before encrypting (as the minutes editor does), and the server creates the document with `create()` so a chosen id can never overwrite someone.
- The members API accepts `contact` only while encryption is on and only from an active device of the signed-in admin (`envelopeChecker`, one device-list read per request so a 500-row import stays cheap); a plaintext `phone` field is dropped by the schema. Audit entries replace the ciphertext with `[encrypted]`.
- Members page: phone field and call-consent box on add (disabled until this device is unlocked), masked numbers with Show/Hide and a `tel:` Call button, Edit contact dialog, "They asked not to be called" / "Record call consent", a "With phone" filter, and CSV import with a `phone` column (headered or detected) that encrypts each row before sending and needs a second attestation.
- Shared rules in `src/lib/members.ts`: `normalizePhone` (US 10/11 digits → +1, else E.164), `formatPhone`, `maskPhone`, `normalizeContact`, `memberCallState`, `memberContactLoc`.
- Tests: `tests/unit/members.test.ts` (normalizing, masking, contact form, call state, CSV phone column); `tests/rules/firestore.rules.test.ts` (clients cannot write `contact`, `hasPhone` or `callOptOutAt`); `tests/e2e-auth/members-contact.spec.ts` (ciphertext in Firestore and the audit log, masked until tapped, edit keeps the number, import encrypts and records consent, opt-out, a second approved device reads it; with encryption off the number field is disabled, an envelope is refused and a stray plaintext phone is never stored).
- Guide: `docs/BROADCASTS_GUIDE.md` §1b; README data model updated.

**9-B · Calling tree · built 2026-10-31 (merged in PR #76)**
- `src/lib/callingTree.ts` (pure, unit-tested): `planAssignments` keeps every existing assignment, drops members who can no longer be called and assignments to callers who left, joins a newcomer to the caller their household already has, and places the rest one household at a time (largest first, then a stable order) onto the caller with the fewest people. Equal within one without households; the same input plans nothing; removing a caller moves only that caller's people. `moveMember` for hand moves.
- The split runs in the browser because the household is inside the encrypted contact. `/api/admin/calling-tree` (GET: super admins see all assignments, other admins the callers, counts and their own; PUT, super admin: callers + assignments, checked against active admins and callable members, written in batches, version bumped, audited with counts only) and `/api/admin/calling-tree/mine` (the caller's members with their envelopes, already filtered to those still callable). Storage `callingTree/current` + `assignments/{memberId}` is denied to every client in the rules.
- Pages: **Calling Tree** (`/admin/calling-tree`, behind the encryption gate): tick callers among active admins, Plan assignments with a preview of every change and its reason, per-caller lists with a Caller select for hand moves (recorded as placed by that admin), Save, Discard. **My Calls** (`/admin/my-calls`): the caller's own people, numbers decrypted on the device, masked until Show, tap-to-dial, language, household and notes.
- Shared `useMemberContacts` hook decrypts envelopes on an unlocked device and forgets them on lock; the Members page now uses it too.
- Tests: `tests/unit/callingTree.test.ts` (equal split, determinism and stability, households, caller removal, ineligible members, no callers, duplicate callers); rules test (calling tree unreadable and unwritable from a browser); `tests/e2e-auth/calling-tree.spec.ts` (super admin plans and saves a 3/2 split of five people with the unconsented one left out, audit has counts only, a hand move sticks and is attributed, Bob's My Calls and API show only his slice and his PUT is refused, Carol is not a caller; removing Bob moves only his two, a call opt-out is skipped at once and removed on the next plan).

**9-C · Call campaigns · built 2026-10-31 (merged in PR #76)**
- `callCampaigns/{id}` (title, eventId and eventTitle, script envelope bound to `{id}#script`, dueAt, status open → closed, createdBy/At, closedBy/At, treeVersion, counts) and `callCampaigns/{id}/calls/{memberId}` (callerUid, outcome, rsvp, append-only `attempts[]` {id, at, outcome, byUid, note envelope bound to `{id}/{memberId}#{attemptId}`}). Opening a campaign snapshots the calling tree into it (callable members only), so later tree changes do not move people mid-announcement; one open campaign per event. Server-written only; denied to every client in the rules.
- Pure rules in `src/lib/callCampaigns.ts`: outcomes (reached, voicemail, no answer, wrong number, call back, declined; reached/declined/wrong number count as done), `planAttempt` (open campaign, assigned caller or super admin, RSVP only when reached, counts delta), `computeCounts`, `progressByCaller`, `campaignCsv` (names and outcomes, never a number or a note).
- API: `/api/admin/call-campaigns` (GET list, `?mine=1` adds the caller's rows and members per open campaign; POST opens one from the tree and emails the callers involved), `/[id]` (GET the BOD view: rows, names, caller names; POST close, remind the callers who still have people to reach, or record an export), `/[id]/calls/[memberId]` (POST one attempt in a transaction: refused when closed, for another caller's person, for someone who can no longer be called, or for a repeated attempt id; counts move by the plan's delta; audited with member id, outcome and RSVP only).
- Pages: **Call Campaigns** (open from an event with an optional due date and an encrypted script; cards with reached/RSVP counts and a progress bar), campaign **detail** (totals, progress per caller, not yet reached, full call log with decrypted notes, Export CSV, Remind callers, Close), and **My Calls** now shows each open campaign with its script, outcome and RSVP badges and a Log call dialog (outcome, RSVP when reached, encrypted note), above the calling-tree list.
- Reminder emails reuse the content-free notification kind `calls` ("You have calls to make"), sent only to callers with people left, still at most one per person every 30 minutes.
- Tests: `tests/unit/callCampaigns.test.ts` (transitions, refusals, counts and deltas, per-caller progress, CSV quoting); rules test (campaigns and call records unreadable and unwritable from a browser); `tests/e2e-auth/call-campaigns.spec.ts` (open from an event with ciphertext script, duplicate refused, Alice logs reached + coming with an encrypted note and the audit holds no number or note, voicemail offers no RSVP, Bob logs his own person on his device and is refused on Alice's, stored counts equal the rows, dashboard totals and log, CSV without numbers is audited, closing refuses further attempts).

**9-D · Copy for Messenger, runbook and checklist · built 2026-11-01 (merged in PR #76)**
- The announcement for the group chats is the existing broadcast (Phase 8) rather than a new collection: it already has drafting, second-admin approval bound to the text's fingerprint, and withdraw-to-edit. On an approved, sending or sent broadcast a **Post to the Messenger group chats** card shows `messengerText` (subject, blank line, message, no email footer), a **Copy text** button, and **I posted it in the BOD / Community group chat** buttons. Works without any email set-up.
- `POST /api/admin/broadcasts/[id]/manual-post` appends {channel, at, byUid, byName} to `manualPosts` in a transaction, only when the stored text still matches the approved fingerprint and the copied fingerprint; audited as `broadcast_posted_manually` with the channel and fingerprint, not the text. `planManualPost` holds the rules (unit-tested).
- `docs/RUNBOOK_INCIDENT.md` cases **K** (wrong group-chat post), **L** (caller's device lost or caller leaves: revoke, re-plan the tree, open campaigns), **M** (member asks not to be called or to have their number removed). Go-live checklist item before the first campaign; admin guide §5.
- Tests: `tests/unit/broadcast.test.ts` (formatting; only approved and unchanged text, known chats); `tests/e2e-auth/broadcasts.spec.ts` (no card and a refused API call on a draft; after approval the text is copied to the clipboard without footer, two posts are recorded and listed, nothing is emailed, the audit holds the approved fingerprint and not the text, a stale fingerprint is refused).

**Phase 9 status:** all four steps are built, tested and merged (PR #76). Before the first real campaign the owner completes the Phase 9 item in `docs/GO_LIVE_CHECKLIST.md` §4.

---

## 14. Audit round 2 — layout, performance, security, content (2026-11-03)

After Phase 10 merged, the owner asked for a fresh round of four audits. Method and findings: **`docs/AUDIT_ROUND_2.md`**
(production build, 334 screenshots, axe at 0, Lighthouse on 8 pages at phone and desktop, `npm audit`, bundle and asset
sizes, four code reviewers). 72 findings: 6 High, 27 Medium, 39 Low.

- **Highs:** an email link alone can add an active passkey to an admin who uses the authenticator app (S1); blank
  document fields print "TBD" and invented contacts into real letters (C1); the shared `Steps` list squeezes its text on
  phones, a regression from Upgrade 2 (L1); phones score 50–59 on the main public pages because the Firebase SDK ships to
  every visitor, pages render per request and call their own API, and admin pages verify the session three times (P1–P4).
- **Sound:** accessibility 100 and SEO 100 on every page; production dependencies at 0 vulnerabilities; session,
  input, CSP and rate-limit design hold up; desktop performance 69–100.
- **Fix pass (same day):** 60 of the 72 rows fixed (two in part) in four commits (security, content, layout,
  performance), each suite rerun; of the Highs only P2–P4 remain. The "Status after the fix pass" section of
  `docs/AUDIT_ROUND_2.md` lists every row, what was deferred (static rendering and no self-calls P2–P4/P7, the `__Host-` cookie, Firestore rule shape checks,
  the per-email sign-in limit) and what still needs the owner (GoFundMe link, contact email, photos, turning off
  password sign-in in Firebase).
- **Speed pass (same day):** P2–P4 and P7. Public pages are served from a 5-minute cache that admin writes expire at
  once; server pages read data directly instead of calling the site's own API; the admin session is checked once per
  page; the events pages render on the server. Phone Lighthouse 80–99 → 88–99 (Home 88, Donate 97, Minutes 99),
  desktop 100 everywhere. Details and numbers: "Speed pass" in `docs/AUDIT_ROUND_2.md`.
- **Round 3 audits (same day):** four fresh audits of the result, `docs/AUDIT_ROUND_3.md`. 58 findings: 4 High (all in
  community-facing content: the wedding certificate's placeholder issuer, its interethnic section printed for every
  couple, its "lawful" wording, and a flyer button that fails for visitors), 21 Medium, 33 Low. The speed pass's cache
  holds up under review; its Lighthouse table was re-measured on real data (phones 94–99). Fix plan at the top of the
  document; needs the owner for the flyer audience, the certificate's community list and one line on the Gumba.
- **Round 3 fixes (same day):** 55 of 58 rows fixed (L17 and P9 in part, L8 waits for photos), in four commits
  (security and data layer, content, public pages, admin layout). Highlights: the wedding certificate's version 2, a
  public flyer, the events pages in the cached public layout, sessions that can't outlive 8 hours (cookie, Bearer,
  browser sign-in and Firestore rules), encryption that fails closed, an authenticator lockout. Every suite passes; the
  browser suites now run with the public cache on. Deploy the site before the rules. Status and numbers: "Status after
  the fix pass" in `docs/AUDIT_ROUND_3.md`.
- **Round 4 audits (2026-11-04):** four fresh audits of PR #81, `docs/AUDIT_ROUND_4.md`. 48 findings: 3 High (typed
  dates print a day early on documents; downloads and signed certificates keep only page 1; an admin cookie can be
  renewed forever through the custom-token endpoint, a gap in round 3's session fix), 15 Medium, 30 Low. Fix plan at
  the top of the document; needs the owner for how GoFundMe Pro donations are taken and whether certificates are
  numbered automatically.
- **Round 4 fixes (2026-11-04):** all 48 fixed (status section in `docs/AUDIT_ROUND_4.md`). Donations go through
  GoFundMe's own page (no GoFundMe script on the site); certificates are numbered "GHMO-<year>-<NNN>" automatically;
  multi-page certificates and minutes export and sign every page. The board still confirms the wedding certificate's
  Maiti wording (C5); a Devanagari font for the flyer PDF is optional.

## 13. Phase 10 — UI layout audit, twice, and upgrade (requested 2026-11-01, built 2026-11-03)

**Goal.** Make the whole site **beginner friendly** (a first-time member or a new BOD admin can find what they need and finish a task without help) with a **premium, modern look**. The work is **layout only**: how pages look and read, not what they do.

### 13.1 Scope
**In scope:** page structure and visual hierarchy, spacing and alignment, navigation and wayfinding, typography, colour and contrast, cards, tables, forms and buttons, empty/loading/error states, plain-language labels and help text, phone and desktop layouts, light and dark mode.

**Out of scope:** features, data, API routes, Firestore rules, sign-in and encryption logic. Security screens (encryption setup, device approval, safety codes, recovery key) may be restyled and reworded, but their steps, confirmations and warnings stay exactly as they are; their browser tests must keep passing unchanged.

**Pages:** every route group: public (`app/(public)`), member (`app/(member)`; since round 3 the events pages live in `(public)` and the group is gone), sign-in (`app/(auth)`), signing (`app/(sign)`), documents (`app/(docs)`) and admin (`app/(admin)`), plus the offline page.

### 13.2 Method
Two audit passes, each followed by fixes. Each pass ends deployable (lint, tests, build green).

| Step | What happens | Output |
|---|---|---|
| **10-A · Audit 1** | Screenshot every page at 360, 768 and 1280 px wide, light and dark (Playwright), signed out, as a member and as an admin. Score each page against the checklist in §13.3. | A findings table here (page, problem, severity, fix), like §5.4 |
| **10-B · Upgrade 1** | Fix the findings, highest severity first: shared design changes (type scale, spacing, colour tokens, components in `src/components/ui/`) before page-by-page changes. | Before/after screenshots of the main pages |
| **10-C · Audit 2** | A fresh pass over the upgraded site with the same method and checklist, looking for what Audit 1 missed and anything the upgrade broke or made inconsistent. | A second findings table |
| **10-D · Upgrade 2** | Fix the Audit 2 findings and polish. | Final screenshots; README and this section updated |

### 13.3 Audit checklist
**Beginner friendly**
- Each page says what it is for in one plain sentence and has one clear main action.
- Words a newcomer knows: no jargon ("envelope", "epoch", "roster") in labels; short help text where a step is unfamiliar.
- A first-time admin is guided: empty states explain what to do next and link to it.
- Navigation: the current page is obvious, every page is reachable in two taps on a phone, back paths are clear.
- Forms: labels above fields, examples, errors next to the field in plain words, the main button says what it does ("Send invite", not "Submit").
- Touch targets at least 44 px; nothing needs a hover to be found.
- WCAG 2.2 AA contrast and focus states (§5.3) still hold.

**Premium and modern**
- One type scale and one spacing scale used everywhere; generous whitespace; aligned grids.
- A restrained colour palette with one accent; status colours used consistently, never colour alone.
- Consistent cards, radii, borders and shadows; no leftover one-off styles.
- Real loading skeletons, calm transitions (respecting reduced-motion), sharp icons and images.
- Public pages feel like the organisation's own site: strong hero, clear sections, polished footer.
- Light and dark mode both look finished.

### 13.4 Tests
Existing unit, rules and browser suites must pass unchanged (layout work must not change behaviour). Add a Playwright screenshot run of the main pages at three widths in both themes, kept as review material, and an axe accessibility check of the same pages.

### 13.5 Risks
| Risk | Mitigation |
|---|---|
| A restyle hides or weakens a security warning | Security screens keep every step and warning; their e2e tests are not edited |
| Changes break browser tests that look for text or roles | Keep accessible names stable, or update the test in the same commit with a reason |
| Taste disagreements | Owner reviews Audit 1 findings and before/after screenshots before Upgrade 2 |

### 13.6 Progress

**10-A · Audit 1 · done 2026-11-02 (PR #77)**
- New screenshot run: `npm run ui:screens` (`playwright.ui-audit.config.ts`, `tests/ui-audit/screenshots.spec.ts`) seeds sample data in the emulators, signs in as a super admin, and saves 33 pages at 375/768/1280 px in light and dark (198 images in the git-ignored `ui-audit-screens/`). A size check flags sideways scrolling.
- Findings, causes and fixes: **`docs/UI_AUDIT_1.md`**. About 100 problems merged into 8 bugs and 53 layout rows (17 High, 30 Medium, 6 Low).
- The worst: developer text and placeholder media (including a Rick-roll video and stock photos) on the public home page; a Donate button to a GoFundMe page that doesn't exist; public events show "Invalid Date" / "No events yet"; white-on-teal buttons fail contrast in dark mode; three pages scroll sideways (Meeting Minutes and event detail on phones, Encryption on tablets); the admin Events table breaks on phones; the document generator is unreadable in dark mode; the Calling Tree pages give a new admin no order of steps; admin sign-in leads with passkeys although most admins use the authenticator app.
- Owner approved fixing the 8 bugs inside Phase 10 (2026-11-02). No GoFundMe link yet, so Donate buttons stay hidden until `GOFUNDME_PUBLIC_URL` is set.

**10-B · Upgrade 1 · built 2026-11-02 (PR #77)**
- **Bugs (UI_AUDIT_1 §1), all fixed:** public event dates sent as epoch milliseconds; the edit-event blank form traced to events being stored in two places (admin writes went to `organizations/ghmo-site/events`, lists read `organizations/ghmo/events`): every list now merges all known locations, single-event routes find the event wherever it is, new events go to `organizations/ghmo/events`, no data moved; a new `GET` for one event, a "couldn't load" state and a confirmed delete; `GOFUNDME_PUBLIC_URL` (`src/lib/donateLink.ts`) instead of the placeholder link; no stand-in media (`src/lib/media.ts`); `/gumba-project` → `/donate`; public `/document-generator` explains it's a board tool; onboarding rewritten as a board member guide; sample-threads button removed; calling-tree status line.
- **Foundations:** rules in **`docs/UI_STYLE.md`**; new `Select`, `Segmented`, `ConfirmDialog`; `src/lib/format.ts` (no seconds, no "Invalid Date"); destructive and disabled button styles readable in both themes; admin sidebar from laptop width with encryption status, public-site link and theme in the top bar; one admin content width; 44 px theme and sign-out buttons.
- **Public:** new header menu (Events, Gumba Project, Minutes, Media, Donate) and themed footer; home rebuilt for the community (hero, About, next events, Gumba strip, Follow us); one media style; Donate restructured around its ask; events list/detail with labelled filters, friendly dates and no sideways scroll; minutes, certificate check, member and admin sign-in (email + authenticator first, passkey as the faster option, every step kept), unsubscribe, signing page and 404 on shared components.
- **Admin:** Meeting Minutes (no sideways scroll, one tab bar, sticky save, plain fields), dashboard activity in plain sentences, Plans & Issues list-first, Chat fills the screen, Action Items, Events list as cards on phones, Members, Broadcasts (Write → Approve → Send), guided Calling Tree / Campaigns / My Calls, GUMBA progress, Document generator usable in dark mode with a template grid and stepper, Gallery, Encryption (no tablet overflow, 3-step progress, "What is this?" lines, styled confirmations with the same wording), Security (sign-in summary, plain badges).
- **Measures:** raw palette classes 189 → 4 (paper previews only); `text-white` on primary 23+ → 0; lint warnings 110 cap → 93. Tests: unit `format`, `media`, `donateLink`, `adminView`; browser `events.spec.ts`; three browser tests updated (calling-tree sentence, two confirmations now dialogs), two public footer-link tests.

**10-C · Audit 2 · done 2026-11-02 (PR #77)**
- Screenshot run extended: open phone menus, and the encryption-on admin pages both locked and unlocked (268 images; `UI_AUDIT_ONLY=page,…` targets pages). None scrolls sideways.
- Findings: **`docs/UI_AUDIT_2.md`**. Audit 1: all 8 bugs fixed, most rows resolved, the rest partly. New: 69 findings (5 High, 41 Medium, 23 Low) and 1 bug: event times ignore the event's time zone (B9).
- Main themes: a phone admin-menu regression; five builders' differing patterns (lists, back links, steps, cards, badges, title case); the Encryption page and locked states after launch; three remaining day-one dead ends; the public home and closed-Donate states not yet premium; no contact route.
- **Waiting on the owner:** go-ahead for B9; a contact email; community photos (optional). Upgrade 2 then follows `docs/UI_AUDIT_2.md` "Upgrade 2 plan".
- Owner approved B9 and Upgrade 2 (2026-11-02). No contact email or photos yet: the contact slots stay hidden and the home hero uses the building artwork.

**10-D · Upgrade 2 · built 2026-11-02 (PR #77)**
- **B9 fixed:** `src/lib/zonedTime.ts` reads and writes wall-clock times in a named zone (daylight-saving safe, no library). The event API reads zone-less form dates in the event's own zone (PATCH falls back to the stored zone) and rejects unknown zones; the form shows stored times in that zone; the flyer PDF prints friendly times in it. Unit tests run under three machine zones; a browser test runs as an admin in Tokyo.
- **Regression fixed:** the phone admin menu scrolls as one, so every page is reachable (A1).
- **Shared building blocks** (listed in `docs/UI_STYLE.md`): `back` and `badge` on `AdminPageHeader`; `AdminSectionCard` aligned with `Card`; `AdminList`/`AdminListRow`; `size="row"` buttons; `statusBadge()`; `Steps`; `StatGrid`/`StatTile`/`ProgressBar`; `SegmentedNav` and a selected state that reads in dark mode; Alert `success`; one locked-state card and a one-line "Encryption is off" note; e2ee activity sentences; skeleton + "Couldn't connect / Try again" for the live connection; `PublicPage`/`PublicPageHeader`/`PublicSectionTitle`, `MessagePage`, a styled 404 in every route group; `getContactEmail()` (`CONTACT_EMAIL`).
- **Pages:** every Audit 2 row worked through (details per area in the commit messages). Highlights: Encryption page next-action-first with plain wording (every check kept); confirmation dialogs for sending a broadcast, cancelling it, closing a campaign and disabling a member; Broadcasts warns when nobody can be emailed; Call campaigns hidden until the tree is planned; Members list-first on phones; Meeting minutes shows only the approval step that applies; sentence-case nav and titles; "topic", "unlock/open", no "(s)", ids or setting names; home hero with an image slot; honest closed-Donate state; Media as one featured YouTube card; Featured events get a public badge; gallery Download buttons download.
- **Accessibility check:** `tests/ui-audit/axe.spec.ts` (axe-core, WCAG 2.2 A/AA) runs with `npm run ui:screens`; `@axe-core/playwright` 4.14.0 added as a dev dependency.
- **Measures:** lint warning cap 93 → 77; no raw palette classes outside the paper previews; no `text-white` on primary, arbitrary text sizes or `size="sm"` buttons. Tests updated for deliberate wording changes (listed in the commits).

**Accessibility pass · 2026-11-03 (PR #77)**
- The first axe-core run (WCAG 2.2 A/AA) found 75 serious problems across 3 rules; now **0** on 26 pages, light and dark, at 375 and 1280 px. The check fails on any serious or critical problem from now on (`UI_AXE_STRICT=0` to report only).
- Contrast: light-mode text tokens darkened so each passes 4.5:1 on every surface it sits on, tinted notices included (`--muted-foreground` #64748b → #4b5868, `--destructive` #dc2626 → #b91c1c, `--success` #15803d → #166534, `--warning` #b45309 → #92400e); "What is this?" links are body-coloured with an accent underline. Dark mode already passed.
- Names: the "Jump to a page… Ctrl K" button is named by its visible text (shortcut via `aria-keyshortcuts`); document template cards are named by their visible title and description.
- Keyboard: the scrolling minutes preview is focusable and labelled.

**9-A follow-up · Members without email · built 2026-11-04 (local, not yet pushed)**
- The owner asked for it: many members don't use email. A member now needs an email **or** a name and a phone number. A phone-only member is stored with `emailLower: ""` (kept, not removed, so the list query ordered by it still returns them), no `email` and no `emailConsent`; `memberEmailState` reports `no_email` ("No email (phone only)") and they are never emailed. Calls are unaffected (`memberCallState` never needed an email).
- Server: the create and import routes accept an empty email only with an encrypted contact flagged `hasPhone` and a name; email consent without an address is refused; the import's email attestation is needed only when a row has an email; the update route refuses email consent for a phone-only member and refuses removing their number. The server can't read numbers, so it trusts the browser's `hasPhone` flag beside the envelope, as for every phone in Phase 9.
- Duplicates: repeated emails are caught by the server as before. Without an email the browser, which can read the numbers, treats the same name and number (`phoneOnlyKey`) as the same person, both when adding one and in imports; people sharing a household phone with different names are separate members.
- Members page: Email optional with a hint, Name needed without an email, email consent disabled without an address, a *Phone only* filter, list sorted by name, import preview counts people (and those without an email), example CSV with a phone-only row.
- Tests: `tests/unit/members.test.ts` (state, display name, duplicate key, CSV rows without an email, refusals, mistyped email still refused, household phone kept); `tests/e2e-auth/members-contact.spec.ts` (name required, saved with `emailLower: ""` and no consent, duplicate refused, server refuses neither-email-nor-phone, email consent and removing the number, dialog refuses clearing it, import of a name-and-phone list skips the existing person and adds the household member, audit counts without numbers). Existing browser tests follow the new labels.

---

## 15. Phase 11 — Officer positions, member groups and event tasks (planned 2026-11-05; 11-A to 11-D built 2026-11-05)

**Goal.** The member list gains the organisation's structure: who holds which officer position (president, treasurer, secretary, board member…), which working groups people belong to (a phone-tree group that calls members about events, and event teams such as cooking, marketing and shopping), and a task checklist per event so each group knows what it owns. Admins only: members have no usable sign-in today (§15.1), so group leads who are admins coordinate their people in the app, and member self-service is a later phase.

### 15.1 What was checked (2026-11-05)

| Fact | Where | Effect on the design |
|---|---|---|
| Nothing like positions, groups or event tasks exists. Officer titles appear only in the wedding-certificate dropdown (23 titles, English + Nepali) and as free-text chair/secretary names on minutes. | `src/features/docgen/templates/weddingCertificate.ts:98-127`, `src/lib/minutes.ts:9-12` | The dropdown's titles seed the new positions list; the docgen dropdown is left as it is. |
| `members.roles` is an allowlist of `["member"]` so a member record can never grant admin power. Admin power lives only in `admins/{uid}`; there was no admin-management UI (added in Phase 17, §22). | `app/api/organizations/[orgSlug]/members/route.ts:56-60`, `src/lib/admin.ts:160` | Positions and groups get their own fields and collections; `roles` is untouched. |
| Members cannot use the app. The `/login` email link issues a cookie with no role claim, so every page and rule treats them as signed out; nothing links to `/login`. | `app/api/auth/session/route.ts:45-51`, `src/lib/auth.ts:84-88` | Decision: admins only for this phase. Nothing below depends on member sign-in, and nothing blocks adding it later. |
| Callers in the calling tree must be active admins; only super admins edit the tree. | `src/lib/callingTree.server.ts:47-72` (D15) | The phone-tree group suggests callers; it never bypasses D15. |
| Pages read Firestore directly through `adminData.server.ts`; audit actions need a sentence in `ACTIVITY`; composite indexes must be declared and created. | `src/lib/adminData.server.ts`, `src/lib/adminView.ts:63-126`, `firestore.indexes.json` | Every query below is single-field with in-memory sorting, so no new index. |

### 15.2 Decisions for the owner (accepted as recommended, see §15.7)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D17 | Where does group membership live? | As `groupIds[]` on the member document, with the lead on the group document. | "Groups of a member" is free on the Members page (it already loads everyone); "members of a group" is one `array-contains` query; no new rules or index; membership changes go through one route. |
| D18 | Who may edit what? | Positions catalogue and officer terms: super admin. Groups, membership, event tasks and templates: any active admin. Deleting a group or a template: super admin. | The officer record is governance; day-to-day coordination stays open to every admin. |
| D19 | Encrypt any of it? | No. Positions, group membership and task notes stay plaintext. | Lists and filters need plain fields, officers already appear on certificates and the public site, and task notes are event logistics, not personal data. The task dialog says to keep notes about the work, not about people; numbers stay on the member's contact card. A `#notes` envelope slot stays possible later, as for member contacts. |
| D20 | How does the phone-tree group map to callers? | Link a member to an admin by `uid`, else by `emailLower`, active admins only. Group members who are admins are suggested as callers; the rest are flagged "needs admin access to use My Calls"; nobody is added automatically. | The owner sees who still needs an admin account; D15 and the tree logic are untouched. |

### 15.3 Design

**Data (all under `organizations/ghmo`, plaintext, server-written, admin-read; new paths in `src/lib/firestorePaths.ts`):**
- `positions/{id}`: `title`, `titleNe`, `order`, `active`, `builtIn`. Deterministic ids for the defaults (`president`, `general_secretary`…) so seeding is idempotent. Seeded lazily and idempotently on the first visit to the Positions page or the positions API (`ensurePositionDefaults` in `src/lib/positions.server.ts`); built-ins can be renamed or deactivated, not deleted.
- `positionTerms/{id}`: `positionId`, `memberId`, `startsOn` ("YYYY-MM-DD"), `endsOn` (string or null), `note`, `createdBy`. Current = `endsOn` null or ≥ today (Harrisburg date). Setting a new holder can close the previous holder's term the day before. Past officers stay on record.
- `groups/{id}`: `name`, `description`, `leadMemberId`, `kind` (`"callers"` or null), `active`, `builtIn`. The phone-tree group is `groups/phone_tree_callers` with `kind: "callers"`, created on first use; code finds it by `kind`, so it can be renamed. Member counts are computed on read.
- `members/{id}.groupIds[]` (D17), written only by the group-members route.
- `eventTasks/{id}`: `eventId`, `title`, `notes`, `groupId` (or null), `memberIds[]`, `dueOn`, `status` (open | done), `order`, `doneAt`, `doneBy`, `createdBy`. Top-level, not under the event, because events live in up to three collections and the public pages cache event documents; a separate collection can never leak into `toPublicEvent`.
- `eventTaskTemplates/{id}`: `name`, `description`, `items[]` of `{ title, notes, groupId, dueOffsetDays, order }` (negative offsets mean "days before the event").
- Member-to-admin link (`linkMemberToAdmin` in `src/lib/groups.ts`): `member.uid` equals an admin's id, else `member.emailLower` equals `admin.emailLower`; only active admins count; phone-only members never link.

**API (pattern of `app/api/admin/calling-tree/route.ts`: env check, `requireActiveAdmin`, `isSuperAdmin` where needed, zod, `logAuditEvent`, each action labelled in `ACTIVITY`):**
- `/api/admin/positions` (GET list with terms; POST, super), `/api/admin/positions/[id]` (PATCH, super), `/api/admin/positions/[id]/terms` (POST with `endPrevious`, super), `/api/admin/position-terms/[termId]` (PATCH, DELETE, super).
- `/api/admin/groups` (GET with counts and lead names; POST), `/api/admin/groups/[id]` (PATCH; DELETE super, which removes the id from every member in batches), `/api/admin/groups/[id]/members` (POST `{ add, remove }`; the lead must stay a member).
- `/api/admin/organizations/ghmo/events/[eventId]/tasks` (GET, POST), `…/tasks/[taskId]` (PATCH incl. status, DELETE), `…/tasks/apply-template` (POST; skips titles already present, computes due dates from the event start).
- `/api/admin/task-templates` (GET, POST from items or from an existing event), `/api/admin/task-templates/[id]` (PATCH; DELETE super).
- Validation: ids via `MEMBER_ID_PATTERN`, dates `YYYY-MM-DD` with `endsOn ≥ startsOn`, one open term per position and member, group must be active, members must exist. Page reads added to `adminData.server.ts`. The route sweep covers anonymous refusal.

**Pages (style per `docs/UI_STYLE.md`, built from `AdminList`, `AdminSectionCard`, `Segmented`, `Select`, `Badge`, `Dialog`, `ConfirmDialog`):**
- Sidebar: **Positions** and **Groups** under Community after Members (separate pages: three different jobs; `isActiveNavItem` and the page search work unchanged).
- **Positions** `/admin/positions`: Current | Past | All; a row per position ("President / अध्यक्ष", current holder "since Mar 2025", past terms underneath); super admins get Set holder (member, start, optional end, confirm closing the previous term), End term, Rename, Add position.
- **Groups** `/admin/groups` and `/admin/groups/[id]`: rows with member count, lead and open-task count; the group page lists people (badges Lead, and for the callers group Admin or "Needs admin access to use My Calls"), Add people, Make lead, Remove; and the group's tasks across events (Open | Done, due date, overdue badge, link to the event).
- **Members**: rows gain position and group badges (three, then "+n"); Group and Position filters beside the existing ones; a Groups action opens a checkbox dialog.
- **Event tasks**: a panel under the event form on `/admin/events/[id]/edit` (checkbox to mark done, due date, group and people, notes; Add task; Use a template; Save as template). Creating an event lands on its edit page so tasks can be added at once. The Events list shows "3 of 7 tasks done". Templates live at `/admin/events/templates`, linked from the Events page.

**Calling tree:** `listCallerCandidates()` also loads the callers group and returns suggested admin members and flagged non-admin members; the Calling Tree page shows suggestions first with a badge, an info note listing who needs admin access, and a super-admin button "Check everyone in the group". `saveTree` and D15 unchanged; with no group the page is as today.

### 15.4 Sub-phases (each ends deployable: lint, tests, build green)

| Step | Scope | Exit criteria |
|---|---|---|
| **11-A** | Positions, terms, groups, `groupIds`, seeds, routes, rules, nav, Positions and Groups pages, member badges and filters | Visiting Positions seeds the defaults; a holder is set with a start date and the predecessor's term closes; a group with a lead and members exists; Members filters by group; rules tests pass |
| **11-B** | Event tasks and templates, routes, the panel on the event page, the group page's task section, the templates page | Tasks are created, done and deleted on an event; applying a template skips duplicates and computes due dates; a group page lists its tasks |
| **11-C** | Calling-tree suggestions from the callers group | Admin group members suggested, non-admins flagged, the existing calling-tree spec unchanged and green |
| **11-D** | Task counts on the Events list; plan §15, README data model and routes, admin guide, go-live checklist ("enter current officers with start dates; put the callers in the phone-tree group") | Docs merged |

### 15.5 Tests and risks
Unit: `tests/unit/positions.test.ts` (current and past terms, closing the previous term, overlap refused), `tests/unit/groups.test.ts` (uid beats email, inactive admins excluded, phone-only never linked, add and remove deduplicated), `tests/unit/eventTasks.test.ts` (due-date offsets across daylight-saving changes, duplicate skipping, overdue). Rules: one block proving admin read, admin write refused and anonymous read refused for all five collections. Browser: `positions-groups.spec.ts`, `event-tasks.spec.ts`, `calling-tree-groups.spec.ts`.

| Risk | Mitigation |
|---|---|
| A group page lists names | Admin-only, plaintext names already shown on Members, never numbers |
| Task notes could hold personal details | Help text in the dialog; numbers belong on the contact card; a later `#notes` envelope is possible |
| Templates re-applied twice | Titles already present are skipped; past due dates show as overdue rather than being dropped |
| A query gains an `orderBy` and needs an index | Keep every query single-field and sort in memory; the rules tests and the build would otherwise fail as in #82 |
| Tasks reaching the public site | Separate collection, `toPublicEvent` unchanged, a rules test proves anonymous reads fail |

### 15.6 Out of scope
Member sign-in and "my tasks" pages, reminders to team members (email, SMS, push; email reminders came later in Phase 12, §16), SMS or Messenger integration, a public "Our board" page, task comments or attachments, merging event tasks with minutes action items (only the overdue rule is shared), changing the docgen position dropdown.

### 15.7 Progress
**11-A built (2026-11-05).** Decisions D17 to D20 were accepted with "start 11-A".
- Pure rules and tests: `src/lib/positions.ts` (dates, term status, overlap, `planTerm`, `termEditConflict`, the 16 default positions) and `src/lib/groups.ts` (cleaning, `planMembership`, `linkMemberToAdmin`), with 31 unit tests.
- Storage: `src/lib/positions.server.ts` (idempotent seeding on first read, terms written in a transaction so two admins cannot both seat a president) and `src/lib/groups.server.ts` (the callers group is created on first read; membership is `groupIds` written in batches of 450; delete removes the id from every member).
- Routes: `/api/admin/positions`, `positions/[positionId]`, `positions/[positionId]/terms`, `/api/admin/position-terms/[termId]`, `/api/admin/groups`, `groups/[groupId]`, `groups/[groupId]/members`. Shared helpers in `src/lib/adminRoute.server.ts`. Nine new activity sentences. Super admin: positions, terms, deleting a group. Any admin: groups and membership.
- Rules: `positions`, `positionTerms` and `groups` are admin-read and server-write only (new block in `tests/rules/firestore.rules.test.ts`, also proving `groupIds` on a member cannot be written from a browser).
- Pages: Positions (Current and Past terms, set holder, end term, add and edit a position), Groups and Group (create, add people, make lead, remove, edit, delete), nav items, and on Members the group and officer badges, a group filter and a Groups dialog. Browser spec `tests/e2e-auth/positions-groups.spec.ts`.
- Differences from the design above: the term route is `/api/admin/position-terms/[termId]` and group membership is a POST; the Positions page has Current and Past terms only (a past term can be removed if entered by mistake); Members shows every badge rather than three plus "+n"; "End term" sets the end date to today, so the person still holds the seat through today. Open-task counts on group rows and the group page's task section arrive with 11-B.

**11-B built (2026-11-05).**
- Pure rules and tests: `src/lib/eventTasks.ts` (cleaning, the event's calendar day, due dates from template offsets counted in calendar days so a daylight-saving change cannot shift them, overdue, counts, sorting, `planTemplateApplication` that skips titles already present, template items from an event's tasks) with 17 unit tests.
- Storage: `src/lib/eventTasks.server.ts`. Tasks need a real group (switched on) and real people; a title can appear once per event; at most 100 tasks per event and 20 people per task. Deleting an event deletes its tasks; deleting a group clears the group from its tasks and keeps them.
- Routes: `/api/admin/organizations/ghmo/events/[eventId]/tasks` (GET, POST), `…/tasks/[taskId]` (PATCH incl. done and reopen, DELETE), `…/tasks/apply-template` (POST), `/api/admin/task-templates` (GET, POST typed items or copy from an event), `/api/admin/task-templates/[templateId]` (PATCH; DELETE super admin), `/api/admin/groups/[groupId]/tasks` (GET). Nine new activity sentences; the log holds titles and counts, never notes or people's names.
- Rules: `eventTasks` and `eventTaskTemplates` are admin-read and server-write only (rules test also proves visitors and members cannot read them, so task notes never reach the public site).
- Pages: a Tasks section on the event edit page (add, edit, mark done, overdue badge, Use a template, Save as template, saves as you go), creating an event now lands on its edit page, `/admin/events/templates` (linked from Events), a Tasks section on the Group page, and open-task counts on the Groups list. Browser spec `tests/e2e-auth/event-tasks.spec.ts`.
- Differences from the design: a template item whose due date is more than a year from the event day keeps no due date; "Save as template" does not keep assigned people (only groups); the Events list task counts stay in 11-D.

**11-C built (2026-11-05).**
- Pure rule: `suggestCallers` in `src/lib/groups.ts` (with `linkMemberToAdmin` from 11-A): members of the callers group who are active admins are suggested once each; active members who are not admins are listed as needing admin access; disabled members are ignored. 3 new unit tests.
- Server: `findCallersGroup` and `callerLinksForGroup` in `src/lib/groups.server.ts`; `listCallerCandidates` in `src/lib/callingTree.server.ts` now returns each admin with a `suggested` flag plus a `callersGroup` summary (null when the group is switched off). `GET /api/admin/calling-tree` passes both through; `GET /api/admin/groups/[groupId]` adds `adminAccess` (who is an admin) for the callers group. `saveTree` and decision D15 are untouched: the server still accepts only active admins as callers.
- Pages: on the Calling Tree page suggested admins are listed first with an "In Phone tree callers" badge; an info note names the members who need admin access (with a link to the group); a super admin gets **Check everyone in the group**, which only ticks the boxes, and nothing is saved until Save calling tree. With no group, or the group switched off, the page is as before. On the callers group page each active person shows **Admin** or **Needs admin access to use My Calls**. Browser spec `tests/e2e-auth/calling-tree-groups.spec.ts`.
- Matching is by email (members added by an admin have no sign-in id), so a person whose member email differs from their admin email will show as needing access until the emails agree.

**11-D built (2026-11-05).**
- `taskCountsByEvent` in `src/lib/eventTasks.server.ts` (one read of every task's event, status and due date, counted with `countTasks`). The Events list shows "3 of 7 tasks done" under each event's date, and a red "2 overdue" badge when open tasks are past due. If the counts can't be read the list still loads without them.
- Go-live checklist (`docs/GO_LIVE_CHECKLIST.md`): enter the current officers with start dates, fill the callers group, make event groups with leads, write a general-meeting template, and publish the Firestore rules again. Admin guide §1e and §1f, README routes and data model, and this section were written with each step.
- Phase 11 is complete. Not built, as listed in §15.6: member sign-in and "my tasks" pages, reminders to team members (email reminders were added in Phase 12, §16; SMS, voice and push were not), a public board page, task comments, merging with minutes action items.

## 16. Phase 12 — Reminders to team members (planned 2026-11-05; 12-A to 12-C built 2026-11-05)

**Goal.** An admin can remind the people who own tasks on an event, by email, with one button. A person gets one email listing their open tasks for that event. Members who did not agree to be emailed, who opted out, whose address bounced, or who have no email (phone-only) are never emailed; the admin sees who they are so they can be phoned instead (the calling tree and call campaigns already do that). Admins only trigger it: members still have no sign-in, so nothing here depends on one.

### 16.1 What was checked (2026-11-05)

| Fact | Where | Effect on the design |
|---|---|---|
| Members are emailed only when `memberEmailState` is `ready` (active, has an email, consent recorded, not opted out, not bounced). Every broadcast email carries the organization's name and postal address and a signed unsubscribe link, with the one-click headers. | `src/lib/members.ts`, `src/lib/broadcastMail.ts`, `src/lib/unsubscribeToken.ts` | Reminders use the same checks, footer and unsubscribe token, so one unsubscribe stops everything. No second consent model. |
| Sending goes through Resend. A batch endpoint takes up to 100 messages with an idempotency key. A shared daily quota (`broadcastQuota/{day}`, default 100) and the `FEATURE_BROADCASTS` switch guard the free tier; `sendingBlocker` explains what is missing. | `src/lib/mailer.server.ts`, `src/lib/broadcastSending.ts`, `src/lib/broadcastSender.server.ts` | Reminders reserve their emails from the same daily quota inside a transaction and obey the same switch, so reminders can never starve a broadcast or overshoot the provider limit. |
| Admin notification emails are content-free and opt-in. Broadcasts to members need a second admin's approval because they carry free text to everyone. | `src/lib/notifications.ts`, `src/lib/broadcast.ts` | Member reminders are not content-free (a person needs to know which task), but they use a fixed template, name only that person's own tasks, and go only to the few people a task is given to. No free text, so no approval step. |
| Task titles and due dates are plaintext (D19); notes may hold details. | §15.3 | Emails list titles and due dates only, never notes, never other people's names. |
| There is no scheduled job in the project, and Vercel's Hobby plan allows cron only once a day. | `vercel.json` | 12-A is manual. An automatic daily digest is a later step that needs a secret and an owner decision. |

### 16.2 Decisions (taken as recommended; the owner can change any of them)

| ID | Question | Decision | Effect |
|---|---|---|---|
| D21 | Which people and which channel? | Email only, to consented members. Named people on a task, plus the lead of the task's group; never the whole group. | A group of 60 cooks is not emailed by accident; the lead passes it on. Phone-only members are listed as "can't be emailed" so an admin can call. |
| D22 | Who may send, and is there an approval step? | Any active admin; no approval step; fixed template. | Same openness as assigning tasks (D18). The risk a second approver guards against in broadcasts (free text to everyone) is absent. |
| D23 | Limits | One reminder per person per event every 24 hours; at most 50 people per send; shares the broadcast daily quota, kill switch and footer; ten sends per admin per hour. | Repeated clicks cannot spam; the free tier is protected. |
| D24 | Manual or automatic? | Manual first (12-A). An automatic daily digest of overdue tasks is 12-B, off by default. | No cron secret or schedule to get wrong before the manual flow is proven. |
| D25 | What does the automatic digest cover, and how much of the email limit may it use? | One email a day per person listing their overdue open tasks, grouped by event, for events that are upcoming or ended in the last 7 days. At most 50 people a day and never more than half of the day's shared limit; the people with the most overdue tasks go first and the rest wait for tomorrow. A person sent a digest in the last 20 hours is skipped. | A busy day of overdue tasks cannot starve a broadcast on the free tier; old events do not nag. |
| D26 | Who controls it, and how is it called? | Off until a super admin switches it on (and any super admin can switch it off). Vercel Cron calls `GET /api/cron/task-digest` once a day at 13:00 UTC (8 or 9 AM Eastern) with `CRON_SECRET`; with no secret, nobody can call it. A claim on the settings document means it runs at most once a day even if called twice. | Nothing sends by accident; the schedule is one line in `vercel.json`. |

### 16.3 Design

- **Planner** (`src/lib/taskReminders.ts`, pure): from an event's tasks, groups, members and the last reminder times, returns who will be emailed (with their tasks), who cannot be and why, who was reminded in the last 24 hours, and how many open tasks nobody can be reminded about. Mode `all` (every open task) or `overdue` (open tasks past due, in the organization's time zone).
- **Email** (same file): subject "Reminder: your tasks for {event}"; body lists the person's open tasks with due dates and "overdue" where it applies, the event date, and a line asking them to tell whoever gave them the task if they cannot do it. The standard footer and unsubscribe link are added by `withUnsubscribeFooter`.
- **Storage:** `organizations/ghmo/eventTaskReminders/{eventId}_{memberId}`: `eventId`, `memberId`, `lastSentAt`, `claimId`, `claimedAt`, `count`. Server-only, admin-read. A claim is written in one transaction that re-checks the 24-hour cooldown and any in-flight claim (under three minutes old), reserves quota and refuses if today's quota would be passed. After a successful send `lastSentAt` is set; on failure the claim and the reserved quota are released, so a failed send never blocks a retry. The provider idempotency key is the claim id.
- **API:** `POST /api/admin/organizations/ghmo/events/[eventId]/tasks/remind` with `{ mode, send }`. `send: false` returns the preview and changes nothing; `send: true` sends and returns counts. Audited as `event_tasks_reminded` with counts only.
- **UI:** a **Send reminders** button in the event's Tasks section opens a preview (will be emailed, cannot be emailed and why, reminded recently, tasks nobody is assigned to), then a confirm button showing the number.
- Deleting an event removes its reminder records.

### 16.4 Sub-phases

| Step | Scope | Exit criteria |
|---|---|---|
| **12-A** | Planner, email, claim and send, route, rules, the dialog, tests, docs | A reminder reaches only consented people with their own tasks; a second click within 24 hours sends nothing; a failed provider call leaves no block; phone-only people are listed, not emailed; unsubscribe link present |
| **12-B** | Automatic daily digest of overdue tasks (Vercel Cron, secret, an on/off switch on the Events page, off by default) | Off by default; once on, one digest per person per day, consent and the shared limit respected; a failed send can be retried the same day |
| **12-C** | Docs: admin guide, go-live line, runbook case for a wrong reminder or a complaint | Docs merged |

### 16.5 Risks and out of scope

| Risk | Mitigation |
|---|---|
| A reminder reaches someone who did not agree | Only `ready` members; consent and opt-out are re-read at send time, not taken from the preview |
| Task titles hold something sensitive | Admin help text already says to keep task text about the work; notes are never sent |
| Double send after a crash or double click | Claim in a transaction, cooldown, in-flight check, provider idempotency key |
| Reminders use up the day's quota | Reserved from the broadcast quota in the same transaction; refused with the number left |

Out of scope: SMS, voice or Messenger reminders (decided in Phase 8–9), reminders to whole groups, free-text messages, member sign-in and "my tasks", read receipts.

### 16.6 Progress
**12-A built (2026-11-05).**
- Pure rules and tests: `src/lib/taskReminders.ts` (owners of a task, the plan of who is emailed, who can't be and why, who was reminded recently, the fixed email text, the plain-words labels) with 11 unit tests.
- Server: `src/lib/taskReminders.server.ts`. `previewReminders` changes nothing. `sendReminders` re-reads each member's consent and reminder record inside one transaction, drops anyone who has opted out or was just reminded, reserves the day's broadcast quota (refusing with the number left if it would be passed), then sends one provider batch with an idempotency key; a failed batch releases the claims and the quota. Deleting an event removes its reminder records.
- Route: `POST /api/admin/organizations/ghmo/events/[eventId]/tasks/remind` with `{ mode, send }`; ten sends per admin per hour; audited as `event_tasks_reminded` with counts only.
- Rules: `eventTaskReminders` is admin-read, server-write only (rules test extended).
- UI: **Send reminders** in the event's Tasks section opens a preview (will be emailed, can't be emailed and why, reminded in the last 24 hours, tasks nobody is assigned to) and a confirm button showing the number. Browser spec `tests/e2e-auth/task-reminders.spec.ts` (mail stub).
- Docs: admin guide §1g, go-live checklist line, runbook case N, README data model.
- Notes: a group's task goes to the group's lead only. A send reaches at most 50 people; the rest are picked up by the next send because the first 50 are then in their 24-hour window. The provider is never given a person's other tasks, notes or other recipients.

**12-B built (2026-11-05).**
- Pure rules and tests: `planDigest`, `digestCap` and `digestEmail` in `src/lib/taskReminders.ts` (7 new unit tests): overdue open tasks of upcoming or recently ended events, grouped by event for each person; the lead gets the group's tasks; the same consent rules as 12-A; 20-hour per-person cooldown; the cap and who waits.
- Server: `src/lib/taskDigest.server.ts`. `runTaskDigest` does nothing while the switch is off, claims the day on the settings document (a second call, or one while a run is under 10 minutes old, does nothing), re-reads consent, each person's digest record (`eventTaskReminders/digest~{memberId}`) and the quota in one transaction, sends one provider batch with an idempotency key, and records a summary of the run. A failed send releases the claims and the quota and does not use up the day, so a retry works.
- Routes: `GET /api/cron/task-digest` (needs `Authorization: Bearer <CRON_SECRET>` of at least 16 characters; compared in constant time; refuses everyone when no secret is set; audited as `task_digest_run`, counts only), and `GET/PUT /api/admin/task-digest` (any admin reads; super admin switches; audited as `task_digest_switched`). The schedule is `crons` in `vercel.json` (`0 13 * * *`).
- Rules: `taskDigest` is admin-read, server-write only (rules test extended).
- UI: a **Daily overdue digest** card on the Events page with the On/Off state, the last run, warnings when the schedule secret or email set-up is missing, and Switch on (with a confirmation) or Switch off for super admins. Browser spec `tests/e2e-auth/task-digest.spec.ts` (3 tests, mail stub).
- Notes: Vercel Hobby runs a cron once a day and may start it anywhere in the hour; crons run only on the production deployment. A manual reminder and the digest are independent, so someone reminded by hand in the morning can still get the digest. 12-C (docs) was written along with 12-A and 12-B.

**12-C built (2026-11-05).** The documentation was written with each step and checked against the code on this date: every number in the guide, the go-live checklist and the runbook (50 people per send and per day, ten sends per admin per hour, 24 hours between reminders, 20 hours between digests, half of the daily limit, the 13:00 UTC schedule, the 7-day event window) matches `src/lib/taskReminders.ts` and `vercel.json`. This step also corrected the status lines in this plan (roadmap row, §16 heading, §16.2, §15.7) that still read as planned. Where each part is described:
- **Admin guide** (`docs/BROADCASTS_GUIDE.md`): §1g, sending a reminder, who is and is not emailed, the limits, and the daily digest card.
- **Go-live checklist** (`docs/GO_LIVE_CHECKLIST.md`): the task reminders line (email set-up is shared with broadcasts, publish the rules again, send one test) and the optional daily digest line (`CRON_SECRET`, redeploy, switch on, check the next day's run).
- **Runbook** (`docs/RUNBOOK_INCIDENT.md`): case N, a reminder to the wrong person or a complaint, including switching the digest off.
- **README**: the data model (`eventTaskReminders`, `taskDigest/settings`) and the scheduled route.
- Phase 12 is complete. Not built, as listed in §16.5: reminders by SMS, voice or Messenger, reminders to whole groups, free-text messages, member sign-in and "my tasks" pages, read receipts.

## 17. Phase 13 — Member profile (planned 2026-11-05; 13-A to 13-D built 2026-11-05)

**Goal.** Each member gets a profile page that gathers what the community knows about them in one place, for admins only: how long they have been a member, their city and state, their family members (with phone numbers if known), a log of notes that admins add, the history of calls made to them and what happened, and how polite or rude each call was. It sits on top of the member list, call campaigns and encrypted contact record that already exist.

### 17.1 What was checked (2026-11-05)

| Fact | Where | Effect on the design |
|---|---|---|
| A member's phone, second number, language, household and one free-text note live in one end-to-end encrypted envelope bound to `members/{id}#contact`; the server stores it but cannot read it. Names, emails, consent flags and groups are plaintext. | `src/lib/members.ts`, `src/lib/memberContact.server.ts`, D12 and D19 | Anything personal that a database reader should not see (family members and their numbers, notes, call manner) is encrypted the same way. Coarse facts the lists need (city, state, member since) are plaintext fields. |
| The only place that writes the contact envelope is Edit contact on the Members page, and it rebuilds the contact from its form fields alone. | `saveContact` in `src/components/admin/members/MembersClient.tsx` | Anything new in the envelope would be erased by an unrelated edit unless that save carries it through. 13-A changes it to keep the family list. |
| Every call attempt is stored on the call record with its outcome, caller and time; the attempt note is an encrypted envelope bound to campaign, member and attempt. RSVP and the call's latest outcome are on the call record. | `src/lib/callCampaigns.ts`, `src/lib/callCampaigns.server.ts` | The call history is already recorded; 13-C reads it across campaigns. A manner rating is one more optional encrypted field on an attempt. |
| Member lists load every member with plaintext fields only; encrypted data is read on the device after unlock, one member at a time on the profile page. | `app/(admin)/admin/members/page.tsx`, `useMemberContacts` | A profile page can load one member, decrypt on the device, and never put encrypted content into a list or an export. |

### 17.2 Decisions (taken as recommended; the owner can change any of them)

| ID | Question | Decision | Effect |
|---|---|---|---|
| D27 | What is encrypted and what is plain? | Plain on the member record: member-since date, city, state. Encrypted on the device: family members and their phone numbers, notes, and the manner rating of each call. | Lists can show and filter by city and state; nothing about a person's family, notes or manners is readable in the database or in a backup. |
| D28 | Who may write what? | Any active admin edits member since, city, state and family, and adds notes. A note is append-only with its author's name and the date; its author or a super admin can delete it. | A note cannot be quietly rewritten, and a mistake can be removed. |
| D29 | What are family members for? | Reference only: a name, how they are related, and an optional phone number. Up to ten per member. They are never contacted, never put in the calling tree or a campaign, and entering a number gives no consent to be called. | The profile helps a caller know who to ask for; it does not widen who can be phoned. |
| D30 | How is "polite or rude" recorded? | A three-level, optional scale (polite, neutral, rude) that the caller chooses for each call attempt, stored encrypted with the attempt. The profile shows counts and the latest few. It never appears in lists, filters, exports or the activity log. Super admins can clear a rating. | Plain facts about a call, not free-text insults; one wrong click can be fixed; nothing leaks outside the profile. |
| D31 | Address? | None. City and state only: the city as text, the state as a US two-letter code (a full name such as "Pennsylvania" is turned into "PA") or other text for places outside the US. | No street address is ever collected. |

### 17.3 Design

- **Member record** (plaintext, set through the existing member update route by any admin): `memberSince` ("YYYY-MM-DD", not in the future), `city` (80 characters), `state` (40). The profile shows "Member since Mar 2019, 6 years 8 months". Without a date it offers the day the person was added to the list as a starting point.
- **Family** (encrypted, inside the contact envelope as `family: [{ name, relationship, phone }]`): edited on the profile; the Edit contact save on the Members page keeps it.
- **Notes** (13-B, encrypted): one small record per note under `members/{id}/notes/{noteId}`, each an envelope bound to its own location, with `authorUid`, `authorName` and `createdAt` in plain fields so the order and authorship are visible without decrypting.
- **Call history and manner** (13-C): the profile reads the member's call record in every campaign (campaign title and date, each attempt's time, outcome, caller, RSVP) and the decrypted notes and manner of each attempt. Callers record the manner on My Calls when logging an attempt.
- **Page:** `/admin/members/[memberId]`, opened with a **Profile** button on each Members row. One card per area; areas that need decryption show the unlock card until the device is unlocked.

### 17.4 Sub-phases

| Step | Scope | Exit criteria |
|---|---|---|
| **13-A** | Profile page, member since, city and state, family members; Edit contact keeps family | Fields save and show; family is ciphertext in Firestore, readable after unlock, and survives an Edit contact save |
| **13-B** | Notes log | Notes added with author and date, encrypted, deletable by author or super admin |
| **13-C** | Call history and manner | History across campaigns on the profile; manner recorded per attempt, encrypted, clearable by a super admin |
| **13-D** | Docs, privacy runbook case (a member asks what is held about them, or to have it removed), go-live line | Docs merged |

### 17.5 Risks and out of scope

| Risk | Mitigation |
|---|---|
| Notes and manner ratings are opinions about people and could be unfair or leak | Encrypted, admin-only, never in lists, exports or the activity log; authors named; three fixed levels for manner; guidance text asks for what happened, not opinions; a super admin can remove any of it; the runbook covers a member asking to see or erase their data |
| Family phone numbers are third-party data | Encrypted; never contacted or consented by implication; shown masked until an admin presses Show |
| Edit contact wiping new fields | The save now merges what is already stored; a browser test edits the contact and checks the family list survives |
| City and state used to guess an address | No street, number or postcode field exists |

Out of scope: a street address, photos, member self-service or a member-facing profile, scoring or ranking members, exporting profiles, and any use of manner ratings to exclude someone automatically.

### 17.6 Progress
**13-A built (2026-11-05).** Decisions D27 to D31 taken as recommended.
- Pure rules and tests: `src/lib/memberProfile.ts` (member-since check and "7 years, 8 months" wording, city and state with US state names turned into codes, the family list: names, optional relationship, optional phone stored as E.164, at most ten) with 10 unit tests; `FamilyMember` and `family` added to `MemberContact` in `src/lib/members.ts`.
- Server: the existing member update route accepts `memberSince` (a real day, after 1950, not in the future), `city` and `state` from any active admin; a blank clears one. The activity log keeps before and after. A one-member loader (`getMember`) feeds the page.
- Page: `/admin/members/[memberId]`, opened with a **Profile** button on each Members row. A Membership card (member since, city, state, with "Use the day they were added" when no date is set) and a Family card that sits inside the encryption gate. The Members list also shows and searches city and state.
- Family is stored inside the encrypted contact envelope, so it is ciphertext in Firestore and absent from the activity log. Numbers show masked until Show; family are never called or emailed.
- Edit contact on the Members page used to rebuild the contact from its form fields, which would have erased family; it now carries the stored family list through, refuses to overwrite a contact this device cannot open, and counts a contact with only a family list as not empty. A browser test removes that carry-through and fails, so it guards the behaviour.
- Browser spec `tests/e2e-auth/member-profile.spec.ts` (2 tests).

**13-B built (2026-11-05).**
- Pure rules and tests: `src/lib/memberNotes.ts` (the location a note is bound to, member and note id; the 2000-character limit and the 200-note cap; who may delete; newest-first order) with 6 unit tests.
- Server: `src/lib/memberNotes.server.ts` and routes `GET` and `POST /api/organizations/ghmo/members/[memberId]/notes`, `DELETE …/notes/[noteId]`. The note text is the browser's encrypted envelope, checked to come from an active device of the signed-in admin and stored without being read; `authorUid`, `authorName` and `createdAt` are plain. A note id that exists is refused, and a member at 200 notes must delete one first. Audited as `member_note_added` and `member_note_deleted` with the note id only, never the text.
- Rules: notes live under `members/{id}/notes/{noteId}`, which the existing members rule already makes admin-read and server-write only; a rules test now proves reads for admins and refusal for browser writes and for everyone else.
- UI: a **Notes** card on the profile (add a note, list newest first with author and date, character count, delete with confirmation). It sits inside the encryption gate with Family, so it needs an unlocked device to add or read; with encryption off it says so. A note this device cannot open says that plainly.
- Delete: the author or a super admin (the server decides; the button only shows for them). Notes cannot be edited.
- Browser spec `tests/e2e-auth/member-notes.spec.ts` (2 tests): ciphertext and plain author and date in Firestore, no text in the log, order, length limit, author and super-admin delete, a plain admin refused on another's note, and encryption-off refusals.

## 18. Phase 14 — Push notifications (planned 2026-11-05; 14-A to 14-C built 2026-11-06)

**Goal.** An admin who switched it on gets a notification on their phone or computer when something needs them: a new message in Admin chat, new activity in Plans & Issues, and the other alerts that today only arrive as email (meeting minutes waiting for approval, calls to make, a broadcast waiting for its second approver, a security alert). It uses the installed web app (PWA) and the standard Web Push protocol, so no app store app and no third-party notification service or SDK is needed. Like the emails, a notification says that something happened, never what.

### 18.1 What was checked (2026-11-05)

| Fact | Where | Effect on the design |
|---|---|---|
| Alerts are content-free emails sent by one function, `notifyAdmins(kind, actorUid, origin, onlyUids?)`, with five kinds (`chat`, `thread`, `minutes_submitted`, `calls`, `security`). It skips the person who caused the activity, sends only to active admins who opted in (`notifyEmail`), and sends at most one email per person per kind every 30 minutes. It is called from the chat and thread routes (through `/api/admin/notify`), minutes submission, call campaigns and a locked authenticator. | `src/lib/notify.server.ts`, `src/lib/notifications.ts`, `app/api/admin/notify/route.ts` | Push hooks into the same function, so every place that can email an alert can also push it, with the same recipients and the same words. |
| The opt-in is one switch on the Security page. | `app/api/admin/notifications/route.ts` | Push gets its own switch there, per device, because permission is granted per browser. |
| The site is an installable web app with a deliberately small service worker that never caches pages or API answers, and it has no push or notification-click handling. | `public/sw.js`, plan §11 | Push adds two small handlers (show a notification, open the page when it is tapped) and changes nothing about caching. |
| There is no push library in the project and no secret for it. | `package.json` | Adds the `web-push` package (MPL-2.0, used unmodified; checked 2026-11-06, the plan first said MIT) and a VAPID key pair as environment variables. |
| On iPhone, web push works only for an app added to the Home Screen (iOS 16.4 or later); Android and desktop browsers allow it in the browser. | platform behaviour | The Security card says so and shows the steps. |

### 18.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D32 | How are notifications sent? | Standard Web Push with VAPID keys, using the `web-push` library, straight to each browser's own push service. No Firebase SDK, no notification vendor. | One small dependency; nothing about the community goes to a third-party service beyond the encrypted push itself. |
| D33 | What does a notification say? | The same content-free words as the email ("New activity in Admin chat", "Minutes are waiting for approval") and a link to the page; never a message text, name or title. | Nothing private shows on a lock screen or passes through a push service. |
| D34 | Who gets one, and how often? | Active admins who switched push on for that device, for the kinds they left on; never the person who caused the activity. At most one push per person per kind a minute, and a newer one replaces the older one in the tray (same tag). | A busy chat does not buzz a phone for every line. |
| D35 | Members? | No. Admins only: members have no sign-in. | Nothing here depends on member sign-in. |
| D36 | What is stored, and how is it protected? | One server-only record per device (the browser's push address and keys, the admin, when it was added). The server sends only to addresses at the known push services (Google, Mozilla, Apple, Microsoft), so a made-up address cannot make the server call an arbitrary site. A device whose address has expired is deleted; a disabled admin gets nothing; an admin can turn push off for a device at any time. | A stolen database dump or a forged subscription does not widen what the server will contact. |

### 18.3 Design

- **Keys and settings:** `VAPID_PUBLIC_KEY` (also exposed to the browser), `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` (a mailto address) in Vercel; push does nothing, and the Security card says why, until they are set.
- **Storage:** `organizations/ghmo/pushSubscriptions/{id}`: `uid`, `endpoint`, `p256dh`, `auth`, `label` (for example "Chrome on Android"), `kinds` (which alerts), `createdAt`, `lastSentAt`. Server-only; a person sees only their own devices, through the API.
- **Routes:** `POST /api/admin/push` (subscribe this device), `PATCH` (change kinds), `DELETE` (turn off this device), `GET` (this admin's devices and whether push is set up).
- **Sending:** `notifyAdmins` also calls a push sender for the same recipients. Sending is best effort and never blocks the action that caused it. A 404 or 410 answer from the push service deletes that device.
- **Service worker:** a `push` handler that shows the content-free notification (title, one line, tag, icon) and a `notificationclick` handler that opens or focuses the page; `sw.js` keeps its no-caching rules.
- **Security page:** a "Push notifications on this device" card: the button asks the browser for permission (it has to be a tap), switches for each kind, a list of this admin's devices with Turn off, and a plain note for iPhone.
- **Kinds:** the five existing ones in 14-A (chat and Plans & Issues first); 14-B adds the broadcast-waiting-for-approval alert and any others found, each wired the same way.

### 18.4 Sub-phases

| Step | Scope | Exit criteria |
|---|---|---|
| **14-A** | Keys, subscription storage and routes, service worker handlers, Security card, sending for admin chat and Plans & Issues | A device can be switched on and off; a chat message pushes to the other opted-in admins' devices but not to the sender; a stub push service receives a correctly signed, encrypted request; an expired device is removed; a forged address is refused |
| **14-B** | The other alerts: minutes, calls, security, broadcast approval, with per-kind switches | Each alert pushes with its own words and link; switching a kind off stops it |
| **14-C** | Docs: admin guide (including iPhone steps), go-live checklist (the keys), runbook case (a notification went to the wrong person or too many) | Docs merged |

### 18.5 Risks and out of scope

| Risk | Mitigation |
|---|---|
| A notification reveals something private on a lock screen | Fixed, content-free wording only; no names, titles or text |
| The server is made to call an arbitrary address | Only known push-service hosts are accepted when a device is added and again when sending |
| Too many pushes | One per person per kind a minute; newer replaces older; per-kind switches |
| Push stops working silently | The Security card shows each device and when one last worked; expired devices are removed |
| Browsers cannot be driven by a real push service in tests | The sender is tested against a local stub that checks the signing and encryption headers; the service worker handlers are small and covered by a browser test that fires a push event |

Out of scope: pushes to members, notification text with content, SMS or voice alerts, native iOS or Android apps, and read receipts.

**13-C built (2026-11-05).**
- Pure rules and tests: `MANNERS` (polite, neutral, rude), `attemptMannerLoc` and `MannerPayload` in `src/lib/callCampaigns.ts`; `src/lib/callHistory.ts` (newest-first order, totals, manner counts and the plain "3 polite · 1 neutral · 1 rude" line) with 6 unit tests.
- Server: a call attempt may carry an optional encrypted `manner` envelope, bound to campaign, member and attempt and checked to come from an active device of the caller, like the note. The server refuses a rating on a call that did not reach the person. The campaign dashboard's attempt data is built from named fields, so the rating never reaches it, and the answer to the caller leaves it out too. `GET /api/organizations/ghmo/members/[memberId]/calls` returns every call made to a member across campaigns with each attempt's outcome and caller (notes and ratings still encrypted), for any active admin. `DELETE …/calls/[memberId]/attempts/[attemptId]/manner` clears one rating (super admin); the attempt, its outcome and its note stay. The activity log says a rating was cleared and where, never what it was, and the call log entries never mention a rating.
- UI: the log-a-call dialog on My Calls asks "How was the call?" (Polite, Neutral, Rude, or Not recorded) only when the person was reached, with the reminder to say how the call went, not what you think of the person. The profile has a **Calls** card: totals ("In 2 campaigns · 2 attempts · reached in 2"), the rating counts once decrypted, each campaign with its latest outcome and RSVP, and each attempt with time, caller, note and rating badge; super admins get **Clear rating**.
- Browser spec `tests/e2e-auth/call-history.spec.ts`: two campaigns, a rude and a polite rating as ciphertext, none in the audit log or the dashboard data, the rating refused on an unreached call, the history and counts on the profile, a plain admin refused when clearing, and a super admin clearing it.

**13-D built (2026-11-05).** Documentation, checked against the code on this date.
- Admin guide §1h now has a table of what a profile holds, where each item is kept (plain or encrypted), who can read it and who can remove it, and advice on what to write in a note.
- Runbook case O: a member asks what is held about them or to have it removed (verify who is asking, what is held, stopping contact, removal in the app by a super admin, what stays and why, and a manual console step for full deletion with a line recorded in Plans & Issues).
- Go-live checklist: the Phase 13 line (rules, agreeing what notes and ratings are for, a test on a test member, knowing case O).
- **A gap, closed by Phase 15 (§20):** the app had no "Delete member" for a super admin; full erasure was a manual Firebase console step. A super admin can now delete a member from the profile, with a preview, a typed confirmation and an activity-log entry.
- Phase 13 is complete. Not built, as listed in §17.5: a street address, photos, member self-service or a member-facing profile, scoring or ranking members, exporting profiles, and any automatic use of manner ratings.

### 18.6 14-A built (2026-11-06)

- **Pure rules** (`src/lib/push.ts`, 14 unit tests): the kinds that can push (`chat`, `thread` for now), the known-host test for a push address (https, no sign-in details, no port, exact hosts `fcm.googleapis.com`, `updates.push.services.mozilla.com`, `web.push.apple.com`, or the `.push.services.mozilla.com`, `.notify.windows.com`, `.push.apple.com` families; lookalikes such as `fcm.googleapis.com.evil.com` and IP addresses are refused), the shape check for a browser's subscription, the device name from the user agent, the fixed payload, and who gets a push (active admins, device has the kind on, not the actor unless `onlyUids` names them, address still allowed).
- **Server** (`src/lib/push.server.ts`): `organizations/ghmo/pushSubscriptions/{id}` (id = first 32 hex characters of the SHA-256 of the address, so subscribing twice is one record), at most 10 devices per admin, the address is checked when a device is added and again when sending. `notifyAdmins` now also calls `sendPushNotifications` for push kinds, whether or not email is configured, in parallel with the email and never blocking it. One push per person per kind a minute (the shared rate limiter), a `Topic` header so a newer push of a kind replaces an older one the push service still holds, TTL one hour, 8-second timeout. A 404 or 410 answer deletes the device; other failures log only a status. Nothing is sent until all three `VAPID_*` variables are set and valid.
- **Routes** (`/api/admin/push`, any active admin, own devices only): `GET` (set up or not, the public key, the kinds, your devices without address or keys), `POST` (add this browser; forged addresses 400, rate-limited 20 an hour), `PATCH` (change the kinds on your own device; another person's id is a 404), `DELETE` (by id, or by the browser's own address so it can switch itself off).
- **Rules:** `pushSubscriptions` is closed to every browser, an admin's own device included (rules test added). The address and keys are the secret.
- **Service worker** (`public/sw.js`): a `push` handler that shows the fixed title and line with a tag (`renotify`, so one alert per kind a minute), falls back to a plain "GHMO" notification when the push can't be read, and takes only a path starting with a single `/` as the page to open; a `notificationclick` handler that focuses a window of the site and navigates it, or opens a new one, and can never open another origin. Caching rules unchanged (`VERSION` stays `v2`). Six unit tests run the real file in a fake worker scope.
- **Security page:** a **Push notifications on this device** card: turn on (the tap asks for permission, subscribes with the site's public key and registers the device; a refusal by the site removes the browser's subscription again), turn off, your devices with their kinds, last alert and Turn off, the iPhone Home Screen note, and clear messages for "not set up on this site" and "blocked in the browser".
- **Tests:** a browser spec `tests/e2e-auth/push-notifications.spec.ts` with a local HTTPS stub standing in for a push service (a throwaway certificate; the server calls it only in the emulator build, flag `PUSH_TEST_ALLOW_INSECURE`, ignored on a production deployment). It checks that the VAPID token verifies against the site's public key with the right audience and subject, that the body is `aes128gcm` and opens only with the device's own key (RFC 8291 decrypted in the test) into exactly the fixed words, that the sender, a device with the kind off and a disabled admin get nothing, that a second message inside the minute pushes nothing, that a 410 deletes the device, that forged and private addresses are refused, and that no response contains an address or key. The route sweep covers the new routes.
- **Left for 14-B:** pushes for minutes, calls, security and broadcast approval, each with its own switch (the kinds list is the one place to extend), and 14-C docs (admin guide with iPhone steps, runbook case). The Security card shows when a device last worked; automatic clean-up of devices that never answer is not built.

### 18.7 14-B built (2026-11-06)

- **Every alert can push.** `PUSH_KINDS` is now `chat`, `thread`, `minutes_submitted`, `broadcast_review`, `calls`, `security`, each with its own switch on every device (Security → Push notifications on this device → your devices). The words and the page come from the same table as the email (`notificationCopy`), so the push and the email never disagree, and each kind has its own tag so one kind never replaces another in the tray.
- **New alert: a broadcast waiting for approval.** Submitting a broadcast now tells the other admins (not the submitter), by email and push, "A broadcast is waiting for approval", linking to `/admin/broadcasts`. It carries no subject or text. The plan said this alert already existed as an email; it did not, so it is new in both channels. Email follows the existing one-switch opt-in and the 30-minute limit.
- **Defaults.** A device switched on from now on starts with every kind on; a device switched on in 14-A keeps its own list (chat and Plans & Issues), so a new kind is off for it until its owner ticks it. The routes drop any kind that can't push.
- **Tests.** Unit: every kind has fixed words, a path on this site and its own tag; the kind list is cleaned in order. Browser: a submitted broadcast pushes one signed, encrypted alert to the device with the kind on, none to a device with it off and none to the submitter, and the body holds no subject or text.
- **Not covered by a browser test:** the minutes, calls and security pushes reach the sender through the same function as chat (one tested path), so only their words and paths are unit tested.

## 19. Member list export (2026-11-06)

**Goal.** An admin can download the member list as a spreadsheet (CSV), for example to share with the board or to keep a backup.

| ID | Question | Decision | Effect |
|---|---|---|---|
| D37 | What is in the file? | The plain facts on the list: name, email, status, member since, city and state, groups, officer positions, and whether they can be emailed or called. Optionally, phone number, alternate number, language and household. Never notes, family members, call history or ratings. | The file holds nothing that is encrypted unless the exporter asks for numbers. |
| D38 | How do phone numbers get in? | Only when the exporter ticks "Include phone numbers" and this device is unlocked: the browser writes the numbers it has already decrypted. The server never sees the file or a number. With the device locked the option is off and says why. | Export does not widen who can read numbers, only where a reader can put them. |
| D39 | Who may export, and is it recorded? | Any active admin (every admin can already see the list). The page records the download first (`members_exported`: count, "everyone" or "shown", with numbers or not; never a name, email or number) and downloads only if that worked. 20 downloads an hour per admin. | No export goes unrecorded. A super admin who wants to limit numbers to themselves can ask; it is one check in the route and dialog. |
| D40 | Which rows? | Everyone, or only what the search and filters show. | A filtered list (for example one group) exports as it looks. |

Built: `src/lib/memberExport.ts` (pure; formulas such as `=HYPERLINK(...)` are made plain text, phone numbers made only of digits and punctuation are left alone; a byte order mark so Excel reads Nepali names; the first columns are the import's `Name`, `Email`, `Phone`, so the file can be imported again), `POST /api/admin/member-export` (audit only), the **Export list** button and dialog on Admin → Members, 12 unit tests and a browser spec (formula guard, with and without numbers, only what is shown, the three log entries hold no name or number).

### 18.8 14-C built (2026-11-06)

- **Admin guide** (`docs/BROADCASTS_GUIDE.md` §1j): what a push says and never says, turning it on per device, the Android and computer steps, the iPhone and iPad Home Screen steps (iOS 16.4 or later; opened from the Home Screen icon, not Safari), the per-alert switches, the one-a-minute limit, turning a device off, and a short "if it does not work" list.
- **Go-live checklist:** the keys line from 14-A already covers the three `VAPID_*` variables, the Firestore rules, per-device turn-on and a two-admin test; it now points at the per-alert switches and the broadcast test.
- **Runbook case Q:** a push to the wrong person (disable the admin; a disabled admin gets nothing), too many alerts (untick kinds), a lost or sold phone (turn the device off from another device; an admin cannot see anyone else's devices, so ask the owner or disable the account), content that should not be there (a bug), stopping all pushes at once (remove a `VAPID_*` variable and redeploy; email is unaffected), a leaked key (new pair, every device switched on again), and a device that never receives anything. Case L (a caller's lost device) now points to it.
- **Known gaps, not built:** devices that never answer are not cleaned up automatically, only ones a push service reports as gone. (Two gaps listed here first, a super admin not being able to list or remove another admin's push devices and no site-wide switch, were closed by Phase 16, §21.) It is small if the board wants it.

## 20. Phase 15 — Delete a member (planned 2026-11-06; 15-A to 15-C built 2026-11-06)

**Goal.** Today the app can only **disable** a member. A person who asks to be removed, or a record added by mistake, needs a manual step in the Firebase console (runbook case O step 6), which is easy to get wrong and is not in the activity log. Phase 15 lets a **super admin** remove a member and what is held about them from inside the app, with a preview, a typed confirmation and a record.

### 20.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| A member is one document, with a `notes` subcollection, and group membership is an array on it. | `members/{id}`, `members/{id}/notes/*` | Deleting the document alone would leave the notes behind: both go. |
| Other collections point at a member by id: the calling-tree assignment (`callingTree/current/assignments/{memberId}`), call rows (`callCampaigns/{id}/calls/{memberId}` with attempts, encrypted notes and ratings), broadcast delivery rows (`broadcasts/{id}/deliveries/{memberId}`), task reminder records (`eventTaskReminders/{eventId}~{memberId}`, `digest~{memberId}`), task assignee lists (`eventTasks.memberIds[]`), group leads (`groups.leadMemberId`) and officer terms (`positionTerms.memberId`). | `*.server.ts` | Each is cleaned up, except officer terms (D43). |
| A member's email opt-out, bounce and complaint live on the member document. | `memberSuppression.server.ts` | Deleting that document would silently erase the opt-out, and re-adding the address would make them emailable again. A small record is kept (D44). |
| The broadcast sender already skips a recipient whose member document is gone. | `broadcastSender.server.ts` | A broadcast in the middle of sending is safe. |
| The activity log is append-only and its entries are written by the server. | rules, `audit.ts` | It is not edited (D43), and the deletion itself is recorded. |

### 20.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D41 | Who, and how? | A super admin only, one member at a time. The dialog first shows what will be removed and kept (with counts), and the person types the member's name (or their email, when there is no name) to confirm. 20 deletions an hour. | No bulk delete and no accidental click. |
| D42 | What is removed? | The member record (name, email, status, consent history, member since, city and state, the encrypted contact with phone numbers and family), all their notes, their calling-tree assignment, their call rows in every campaign (attempts, notes and ratings), their broadcast delivery rows, their reminder records, and their id from task assignee lists, group leads and group membership. | Nothing about the person is left that points to them by id except the items in D43. |
| D43 | What is kept? | (a) Officer terms stay as history; they show "Removed member" instead of a name. (b) The activity log is never rewritten, so older entries may still name them; the deletion is added as a new entry that records the member's id and counts, not their name or email. (c) Minutes attendance lists and Plans & Issues text are free text and are not touched. (d) Earlier exports and backups. | The runbook says so plainly, so a board does not promise more than the app does. |
| D44 | What if they had opted out of email, or the address bounced or complained? | A "do not email" record is kept: a one-way hash of the address (never the address), the reason and the date. Adding or importing that address again creates the member already opted out, until an admin records new consent. | Deleting cannot be used to get around an unsubscribe. |
| D45 | How is a half-finished deletion handled? | The member document is deleted last. Every earlier step is safe to repeat, so a failure part way can be retried and finishes the job. | No half-deleted member who looks whole. |
| D46 | Delete or disable? | Disable stays the normal way to stop contact. Delete is for a removal request or a record made by mistake. The dialog says so. | Fewer irreversible actions. |

### 20.3 Design

- **Pure rules** (`src/lib/memberDeletion.ts`): whether the typed text confirms (case and spacing ignored), the plain-words list of what is removed and kept from the counts, whether a "do not email" record is needed, and the hash id for it.
- **Server** (`memberDeletion.server.ts`): `previewMemberDeletion` counts what points at the member; `deleteMember` runs the steps in order, with the member document last, and writes one audit entry (`member_deleted`: id and counts, never a name, email or number).
- **Routes:** `GET /api/organizations/ghmo/members/[memberId]/deletion` (the preview) and `DELETE /api/organizations/ghmo/members/[memberId]` with `{ confirm }`, both super admin only.
- **Do-not-email records:** `organizations/ghmo/emailSuppressions/{hash}`, server-only (closed to every browser). The member add route and the import check it.
- **Officer terms** show "Removed member" when the member id no longer resolves (15-B).
- **UI (15-B):** a **Delete member** action on the profile page (super admin only), a dialog with the preview and the typed confirmation, and the list updating afterwards.

### 20.4 Sub-phases

| Step | Scope | Exit criteria |
|---|---|---|
| **15-A** | Pure rules, deletion and preview on the server, the two routes, the do-not-email record and its check on add and import, rules for the new collection | Deleting a member removes the record, notes, assignment, call rows, delivery rows, reminder records and assignee ids; a plain admin and a stranger are refused; a wrong confirmation does nothing; an opted-out member's address stays suppressed when re-added; the activity log holds no name |
| **15-B** | Delete member on the profile, the dialog, "Removed member" in officer history | A super admin deletes from the page; a plain admin never sees the button |
| **15-C** | Docs: runbook case O (step 6 now uses the app), admin guide, go-live checklist | Docs merged |

### 20.5 Risks and out of scope

| Risk | Mitigation |
|---|---|
| Deleting the wrong person | Preview, typed name, super admin only, one at a time, recorded |
| A deletion stops part way | Member document last; every step repeatable |
| Re-adding an address that opted out | The do-not-email record (D44) |
| Older log entries still name the person | Stated in D43 and in the runbook; the log is the security record and is not edited |

Out of scope: bulk deletion, undoing a deletion, deleting an admin account (separate; see runbook case C), scrubbing old log entries, and removing names from minutes.

### 20.6 15-A built (2026-11-06)

- **Pure rules** (`src/lib/memberDeletion.ts`, 8 unit tests): the typed confirmation (the member's name, or their email when there is no name; case and spacing ignored; nothing else), the plain-words removed and kept lists from the counts, whether a do-not-email record is needed, and how a re-added address starts out.
- **Server** (`memberDeletion.server.ts`): `previewMemberDeletion` and `deleteMember`. Order: the do-not-email record, then notes, calling-tree assignment, call rows in every campaign, broadcast delivery rows, reminder records, the id from task assignee lists and from group leads, then (after the activity entry) the member document last. Every step can be repeated. Officer terms are not touched.
- **Do-not-email record:** `emailSuppressions/{hmac}` holds `reason` and `at` (the time they opted out; the deletion time for a bounce). The id is a keyed hash (HMAC-SHA256 with the server key, looked up under every current and previous key), so the collection holds no address. The member add route and the import route look addresses up and start a matching member opted out (or bounced) until an admin records consent again.
- **Routes:** `GET .../members/[memberId]/deletion` (preview with counts and the text to type) and `DELETE .../members/[memberId]` with `{ confirm }`, super admin only, 20 an hour. The activity entry `member_deleted` holds the member id and counts, never a name, email or number.
- **Rules:** `emailSuppressions` is closed to every browser (rules test added).
- **Tests:** a browser spec against the routes: a plain admin is refused and nothing changes; the preview matches what is seeded; a wrong, empty or missing confirmation does nothing; the right name (case and spacing ignored) removes the record, notes, assignment, call row, delivery row, reminders, assignee id and group lead while other people's rows, and the officer term, stay; the do-not-email record holds a 64-character hash with no name in it; the activity entry holds no name or email; deleting again is a 404; adding or importing the address again starts it opted out or bounced, and an unrelated address is normal.
- **Left for 15-B and 15-C:** the **Delete member** button and dialog on the profile, "Removed member" in officer history, and the docs.

### 20.7 15-B built (2026-11-06)

- **Delete member on the profile** (`/admin/members/[memberId]`): a card at the bottom, shown only to a super admin (a plain admin never sees it, and the server refuses them anyway). It sits outside the encryption gate, because the server removes the encrypted records without opening them, so a locked device can still delete.
- **The dialog** (`DeleteMemberDialog`): asks the server for the preview, then lists what will be removed (with counts) and what will be kept, in plain words, and asks for the member's name to be typed. The red **Delete member** button stays disabled until the typed text matches (case and spacing ignored; the server checks it again). On success the page returns to the Members list with a "Member deleted" message; a failure shows the server's message and changes nothing.
- **Officer history:** a term whose member is gone shows "Removed member" (the Positions page already did this for a missing id; it now uses the one shared label, `REMOVED_MEMBER_LABEL`).
- **Tests:** `member-delete-ui.spec.ts` (2): a plain admin sees no card; a super admin sees the preview ("2 notes", the officer-term and activity-log lines), cannot delete with a wrong or partial name, deletes with the right one, lands on the list without the person, the notes are gone, one `member_deleted` entry exists, Positions shows the term as "Removed member", and the profile no longer opens.
- **Left for 15-C:** runbook case O (step 6 now uses the app), the admin guide and the go-live checklist.

### 20.8 15-C built (2026-11-06)

- **Runbook case O** now uses the app: step 4 is the **Delete member…** button (the partial clean-up steps are kept for someone who wants only part of it gone), step 5 lists what stays and why (officer terms, the activity log, free-text names, backups and exports, and the do-not-email record, which the member should be told protects them), step 6 replaces the console deletion with "run it again, and do not delete in the console, because that leaves the notes behind", and step 7 notes the app now writes the log entry.
- **Admin guide §1h:** the table says who can remove what now that a super admin can delete a member, and a new "Deleting a member" list explains the dialog, what stays, the do-not-email record and retrying.
- **Go-live checklist:** a Phase 15 line: publish the rules, try a delete on a test member, check Positions shows "Removed member" and the log has one entry without a name, test that an opted-out address stays opted out when re-added, and check a plain admin sees no card.
- **Known gaps, not built:** no bulk delete, no undo, no way to scrub older activity-log entries or minutes text, and a group whose lead was deleted is left without a lead (choose another on Admin → Groups). Each is small if the board wants it.

## 21. Phase 16 — Admin devices and push controls (planned 2026-11-06; 16-A to 16-C built 2026-11-06)

**Goal.** Phase 14 let each admin switch push on for their own devices, and §18.8 listed what it left out: a super admin cannot see or remove another admin's push devices (so a lost phone keeps getting alerts, and would start again if its admin were turned back on), and there is no site-wide switch other than removing a key in Vercel and redeploying. Phase 16 closes both, inside the app.

### 21.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| A person sees only their own devices, without the address or keys; the records are closed to every browser. | `push.server.ts`, rules | The new super-admin views go through new routes and show the same fields, never the address or keys. |
| A disabled admin gets no push, but their device records stay and would work again if the admin were re-enabled. | `pickPushTargets` | A super admin needs to be able to clear a lost device before re-enabling its owner (D50). |
| Turning an admin on or off is only a Firestore console step; there is no admin management page. | runbook case B | Phase 16 does not add one. Devices of a turned-off admin are shown as such, so the super admin can remove them. |
| The only way to stop all pushes today is to remove a `VAPID_*` variable in Vercel and redeploy. | runbook case Q step 5 | A switch in the app is faster and does not need a deploy (D49). |

### 21.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D47 | Who sees which devices? | A super admin sees every admin's push devices: the admin's name and whether their account is on, the device name ("Chrome on Android"), which alerts are on, when it was added and when an alert last went to it. Never the address or keys. Plain admins keep seeing only their own. | A lost phone can be found by name and owner. |
| D48 | Who may turn a device off? | A super admin may turn off any device. It is recorded in the activity log (the device id, whose it was and the device name; never the address). The owner can switch it on again from that device. | Fast response to a lost phone. |
| D49 | A site-wide switch? | A super admin can switch push off for the whole site and back on. Off stops every push at once; email, devices and settings are untouched, so switching on again resumes without anyone repeating set-up. Every admin sees the state on the Security page. Recorded in the activity log. Default on (when the keys are set). | No deploy needed in an incident; removing a key stays as the harder stop. |
| D50 | Clean up devices of turned-off admins? | Not automatically. They are listed with "Account turned off" so a super admin can remove them, and runbook case Q says to clear a lost device before re-enabling its owner. | No surprise deletion; the choice stays with a person. |

### 21.3 Design

- **Pure rules** (`src/lib/pushAdmin.ts`): builds the super-admin list from the devices and the admin accounts (name, on or off, sorted by name then date), with no address or key fields at all.
- **Settings:** `organizations/ghmo/pushSettings/settings`: `enabled` (missing means on), `updatedAt`, `updatedBy`. Admins may read it, nobody writes it from a browser.
- **Sending:** `sendPushNotifications` does nothing while the switch is off (checked at send time, so it takes effect at once).
- **Routes:** `GET /api/admin/push-devices` and `DELETE /api/admin/push-devices/[deviceId]` (super admin); `GET /api/admin/push-settings` (any admin) and `PUT` (super admin, `{ enabled }`); the existing `GET /api/admin/push` also says whether the site switch is on.
- **UI (16-B):** on the Security page, a super-admin card "Push for the whole site" with the switch, and a card listing everyone's devices with Turn off; every admin's own card says when push is switched off for the site.
- **Docs (16-C):** runbook case Q (use the switch and the list), admin guide, go-live checklist.

### 21.4 Sub-phases

| Step | Scope | Exit criteria |
|---|---|---|
| **16-A** | Pure list builder, settings storage, send-time check, the four routes, rules for the settings, audit labels | A super admin lists and removes any device; a plain admin is refused; the list has no address or key; switching off stops pushes at once and on resumes them; both actions are logged without an address |
| **16-B** | The two cards on the Security page and the notice on each admin's own card | A super admin uses them; a plain admin sees neither card, only the notice |
| **16-C** | Docs | Docs merged |

### 21.5 Risks and out of scope

| Risk | Mitigation |
|---|---|
| The list leaks addresses or keys | The list builder has no such fields, and a test checks the response for them |
| A super admin switches push off and forgets | The Security page shows the state to everyone, with who changed it and when |
| A removed device comes back | It only comes back if its owner switches it on again from that device |

Out of scope: admin management (turning admins on and off in the app), automatic cleanup of devices that never answer, and per-admin push switches set by someone else.

### 21.6 16-A built (2026-11-06)

- **Pure rules** (`src/lib/pushAdmin.ts`, 5 unit tests): the super-admin device list is built from names, status, labels, alerts and times only, so it has no field that could hold an address or key, even if the stored record carried one; devices of a turned-off or missing admin are listed and marked; the site switch is on unless a super admin switched it off.
- **Server** (`push.server.ts`): `readPushSettings` and `setPushEnabled` (`organizations/ghmo/pushSettings/settings`), `listAllDevices`, `removeAnyDevice`, and `sendPushNotifications` now checks the switch at send time, so switching off takes effect at once. Email is unaffected.
- **Routes:** `GET /api/admin/push-devices` and `DELETE /api/admin/push-devices/[deviceId]` (super admin; the removal is logged as `push_device_removed` with the device id, its owner and its name, never its address); `GET /api/admin/push-settings` (any admin: on or off, who changed it when, and whether the keys are set) and `PUT` (super admin, `{ enabled }`, logged as `push_switched` with the before and after); `GET /api/admin/push` also returns `siteEnabled`.
- **Rules:** `pushSettings` is readable by an active admin and written by nobody from a browser (rules tests added).
- **Browser tests** (3, in `push-notifications.spec.ts`): a plain admin is refused the list, the removal and the switch and can only read the state; a super admin lists everyone's devices (including a turned-off admin's, marked), sees no address or key in the response, turns one off, and the log entry holds no device address; switching off sends no push and leaves the device untouched, switching on resumes it with no repeated set-up, and both changes are logged with their before and after.
- **Left for 16-B and 16-C:** the two cards on the Security page and the notice on each admin's own card, and the docs.

### 21.7 16-B built (2026-11-06)

- **Two super-admin cards on Admin → Security** (`PushAdminPanel`, shown only to a super admin; the server refuses everyone else anyway):
  - **Push for the whole site:** the state (On or Off), the switch, and "Last changed by <name> on <date>". Switching off asks first ("Switch push off for everyone?", with a note that email is not affected and nobody has to set anything up again); switching on is one press. It says when the push keys are not set, since nothing is sent either way.
  - **Everyone's push devices:** each device with the admin's name, "Account turned off" when their account is off, the device name, the alerts that are on (in the notification's own words), when it was added and last used, and a **Turn off** that asks first. Never an address or keys.
- **Notice on every admin's own card:** when a super admin has switched push off for the site, the "Push notifications on this device" card says so ("none are being sent right now; your devices stay as they are and start again when it is switched back on").
- **Server:** `GET /api/admin/push-settings` also returns the name of whoever last changed the switch. The alert wording used in lists now comes from one helper (`pushKindLabel`), shared with the existing device card.
- **Tests:** `push-admin-ui.spec.ts` (2): a plain admin sees no super-admin card and sees the notice when push is off; a super admin switches push off (with the confirmation) and on, sees "Last changed by Alice", sees both devices (the turned-off admin's marked) with no address anywhere on the page, and turns one off with the confirmation, which is logged.
- **Left for 16-C:** the docs: runbook case Q now uses the switch and the list instead of removing a key, the admin guide, and the go-live checklist.

### 21.8 16-C built (2026-11-06)

- **Runbook case Q:** step 2 and step 5 now use the site-wide switch (Admin → Security → Push for the whole site) as the quick stop, with removing a `VAPID_*` key and redeploying kept as the harder stop; step 3 (a lost, sold or stolen phone) gains the super-admin route (Everyone's push devices, find it by owner and device name, Turn off) and the reminder to do this before turning a disabled admin back on, because their old devices are kept.
- **Admin guide §1j:** a "For super admins" part describing the two cards, what they show and never show, and that both actions are logged; the "Turn it off" paragraph now points a person who cannot sign in anywhere to it.
- **Go-live checklist:** the push line now includes the super-admin check: switch push off and see nothing arrive and the notice appear, switch it on and see the next alert, check the device list shows no addresses and Turn off works, and publish the Firestore rules again first (the switch is a new settings document).
- **Known gaps, not built:** devices that never answer are only removed when a push service reports them gone; admin management (turning an admin on or off) was a Firestore console step until Phase 17 (§22) added the Admins page.

## 22. Phase 17 — Admin management (planned 2026-11-06; 17-A to 17-C built 2026-11-06)

**Goal.** Who is an admin is a Firestore document (`organizations/ghmo/admins/{id}`), and today the only way to add one, turn one off or on, or change a role is to edit it by hand in the Firebase console (runbook cases B and C). That is slow in an incident (a stolen session, an admin who left) and easy to get wrong. Phase 17 lets a super admin do it in the app, with guards that make the worst mistakes impossible and a record of every change.

### 22.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| An admin is one document, matched at sign-in by `emailLower`; the sign-in link is sent only when the address belongs to an **active** admin, and verifying it binds the account to that document. | `auth/email/start`, `auth/email/verify` | Adding an admin is creating that document. The new admin opens the normal sign-in page, enters their email and sets up their authenticator; no new sign-in machinery. |
| Access is checked against the document on every request and in the database rules. | `requireActiveAdmin`, `hasActiveAdminRecord` | Turning an admin off ends their access within about a minute with no extra work. |
| Roles are `super_admin` or `admin`. Only a super admin can do the sensitive things (positions, deleting members, the push controls). | `admin.ts` | Role changes are super-admin only, and the last active super admin must always remain. |
| A turned-off admin keeps their push devices and their encrypted-data devices. | Phase 16, runbook case C | Turning off offers to turn off their push devices too, and reminds the super admin to revoke their encryption devices (which needs an unlocked device, so it stays a separate step). |

### 22.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D51 | Who may manage admins? | Super admins only. | Same rule as the other sensitive controls. |
| D52 | What does "add an admin" do? | Creates an active admin record from a name, an email and a role (Admin or Super admin). Nothing is emailed by the app: the person opens the sign-in page, enters that email, and follows the normal steps. An address already on the admin list (turned off or not) is refused with a pointer to turn the existing one on. | Fewer moving parts; a typo is fixed by turning the wrong record off and adding the right one. |
| D53 | Turning off and on | A super admin can turn any other admin off or back on. They can never turn **themselves** off, and the last **active** super admin can never be turned off. Turning off can also turn off that admin's push devices (ticked by default). The result tells the super admin to revoke their encryption devices under Admin → Encryption if the admin held any. | Prevents lock-out and covers the lost-phone case. |
| D54 | Roles | A super admin can make another admin a super admin or an ordinary admin. They cannot change **their own** role, and the last active super admin cannot be made an ordinary admin. | A site always has at least one super admin who can fix things. |
| D55 | Names and emails | A super admin can fix a name. An email cannot be changed: a mistyped address would lock the person out, or let the wrong person in. Add the right one and turn the wrong one off. | No account-takeover by editing an email. |
| D56 | Deleting an admin | Not offered. Turning off is enough, and it keeps their name on the history (the activity log refers to admins by id). | The audit trail stays readable. |

### 22.3 Design

- **Pure rules** (`src/lib/adminManagement.ts`): the checks above as functions of the full admin list: add (name, email shape, role, no duplicate address), turn off or on (not yourself, not the last active super admin), role change (not yourself, not the last active super admin), and a clean view of an admin (no secrets; only what the admin list already shows).
- **Server** (`adminManagement.server.ts`): each change runs in a transaction over the whole admin list (a handful of documents), so two super admins acting at once cannot both remove the last one.
- **Routes** (super admin only): `GET /api/admin/admins`, `POST /api/admin/admins`, `PATCH /api/admin/admins/[adminId]` with `{ status }` (and `removePushDevices` when turning off), `{ role }` or `{ name }`.
- **Activity log:** `admin_added`, `admin_turned_off`, `admin_turned_on`, `admin_role_changed`, `admin_renamed`: the admin's id, name and the change, never an email.
- **UI (17-B):** an **Admins** page for super admins (nav link), listing everyone with role, state, last sign-in, and the actions above with confirmations.
- **Docs (17-C):** runbook cases B and C and the guide use the page; the console steps become the fallback.

### 22.4 Sub-phases

| Step | Scope | Exit criteria |
|---|---|---|
| **17-A** | Pure rules, server transactions, the routes, audit labels | A super admin adds, turns off and on, changes roles and renames; a plain admin is refused; you cannot turn off or demote yourself or the last super admin (also under two requests at once); turning off can clear push devices; a new admin can start sign-in; every change is logged |
| **17-B** | The Admins page and nav link | A super admin uses it; a plain admin sees no link and the page refuses them |
| **17-C** | Docs | Docs merged |

### 22.5 Risks and out of scope

| Risk | Mitigation |
|---|---|
| Nobody can manage admins any more | The last active super admin can never be turned off or demoted, checked inside a transaction |
| A new admin is added with a mistyped email | The wrong person cannot sign in unless it is a real address they control; the mistake is turned off, and the log shows who added it |
| A turned-off admin's devices still hold old data | Stated in the result and the runbook; revoking them is a separate, deliberate step |

Out of scope: emailing an invitation, changing an email address, deleting an admin, per-admin permissions beyond the two roles, and the first admin (still created by the one-time bootstrap).

### 22.6 17-A built (2026-11-06)

- **Pure rules** (`src/lib/adminManagement.ts`, 15 unit tests): add (a name, a valid address, a role, no address already on the list, with a different message for a turned-off one), turn off or on (not yourself, not the last **active** super admin; a turned-off super admin does not count as another; the state they are already in is accepted as a no-op), role change (not your own, the last active super admin stays), and the admin view (no secrets; super admins first; you marked).
- **Server** (`adminManagement.server.ts`): each change reads the whole admin list inside a transaction, so two super admins acting at once cannot both remove the last one. `removeDevicesOfAdmin` (in `push.server.ts`) turns off one admin's push devices.
- **Routes** (super admin only): `GET /api/admin/admins`, `POST /api/admin/admins` (`{ name, email, role }`; nothing is emailed, 20 an hour), `PATCH /api/admin/admins/[adminId]` with one of `{ status, removePushDevices? }`, `{ role }` or `{ name }` (an email cannot be sent: the body is strict). Turning off answers with `pushDevicesRemoved` and `encryptionReminder: true`, so the page can tell the super admin to revoke the admin's encryption devices.
- **Activity log:** `admin_added`, `admin_turned_off`, `admin_turned_on`, `admin_role_changed`, `admin_renamed`: the admin's id, name and the change, never an email; a change that changes nothing logs nothing.
- **Browser tests** (3): a plain admin is refused every route; a super admin lists (super admins first, you marked), adds (the record is active and findable by the sign-in lookup; a duplicate, bad address, empty name, unknown role and extra field are refused), renames, turns bob off (his access ends at once, only his push devices go, a repeat does nothing), turns him on, re-roles, is refused for turning themselves off or changing their own role, and the log has every change with no email; two super admins turning each other off at the same moment leave exactly one active.
- **Left for 17-B and 17-C:** the Admins page and nav link, and the docs (runbook cases B and C, the guide, the go-live checklist).

### 22.7 17-B built (2026-11-06)

- **Admins page** (`/admin/admins`, `AdminsClient`): the list (super admins first, "You" marked, role, Active or Turned off, email and last sign-in) with **Fix name**, **Make super admin** or **Make admin**, and **Turn off…** or **Turn on** on every row but your own (your row has no turn-off or role button: the server would refuse them, so they are not offered). An **Add an admin** form (name, email, role) says nothing is emailed and, after adding, tells the super admin what to say to the new admin ("ask them to open the admin sign-in page and enter <email>"). The server's message is shown for anything it refuses (for example an address already on the list).
- **Confirmations:** turning off says what happens (they can't sign in, any session ends within about a minute, nothing they wrote is removed, they can be turned back on) and has "Also turn off their push notification devices" ticked by default. Making someone a super admin lists the extra powers. After turning off, a notice says access ends within about a minute, how many push devices were turned off, and links to Admin → Encryption to revoke their encryption devices (a separate step: it needs the super admin's unlocked device).
- **Nav:** an **Admins** link in the Account group and in the jump dialog (Ctrl or ⌘ K), shown only to a super admin (`superAdminOnly` in `adminNav.ts`, `navFor`). A plain admin who types the address gets the not-found screen, and the routes refuse them anyway.
- **Tests:** `admin-management-ui.spec.ts` (2): a plain admin has no link and gets not-found, no heading and no Add button; a super admin opens the page from the nav, sees themselves marked with no turn-off or role button, adds an admin (with the address repeated, the server's message shown), turns Bob off with the push-device box ticked (the notice and Encryption link appear, the row says Turned off, his push device is gone), turns him on, makes him a super admin, fixes his name, and the log has every change.
- **Left for 17-C:** the docs: runbook cases B and C and the guide use the page instead of the console, and the go-live checklist.

### 22.8 17-C built (2026-11-06)

- **Runbook case B** (a stolen session): step 2 now turns the admin off on **Admin → Admins**, with push devices, and keeps the Firestore console edit only as the fallback when the app is unavailable. **Case C** (an admin left): step 1 uses the page and warns to keep another active super admin; step 2 notes the page's reminder and link to revoke their encryption devices. Cases P and Q point to the page instead of the console.
- **Admin guide §1k "Who can sign in":** the list, adding (nothing is emailed; what to tell the new admin), turning off and on (with push devices and the encryption reminder), roles and what a super admin can do, fixing a name (and why an email can't be changed), what the page refuses, and that every change is logged without an email.
- **Go-live checklist:** a Phase 17 line: check the list, turn off anyone who should not have access, keep at least two active super admins, and try add, sign-in and turn-off once with a test account.
- **Known gaps, not built:** no invitation email, no email change, no admin deletion (by design, D52, D55, D56); the first admin is still created by the one-time bootstrap.

## 23. Project-wide audit (2026-11-06)

Four read-only reviews ran in parallel (docs against code; API routes, rules and audit log; admin UI; test coverage). Every finding below was checked in the code before it was fixed or listed.

### 23.1 Fixed

- **A real bug:** the calendar feed (`src/lib/ics.ts`) did not escape semicolons in titles, summaries and places (`"\;"` in JavaScript is just `";"`), so a semicolon reached calendar apps unescaped (RFC 5545 needs `\;`). The old test made the same mistake and passed; both are fixed.
- **Wrong button names:** the Admins page, runbook cases A and D, admin guide §1a and the key-rotation drill named "Revoke selected and rotate keys" and "Rotate keys now"; the buttons say "Remove selected and make new keys" and "Make new keys now".
- **Activity log:** eight actions the code writes had no words on the dashboard (`broadcast_sent`, `broadcast_retry_failed`, `comms_seed_created`, `edit_timeline`, `timeline_update`, and, as whole sentences with no actor, `member_email_opt_out`, `member_email_bounced`, `task_digest_run`). A new unit test (`tests/unit/auditLabels.test.ts`) finds every action the code logs and fails if one has no words, so this cannot drift again.
- **Member emails in the log:** member entries (added, changed) now record whether there is an email, not the address (`memberAuditView`), so an address no longer outlives a deleted member in new entries. The name stays. Older entries are not rewritten, because the log is never edited (§20, D43).
- **Request bodies:** the bootstrap, session and unsubscribe routes now read their bodies through the shared size-capped parser, like every other route. The browser-written activity route (`POST /api/admin/audit`) has a per-admin ceiling (600 an hour).
- **UI:** removing someone from a group, the two "forget this device" encryption buttons and "Finalize close" on a topic now ask first; screens that showed a load error with no way out (Group, Groups, Positions, Templates, the profile's Notes and Calls) have **Try again**; the daily-digest card shows its error instead of vanishing; Action items shows a loading state instead of "No action items yet"; the minutes editor says when earlier versions could not be loaded; loading skeletons are announced to screen readers.
- **Tests added:** 82 unit tests for helpers that had none (public event fields, calendar export, actor names, Plans & Issues decryption, app URL, passkey ids, authenticator errors, emulator detection), the label test, a member-audit test, 10 rules tests (home blocks, docgen, legacy timeline, comment likes, and every server-only collection the default deny covers), and a browser spec for creating an event from the New event page and opening the admin Document gallery and Gumba Project pages.
- **Docs:** README routes, pages, data model, legacy paths and sign-in description; `.env.example` (`CRON_SECRET`, the media keys, `APP_PUBLIC_URL`; a dead variable removed); the plan's roadmap (status for phases 0–7, a Phase 10 row, headings that still said "planned"); runbook and guide cross-references (cases B, C, N–Q); the go-live checklist line that still said a member could not be deleted in the app.

### 23.2 For the owner to decide (not changed)

1. **Decisions D32–D36, D41–D46, D47–D50 and D51–D56:** accepted by the owner on 2026-11-06, as built.
2. **Code with no caller:** *done 2026-11-06, see §23.3.* Was: the three timeline routes and their rules block, `POST /api/admin/comms/seed`, `POST /api/admin/content` (writes home blocks, which the rules make world-readable, with little validation; no page shows them), the `gumba` rules block (no code uses it), the `docgen` rules block (admins may write from the browser), two unused path helpers, unused entries in the `AuditType` list and three unused `NEXT_PUBLIC_*` flags in `env.client.ts`. Removing them is small; it needs the rules published again.
3. **Older activity entries** still hold member and admin emails, and the dashboard returns full entries (with IP addresses) and raw GoFundMe webhook payloads to admins. Admin-only, but worth knowing.
4. **Wording:** *done 2026-11-06, see §23.3.* Was: members use Disable/Enable, admins use Turn off/Turn on, groups say Switched off; records are "deleted" in some places and "removed" in others. Harmless; can be made consistent in one pass if wanted.
5. **Not covered by a browser test:** the GoFundMe webhook (signature-checked; covered by unit tests of its parts) and a few routes that are only driven through other pages.

### 23.3 Follow-up (2026-11-06): dead code removed, wording made consistent

**Dead code removed** (the owner chose §23.2 items 2 and 4):
- **Routes with no caller:** `app/api/admin/timeline`, `app/api/admin/organizations/[orgSlug]/timeline/[entryId]`, `app/api/organizations/[orgSlug]/gumba/timeline`, `POST /api/admin/comms/seed`, `GET/POST /api/admin/content` (the home-blocks route, whose data the rules made world-readable with no page showing it), and `src/lib/adminCommunity.ts`, which only that route used.
- **Firestore rules:** the `home/blocks`, `gumba`, `docgen` and `timeline` blocks and the `isMember()` function, which only the gumba block used. Those paths now fall to the default deny; the server's admin SDK, which is not subject to rules, still reads `docgen` for the document templates. Rules tests check that all four are closed to browsers. **The rules must be published again.**
- **Small leftovers:** the unused `docgen/templates`, `docgen/generations`, `timeline` and `home/blocks` path helpers, the legacy `AuditType` entries nothing writes any more (only `webhook_received` remains), and three `NEXT_PUBLIC_*` flags in `env.client.ts` that nothing read.
- The dashboard keeps its words for the removed actions, so older activity entries still read correctly.

## 24. Enhancement audit (2026-11-06)

The owner reported that adding board members and other officers "is not enabled", accepted D32–D56, and asked for a full-site look for enhancement gaps. Three read-only reviews (public site, admin workflows, operations) were run; the clear, low-risk items were fixed and the rest are listed in §24.3.

### 24.1 Officer positions

- **Cause:** **Set holder** only listed people already on the member list as active. On a site with no members imported yet, or when an officer wasn't a member, the list was empty or missing them and **Save holder** stayed greyed out with no reason given. Separately, a one-person seat (President, Vice President, Secretary…) refused a second holder unless "Several people" was ticked under **Edit**, which the dialog never mentioned.
- **Fixed:** the picker has **Someone not on the member list yet…** (name and email; the person is added to Members and seated in one step), a search box for long lists, and a note with a link to Members when the list is empty. For a one-person seat that already has a holder it offers **End … the day before** (default) or **Keep … and add this person too**, which makes the seat one for several people. Only super admins see **Set holder** and **Add a position**; other admins see a note saying so.
- **Live site:** the earlier fix for adding several board members on the same day (#100) and this one reach the live site only when Vercel deploys the latest `main`.

### 24.2 Fixed

- **Admin:** a **Site setup** card on the dashboard for super admins (missing site address, email, broadcast settings, contact address, donate link, push keys, cron secret, test-only switches on the live site, fewer than two super admins, encryption off; setting names only, never values); the dashboard says when part of it failed to load instead of showing it empty; the Admins page warns about a single super admin; Action items read every approved record (they stopped at the newest 100); minutes search, Events and Broadcasts say when a list reaches its limit; greyed-out buttons say why; no more "The server answered 500" messages.
- **Public site:** sitemap and robots files; schema.org Event data on event pages and Organization data on the home page; per-page link previews and canonical addresses; a plain-words **Privacy** page in the footer (for the board to read, §24.3); `/verify` without a code shows the form; member sign-in no longer reports success when sending failed; unsubscribe says which emails stop and explains failures; small accessibility fixes (flyer links, calendar chips, theme button, footer nav, offline page); 5.4 MB of unused original PNGs moved out of `public/` to `design/originals/`.
- **Operations:** the `minutes (eventId, eventDate desc)` index the event page's minutes card needs (it failed in production without it) and the two TTL policies are now in `firestore.indexes.json`; refused emails log their status; a site-wide error page and error pages for the docs and signing areas; `vercel-ignore-build.sh` compares with the last successful deployment and skips docs-only merges to `main`; Dependabot groups minor and patch updates; a weekly dependency audit; unused packages and `check-env.cjs` removed; go-live checklist §2 adds Firestore backups; runbook case R covers outages and restores.

### 24.3 Not changed: for the owner to decide

1. **Read the Privacy page** (`/privacy`) and the donate page's "about your gift" gap: legal status (registered nonprofit? 501(c)(3)? tax-deductible?), who organizes the GoFundMe and holds the money, and whom to ask about a donation. The donate page also still has the board-confirm note on what a Gumba is.
2. **Turn on Firestore backups** (go-live checklist §2; needs the pay-as-you-go plan) and run `npx firebase deploy --only firestore` to publish the new index and TTL policies.
3. **Vercel "wait for checks"**, so `main` only deploys after CI passes (Vercel → Settings → Git); and `CONTACT_EMAIL`, `NEXT_PUBLIC_APP_URL` in production (the Site setup card lists anything missing).
4. **Bigger admin features found, not built** (each is a phase of its own; say which to plan):
   - change a member's **email** (today: delete and re-add, which loses history);
   - **minutes for a meeting that isn't an event yet**, and changing the meeting while minutes are a draft;
   - **Ctrl/⌘ K finds people, events and minutes**, not only pages;
   - a **phone-friendly member list** (a "More…" menu per row, paging) and **bulk actions** (add to a group, record consent);
   - a full **activity log page** with paging and filters (the dashboard shows the latest 8);
   - **duplicate** an event or a broadcast, and **email one group** instead of everyone;
   - **delete a saved document**; filter Action items by person;
   - a server-side **error log** admins can read (today errors live in Vercel's logs for about an hour), and a record of the last email or push failure;
   - a **retention policy** for records that grow forever (activity log with internet addresses, broadcast deliveries, reminders).
5. **Public site, smaller:** a per-event share image, linking an event's place to a map and a Share button, a Contact/About page, optimising the Media page's thumbnails and moving its Facebook feed off Graph v18, and making the donate page's "time left" count in the browser.

## 25. Phase 18 — Change a member's email (planned 2026-11-06; decisions accepted; 18-A and 18-B built 2026-11-06)

**Goal.** Today a member's email address can't be changed: the update route has no email field (`members/[memberId]/route.ts`). A typo, a new address, or adding an address to someone who only gave a phone number means deleting the member and adding them again, which throws away their notes, call history, groups, positions and tasks. Phase 18 lets a super admin change it in place, safely.

### 25.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| `emailLower` is how the site finds a member by address: bounce and spam reports from Resend, the do-not-email list, the import's duplicate check, the callers-group link to an admin (D20), and the member sign-in link. | `memberSuppression.server.ts`, `members/import`, `groups.ts`, `auth.ts`, `send-login-link` | Change `email` and `emailLower` together, in one write; nothing else stores the address. |
| Everything else points at the member **id**, not the address: notes, calls, groups (`groupIds`), positions, tasks, broadcast deliveries, unsubscribe links (signed member id). | positions, groups, tasks, `unsubscribeToken.ts` | History, groups and positions survive the change untouched, and old unsubscribe links keep working. |
| Broadcasts, reminders and the digest read the address at send time. | `broadcastSender.server.ts:196`, `taskReminders.server.ts` | The next email goes to the new address with no extra work, even mid-way through a broadcast. |
| A member's sign-in is tied to the first account that used their address (`uid`), and a different account is refused. | `auth.ts` `findActiveMember` | The `uid` must be cleared on a change, or the member could never sign in with the new address. |
| Adding a member does **not** check whether another member already has the address; only the import does. | `members/route.ts` POST, `members/import` | 18-A adds the same check to add and to change, so one address belongs to one member. |
| Opt-outs and bounces are flags on the member (`emailOptOutAt`, `emailBounced`); deleting a member keeps a scrambled do-not-email record of the address (D44). | `memberDeletion.server.ts` | A change can reuse the same record and lookup. |
| Name fixes are super-admin only, because a wrong edit can misdirect mail or impersonate someone. | member route (`name` check) | The same applies to an address, even more so. |

### 25.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D57 | Who can change a member's email? | **Super admins only**, like names. Other admins see the address and a note to ask a super admin. | Nobody can quietly redirect someone's mail. |
| D58 | What can be done? | **Add** an address (phone-only member), **correct or replace** it, or **remove** it. Removing is allowed only when the member has a phone number and a name, the same rule as adding a member without email. | Covers typos, new addresses and members who stop using email. |
| D59 | Duplicates | Refused when another member already has the address (letters' case ignored), with a link to that member. The add-member form gets the same check. | One address, one member. Merging two records stays out of scope. |
| D60 | Consent and opt-out | They belong to the **person**, so they carry over: a member who agreed to email keeps that agreement, and one who opted out stays opted out. A **bounce** belonged to the old address, so it is cleared. If the new address is on the do-not-email list (it opted out or bounced as someone deleted earlier), that applies at once, as when adding a member. | No one is re-subscribed by a change, and a fixed typo can be emailed again. |
| D61 | The old address | If the member had opted out or the old address bounced, the old address goes on the do-not-email list (scrambled, like a deletion), so a later import can't start emails to it again. Otherwise it is simply forgotten. | Respects "stop emailing me" across changes. |
| D62 | Sign-in link (`uid`) | Cleared on every change, so the member's next sign-in with the new address links afresh. If an admin has the same old address, the callers-group link to that admin follows the address as before (D20). | The member is never locked out by an old account. |
| D63 | Record and notice | The activity log says "changed the email of {member}" with who and when, **without either address** (as other member entries avoid contact details). No email is sent to the old or new address. | A readable trail with no personal data in the log. A notice email was considered and left out: members have no account to protect, and it would send mail nobody asked for. |

### 25.3 Design

- **Pure rules** (`src/lib/memberEmailChange.ts`): `planEmailChange({ before, newEmail, duplicateOf, suppression })` returns either a refusal in plain words (same address, bad format, duplicate, removing the only contact) or the field changes: `email`, `emailLower` (`""` when removed, so phone-only members still list), `uid: null`, `emailBounced` cleared, the opt-out/bounce from a matching do-not-email record, and whether to write the old address's record. Unit-tested on every branch.
- **Server**: a transaction in `memberEmailChange.server.ts` that re-reads the member, looks up a duplicate by `emailLower` and the do-not-email record, writes the member, and writes the old address's record when D61 applies. Its own route, `PUT /api/organizations/ghmo/members/[memberId]/email` with `{ email }` ("" removes), super admin only (403 otherwise) and rate limited, so the general member update keeps its simpler rules; the add-member route gains the duplicate check. Audit action `member_email_changed` with an `ACTIVITY` label (no addresses; `memberAuditView` already reduces contact details to `hasEmail`).
- **Rules**: no change; members stay server-written. A rules test confirms a browser still can't write `email` or `emailLower`.
- **UI**: on the member profile, an **Edit email** button for super admins (beside **Delete member**). The dialog shows the current address, a new-address field, what will happen (consent carried over; "this member opted out, and stays opted out"; "the new address is on the do-not-email list"), and **Remove email** when D58 allows. The Members list shows the new address straight away; the row gets no new button (it is already crowded on phones, §24.3).
- **Docs**: admin guide section, runbook case O (a member asks what is held / to change it) points to Edit email, and the privacy page's "Your choices" mentions changing an address.

### 25.4 Sub-phases

- **18-A**: pure rules with unit tests; server transaction, PATCH field, duplicate check on add, audit label, rules test.
- **18-B**: Edit email dialog on the profile, browser spec (correct a typo; add to a phone-only member; remove; duplicate refused; opted-out member stays out and the old address lands on the do-not-email list; a plain admin has no button and gets 403), docs.

Each sub-phase runs the full gate (`npm run check`, emulator rules tests, the full browser suite, `npm run build`) before any push, and is pushed only when the owner asks.

### 25.5 Risks and out of scope

- **Wrong address typed:** the next broadcast goes to a stranger. The dialog asks for the address twice for a replacement, and shows it back in the confirmation.
- **Merging two member records** (someone added twice) is out of scope; D59 refuses the clash and links to the other record.
- **Admins' own emails** are unchanged by this phase (D55 still applies).
- **Bulk changes** (an import that updates addresses) are out of scope.

### 25.6 18-A built (2026-11-06)

- `src/lib/memberEmailChange.ts`: `planEmailChange`, the rules as one pure function (unit tests in `tests/unit/memberEmailChange.test.ts`). Changing only the letters' case keeps everything else as it is, including the sign-in link.
- `src/lib/memberEmailChange.server.ts`: one transaction reads the member and the duplicate check, writes the change and, when D61 applies, the old address's do-not-email record (`suppressionRef` is now exported from `memberDeletion.server.ts`). `memberUsingEmail` is also used by **Add a member**, which now refuses an address another member has (409, with that member's name).
- `PUT /api/organizations/ghmo/members/[memberId]/email`: super admins only; audit action `member_email_changed` ("changed a member's email") with the kind of change, never an address.
- Rules test: a browser can't write a member's `email`, `emailLower` or `uid`, or a do-not-email record. Browser spec `member-email.spec.ts`: a plain admin gets 403; change, duplicate, bad input, add to a phone-only member, opted-out member, removal rules, and an activity entry without names or addresses.

### 25.7 18-B built (2026-11-06)

- `src/components/admin/members/EmailCard.tsx`: an **Email** card on the member profile, outside the encryption gate (the address is plain text). Every admin sees the address; a super admin gets **Edit email** / **Add email**: the new address typed twice (a mismatch keeps **Save email** greyed out), notes on what carries over (an opt-out, a bounced old address), and **Remove email…** only when the member has a name and a phone number, with its own confirmation. Other admins see "Only a super admin can change an email address." The row on the Members list gets no new button.
- Browser spec (`member-email.spec.ts`): edit with a mismatch then a match; duplicate refused in words; no removal without a phone; an opted-out member's note and removal; adding to a phone-only member; a plain admin sees the address but no button.
- Docs: admin guide §1h (Email, and the table of what a profile holds), runbook case O step 3, and the privacy page.

## 26. Phase 19 — Minutes for any meeting (planned 2026-11-06; decisions accepted; 19-A and 19-B built 2026-11-06)

**Goal.** Minutes can only be written for an event that is already on the Events list and already in the past, and the meeting can't be changed once the minutes are saved. An unplanned board call, a meeting held by phone, or a meeting nobody added beforehand means leaving the minutes page, creating an event, coming back and starting again; a wrong pick means deleting the draft. On a new site with no past events, **Write minutes** on the dashboard leads straight to that dead end (§24.3). Phase 19 lets an admin record the meeting from the minutes page itself and fix the choice while the minutes are a draft.

### 26.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| A minutes record needs an existing event (`eventId`), copies its title and start time when created, and there can be only one per event (409). | `app/api/admin/minutes/route.ts` POST | Keep minutes tied to an event: the archive, the event page's minutes card, attendance export, action items and the dashboard all rely on it. Instead, make creating that event part of writing the minutes. |
| The picker lists every event that has started (drafts included), newest first, as a plain select; it is locked once the minutes are saved. | `MinutesEditorClient.tsx` (`pastEvents`, `disabled={Boolean(editingId)}`) | A searchable picker, and a way to change the meeting of a draft. |
| Any admin can create an event; a new event is a **draft** unless published, and drafts never appear on the public Events list or calendar. Past dates are accepted. | events POST | An inline "meeting that isn't listed" is just a draft event created by the existing route, so it stays off the public site. |
| Encrypted minutes are bound to the **minutes id**, not the event. | `minutesRecords.ts` (`minutesLoc`) | Moving a draft to another meeting needs no re-encryption. |
| The public archive lists every approved record by its own title and date and does not link to the event. | `minutesArchive.server.ts`, `app/(public)/minutes` | Minutes of a meeting that was never published as an event still appear in the archive once approved, as they do today. |

### 26.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D64 | How is a meeting that isn't listed recorded? | In **Which meeting?**, a **Record a meeting that isn't listed** button opens a short form: title (for example "Board call"), date and start time (today or earlier; time prefilled 7:00 PM), and an optional place. Saving creates a **draft** event with those details and selects it. If a past event already exists on that date, the form shows it and offers to use it instead. | No trip to Events, no public announcement of an internal meeting, and fewer duplicate events. |
| D65 | Who can do it? | Any admin, the same as writing minutes and adding events. | No new permission. |
| D66 | The meeting picker | A searchable list (title or date), newest first, showing each meeting's date; meetings that already have minutes are shown but can't be picked, with "has minutes". | Easy to find the right meeting once there are many, and no 409 surprise. |
| D67 | Changing the meeting | Allowed while the minutes are a **draft**: pick another meeting without minutes and save. The title and date are copied from the new meeting. Once submitted or approved, return them to draft first (existing **Return to draft**). The activity log says "moved minutes to another meeting" with both meeting titles. | A wrong pick is fixed in two clicks without losing the text. |
| D68 | What happens to a meeting created here if its minutes move away? | Nothing automatic: it stays as a draft event under **Events** (drafts), where an admin can delete it. | No hidden deletions. |
| D69 | The dashboard on a new site | **Write minutes** opens the editor with the inline form already open when there are no past meetings. | The first-run path works end to end. |

### 26.3 Design

- **19-A (server):** a separate `POST /api/admin/minutes/move` (`{ id, eventId }`, built instead of a new `PATCH` field so the save-and-approve flow is untouched) moves a **draft** only (409 when the target already has minutes, 400 when the target hasn't started, 409 "return to draft first" otherwise); it re-reads the event, copies `eventTitle` and `eventDate`, runs in a transaction with the one-per-event check, expires the public minutes cache, and writes `minutes_moved` to the activity log (new `ACTIVITY` label). The inline meeting uses the existing events POST (status `draft`), so no new route. A small pure helper picks "already on that day" candidates for D64 (unit tested). Rules unchanged; a rules test confirms a browser still can't write `eventId` on minutes.
- **19-B (UI):** the **Which meeting?** card gets a searchable picker (D66), **Record a meeting that isn't listed** with its form and same-day suggestion (D64), and **Change meeting** on a draft (D67); the dashboard's first-run path (D69). Browser spec: record a new meeting and write minutes for it without leaving the page; the new event is a draft and absent from the public Events page; the same-day suggestion; a meeting with minutes can't be picked; move a draft to another meeting (title and date follow; audit entry); a submitted draft can't be moved; encrypted minutes stay readable after a move. Admin guide (minutes section) and plan status.

### 26.4 Sub-phases

- **19-A:** server move of draft minutes, same-day helper, audit label, tests.
- **19-B:** editor UI, dashboard first-run path, browser spec, docs.

Each sub-phase runs the full gate before any push, and is pushed only when the owner asks.

### 26.5 Risks and out of scope

- **Duplicate meetings:** two admins recording the same call at once can still create two draft events; D64's same-day check reduces it, and a spare draft is deleted from Events.
- **Minutes with no event at all** were considered and left out: they would need changes to the archive, the event page, attendance export, action items and the dashboard for little gain over a draft event.
- **Moving approved minutes** stays a two-step action (return to draft, then move), so a published record never changes meeting silently.

### 26.6 19-A built (2026-11-06)

- `src/lib/minutesMeeting.ts`: `planMinutesMove` (draft only; target must exist, have started, differ from the current meeting and have no minutes) and `sameDayMeetings` / `dayKeyIn` for D64, unit tested in `tests/unit/minutesMeeting.test.ts`.
- `POST /api/admin/minutes/move`: any active admin; one transaction reads the minutes, the event and the one-per-meeting check, then copies the new meeting's title and date. The public minutes cache is expired, and the activity log says "moved minutes to another meeting" with both titles (`minutes_moved`).
- Rules test: a browser can't change a minutes record's meeting. Browser spec `minutes-meeting.spec.ts`: every refusal in words (has minutes, future meeting, same meeting, unknown meeting, approved minutes, unknown minutes), the move with title, date and content, and the audit entries.

### 26.7 19-B built (2026-11-06)

- `src/components/admin/minutes/MeetingPicker.tsx`: `MeetingSelect` (past meetings, newest first, a search box above six, "has minutes" options disabled), `RecordMeetingDialog` (title, date no later than today, time prefilled 7:00 PM, optional place; same-day meetings offered with **Use this meeting**; saved through the events route as a draft in the community's time zone) and `ChangeMeetingDialog` (calls `POST /api/admin/minutes/move`).
- The minutes editor uses them: **Record a meeting that isn't listed** for new minutes, **Change meeting…** on a draft (unsaved edits in the form are kept), and a note on submitted or approved minutes to return them to draft first. With no past meetings, `?mode=new` (the dashboard's **Write minutes**) opens the record form at once.
- Browser spec `minutes-meeting.spec.ts` (two new tests): the first-run path end to end (the meeting is a draft, absent from the public Events page, and the minutes save against it); "has minutes" disabled; the same-day offer; moving a draft from the editor with its content kept; no move button on approved minutes.
- Admin guide §1l.

## 27. Phase 20 — Search people and records (planned 2026-11-06; decisions accepted; 20-A and 20-B built 2026-11-06)

**Goal.** The page search (Ctrl/⌘ K, or the search button in the header on phones) only finds pages. To open a member, an event or a set of minutes, an admin goes to the right list and searches there, and some lists have no search at all (Events, Broadcasts, §24.3). Phase 20 makes the same box find records by name, so "Asha" or "picnic" is two keystrokes and Enter away.

### 27.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| The palette is a client component with a fixed list of pages (filtered by role), arrow keys and Enter. | `AdminJumpDialog.tsx`, `adminNav.ts` | Keep it, and add record results below the page results. |
| Member names and emails, event titles and dates, the meeting title and date of minutes, group names, position titles and broadcast subjects are stored as plain text, and every admin can already see them on their lists. | members, events, minutes, groups, positions, broadcasts | These can be searched without new permissions. |
| Phone numbers, family, notes, the text of minutes, Plans & Issues and chat are encrypted (only an unlocked device can read them). | Phase 9, 12, 13 | They are **not** searched: the server can't read them, and putting them in an index would undo the encryption. |
| Firestore has no text search, and each document read counts against the free daily quota (about 50,000). The Members page already reads every member on each visit. | Firestore | Load one compact index (names, titles and dates only) when the palette first opens, keep it in the page's memory for 10 minutes, and match in the browser as the admin types. No query per keystroke, and no new index or stored search field. |
| The Members and minutes lists have their own search box, but nothing can link to a search. | `MembersClient.tsx`, `MinutesSearchClient.tsx` | "See all matching members" opens the Members page with the words already in its search box (`?q=`). |

### 27.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D70 | What is searched? | Pages (as today), **members** (name, email), **events** (title, with the date shown), **minutes** (meeting title and date, with their status), **groups** (name), **positions** (title and current holders), **broadcasts** (subject, with status). Nothing encrypted. Turned-off members are included and marked **Turned off**. | Finds what admins look for daily, without touching protected data. |
| D71 | Who sees what? | Each admin finds only what they can already open: the same records every admin sees today; pages only for their role (super-admin pages only for super admins). | No new access. |
| D72 | How does it work? | The first time the palette opens in a tab, the browser fetches one compact list (ids, names, titles, dates, statuses; no phone numbers or contents) from a new admin-only route, keeps it **in memory only** (never saved on the device) for 10 minutes, and matches as you type, ignoring capitals and accents. Pressing Ctrl/⌘ K again within 10 minutes is instant. | Fast, works on slow phones, and a few hundred reads per opening rather than per keystroke. |
| D73 | Results | Grouped by kind (Pages first, then Members, Events, Minutes, Groups, Positions, Broadcasts), up to 5 per kind, arrow keys and Enter as today. Each kind with more matches ends with **See all matching on …** where that list can take the search (Members, minutes). | Short, predictable results; the full list is one more key away. |
| D74 | Is searching recorded? | No. Searching reads what admins can already read, like opening a list; the activity log stays for changes. The route is rate limited. | No noise in the activity log, no record of what someone looked up. |
| D75 | Where does Enter go? | Member → profile; event → its edit page; minutes → the editor for those minutes; group → the group page; position → the Positions page; broadcast → its page. | Every result opens the place to act on it. |

### 27.3 Design

- **20-A (server and pure rules):** `src/lib/adminSearch.ts`: `normalizeForSearch` (lower case, accents removed, spaces collapsed), `matchRecords(index, query, { perKind })` (all words must match; earlier and whole-word matches first) and `searchHref(kind, id)`; unit tested. `GET /api/admin/search-index` (active admin, rate limited): reads members (`name`, `emailLower`, `status`), events (`title`, `startsAt`, `status`), minutes (`eventTitle`, `eventDate`, `status`), groups (`name`, `active`), positions and current terms (titles and holder ids), broadcasts (`subject`, `status`) with `select()` so no other fields leave the server, and returns one JSON list. Rules unchanged.
- **20-B (UI):** the palette loads the index on first open (a small "Loading people and records…" line, and a plain-words message if it fails, with pages still working), shows grouped results with a kind label and a secondary line (date, status, email), and keeps keyboard and screen-reader behaviour (one listbox, group labels announced). Members page reads `?q=` into its search box; minutes search likewise. Browser spec: find a member by part of a name and by email, an event by a word in its title, minutes by meeting title; Enter opens each; a turned-off member is marked; a plain admin never sees super-admin pages; no phone number or note text is in the index response. Admin guide note and plan status.

### 27.4 Sub-phases

- **20-A:** pure matching rules, index route, tests.
- **20-B:** palette UI, `?q=` on Members and minutes, browser spec, docs.

Each sub-phase runs the full gate before any push, and is pushed only when the owner asks.

### 27.5 Risks and out of scope

- **Database reads:** each first opening reads every member, event, minutes record, group, position term and broadcast once (a few hundred documents for this community). If the lists grow into the thousands, a stored, cached index would be the next step.
- **Stale results:** something added in the last 10 minutes may not show until the palette is reopened after that; the list pages are always current.
- **Searching encrypted text** (notes, minutes text, Plans & Issues) is out of scope: it could only work in the browser after unlocking, one record at a time.

### 27.6 20-A built (2026-11-06)

- `src/lib/adminSearch.ts`: `normalizeForSearch` (capitals, accents and punctuation ignored; email characters kept), `scoreEntry` and `matchRecords` (every word must match; title starts, then word starts, then the rest, then the second line; newer first on a tie; fixed kind order; up to 5 per kind with the total), `searchHref` and `seeAllHref`. Unit tests in `tests/unit/adminSearch.test.ts`.
- `src/lib/adminSearch.server.ts` and `GET /api/admin/search-index`: any active admin, rate limited (30 per 10 minutes per admin), not logged. Every read uses `select()` with only names, titles, dates and statuses; position holders come from current terms by member name. Browser spec `admin-search.spec.ts` seeds encrypted contacts, notes, minutes text, event bodies, group descriptions, term notes and broadcast bodies with one marker and checks that the marker never appears in the response.

### 27.7 20-B built (2026-11-06)

- `AdminJumpDialog.tsx` is now **Search** (Ctrl/⌘ K, **Search…** in the header): pages as before, then from two letters the record groups from `matchRecords`, each row with its icon, a second line (email, date, status, holders) and a badge (Turned off, Draft). One listbox with a labelled group per kind, so arrow keys run through everything. The index is fetched on first open and kept in module memory for 10 minutes; a plain-words line shows while it loads or if it fails (pages still work).
- **See all N matching** for members and minutes opens `/admin/members?q=` and `/admin/minutes?mode=records&q=` with the search box filled in.
- Browser spec (`admin-search.spec.ts`): a member by part of a name with her position, Enter to the profile; an event, its minutes and a broadcast by a word; email search and the Turned off mark; See all to the Members list with the box filled; no super-admin pages for a plain admin. `admin-shell.spec.ts` follows the new names (Search, Results).
- Admin guide §1m and the README line.

## 28. Phase 21 — Members list on phones, and changing many at once (planned 2026-11-06; decisions accepted; 21-A to 21-C built 2026-11-06)

**Goal.** The Members page is the most used admin page and the most cramped on a phone. Each row can show up to nine buttons (consent, opt-out, call consent, call opt-out, Edit contact, Profile, Edit name, Groups, Turn off), which wrap into three or four lines; every member is drawn at once; and putting twenty people in the cooking team means opening twenty dialogs (§24.3). Phase 21 makes each row short, the list quick, and lets an admin change several members in one step.

### 28.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| A row's buttons depend on the member: consent or opt-out (email and calls), Edit contact (only on an unlocked device), Profile, Edit name (super admins), Groups (when groups exist), Turn off / Turn on. Each acts on that one member through the existing routes. | `MembersClient.tsx` (row `actions`) | Keep every action and its route; move them into a menu, so the row has two controls. |
| Search, the status and group filters, and Export all work on the full list; every member is rendered. | `MembersClient.tsx` (`visible`) | Show the first 50 of the filtered list with **Show 50 more**; filters, search and export keep using everything. |
| Groups already take many members in one request (`add`, `remove`, up to 200), with one activity entry. | `app/api/admin/groups/[groupId]/members` | Bulk "add to / remove from group" reuses it. |
| Turning a member off or on is a per-member `PATCH` (any admin), one activity entry each. | member route | Bulk turn off/on needs a small new route that does it in batches with one activity entry and a count. |
| Recording consent is a statement about one person ("only tick this if this person told you so", D7, plan §10.2). | Members page, import attestation | Consent and opt-outs stay one person at a time, never in bulk. |
| The radix-ui package (already a dependency) has an accessible dropdown menu; no menu component exists yet in `src/components/ui`. | `package.json` | Add a small `dropdown-menu.tsx` in the same style as the other UI pieces. |
| Several browser specs press row buttons by name (members, member contact, rename, delete UI, positions/groups). | `tests/e2e-auth/*` | They move to "open More…, then the item"; a shared test helper keeps them short. |

### 28.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D76 | What stays on the row? | **Profile** and a **More actions for {name}** button (⋯) on every screen size. The menu lists the actions that apply to that member, in today's order, with **Turn off…** last and in red. Badges (email and call status, positions, groups) stay. | Two controls per row on a phone and a tidy list on a computer; one extra click for consent actions. |
| D77 | How much of the list shows? | The first **50** of whatever the search and filters match, then **Show 50 more**, with "Showing 50 of 312". Search, filters and **Export list** always use everything. | The page opens fast with hundreds of members. |
| D78 | Choosing several | A tick box at the start of each row, and **Select all shown**. While any are ticked, a bar shows "**N selected**" with **Add to group…**, **Remove from group…**, **Turn off…**, **Turn on** and **Clear**. Up to 200 at a time. | The everyday group work is one step. |
| D79 | What is never done in bulk? | Recording **consent** or an **opt-out** (email or calls), editing contacts or names, and deleting. Those stay one person at a time. | Consent is always a statement about one person. |
| D80 | Records and checks | A bulk group change is one activity entry, as today. A bulk turn off/on is one entry with the count ("turned off 12 members"). **Turn off…** asks first and names how many. The server re-checks each member and skips ones already in that state, reporting how many changed. | A readable activity log and no surprises. |
| D81 | Who can do it? | Any admin, the same as the per-row actions today. | No new permission. |

### 28.3 Design

- **21-A (row and paging):** `src/components/ui/dropdown-menu.tsx` (radix DropdownMenu, the site's styles, 44 px items on touch). `MemberRowMenu` builds the items from the same conditions as today's buttons and calls the same handlers. The row keeps **Profile** and the menu; the phone line stays. Paging state resets when search or filters change. Browser specs updated through a helper `memberAction(page, name, label)`; new checks: a phone-width row has two controls, the menu has only the items that apply, **Show 50 more** with 120 seeded members.
- **21-B (choosing several):** row tick boxes, **Select all shown**, the selection bar, and dialogs for group (pick a group) and turn off (count and confirm). `POST /api/organizations/ghmo/members/bulk-status` (`{ ids, status }`, up to 200, any active admin, rate limited): batched writes, skips unchanged, one `members_status_bulk` activity entry with the count. Group changes call the existing group route. Browser spec: add 3 to a group, remove 2, turn off 2 (confirmation names the count), turn on again; the selection clears after each; the activity log has one entry per action; no consent action appears in the bar. Admin guide (Members section) and plan status.

### 28.4 Sub-phases

- **21-A:** menu component, compact rows, paging, spec updates.
- **21-B:** selection, bulk route, bar and dialogs, browser spec, docs.

Each sub-phase runs the full gate before any push, and is pushed only when the owner asks.

### 28.5 Risks and out of scope

- **One more click** for consent and contact edits; worth it for a list that is usable on a phone. If the board misses one-click consent on computers, a later change can show the first action beside **Profile** on wide screens.
- **Bulk delete** stays out of scope (D45 kept deletion one member at a time).
- **Very long lists:** paging is in the browser; all members are still loaded once, as today. Loading pages from the server is the next step only if the list reaches the thousands.

### 28.6 21-A built (2026-11-06)

- `src/components/ui/dropdown-menu.tsx`: the radix menu in the site's style (44 px items on touch, red for **Turn off…**).
- Member rows show **Profile** and **More actions for {name}** (⋯); the menu holds the same actions as before, under the same conditions and handlers, with **Turn off…** / **Turn on** last after a divider.
- The list shows the first 50 of what the search and filters match, then **Show N more** with "Showing 50 of 120"; a new search or filter starts again from 50. Export and the counts still use the whole list.
- Specs press row actions through `memberAction` / `firstMemberAction` (in `tests/e2e-auth/helpers.ts`); a new test checks two controls per row on a phone, a menu with only what applies, and paging with 120 members.

### 28.7 21-B built (2026-11-06)

- `src/components/admin/members/MembersBulk.tsx`: the selection bar ("N selected", **Add to group…**, **Remove from group…**, **Turn on**, **Turn off…**, **Clear**; over 200 selected disables the actions with a note) and the group dialog. No consent, contact, name or delete action is offered (D79).
- Members rows get a tick box (`Select {name}`) and the list a **Select all shown** box. Group changes go through the existing group route (one activity entry each); the toast says how many changed and how many were already in that state.
- `POST /api/organizations/ghmo/members/bulk-status` (`{ ids, status }`, 1 to 200 ids, any active admin, 30 per hour): skips unknown and unchanged members, writes in batches, and logs one `members_status_bulk` entry ("Turned off 2 members") with no names.
- Browser spec (`members.spec.ts`): add three to a group, remove two (one wasn't in it), turn two off through the confirmation naming the count, turn all shown on (two already on), one activity entry per action, no consent button in the bar, an empty request refused. Admin guide §1 updated for the menu, paging and selection.

### 28.8 21-C built (2026-11-06): seating a member's relative

*Owner request with 21-B: "add the people in board member but he is not in member's list, but in the family member of the member. add smart approach."*

- Family lists are part of each member's **encrypted** contact (plan §17, D29: for reference only, never contacted), so the server can't search them. The Positions page now decrypts members' contacts on an unlocked device (the same `useMemberContacts` hook as the Members page) and `src/lib/familyCandidates.ts` turns them into candidates: relatives who aren't members already (by name, ignoring case and accents), each offered once even if two members list them, labelled "Ram Rai (husband of Asha Rai)". Unit tests in `tests/unit/familyCandidates.test.ts`.
- **Set holder** shows them under **Family of members**. Picking one fills the new-person form with the name and number (both editable). Saving creates the member, encrypting the number in the browser bound to the new member's id, and seats them. No email or call consent is recorded: listing a relative is not their consent, so they can't be emailed or called until an admin records it.
- **Someone not on the member list yet** now also takes a phone number instead of an email on an unlocked device (encrypted the same way). On a locked device an email is still needed, with a pointer to unlock or use the Members page.
- Browser spec `family-officer.spec.ts`: a relative with a number becomes treasurer and a member (number not in plain text, no consent); she then shows as a member, not a relative; a relative with neither email nor number can't be saved until one is given.

## 29. Phase 22 — Activity log page (planned 2026-11-06; decisions accepted; 22-A and 22-B built 2026-11-06)

**Goal.** Every change in the admin area writes a line to the activity log (who, what, when, the internet address and browser), but the only place to read it is the dashboard's **Recent activity**, which shows the last 8 entries. The go-live checklist, the runbook and the admin guide keep saying "check the activity log", and after an incident the board needs to answer "who changed this, and when?". Phase 22 adds a page that reads the whole log.

### 29.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| Entries live in `organizations/ghmo/auditLogs`: `action`, `actor` (`uid`, `name`, `email`, `role`), `resource` (`type`, `id`, `summary`), `before`/`after`, `meta` (`ip`, `userAgent`, `route`), `createdAt`. The database rules let any admin read them; nothing can write them from a browser. | `src/lib/audit.ts`, `firestore.rules` | Every admin may read the page (D82); the server reads it for them, page by page. |
| `activitySentence` already turns an entry into plain words ("Asha changed a member's email"), using about 95 known actions; `tests/unit/auditLabels.test.ts` fails when an action has no words. | `src/lib/adminView.ts` | Reuse it, so the page and the dashboard read the same. |
| `before`/`after` were built never to hold encrypted content, phone numbers or note text (member entries keep `hasEmail`, deletions keep counts); the browser specs check this for the sensitive actions. | member, minutes, deletion routes and specs | "What changed" can show them as stored. |
| `resource.type` is not used consistently across routes, but `action` names are a fixed list. | routes | Group actions into areas by name (members, events and tasks, minutes, broadcasts, positions and groups, admins and security, calls), and filter on the action. |
| Firestore needs a composite index for "one person, newest first" and "these actions, newest first"; a date window alone needs none. | `firestore.indexes.json` | Two new indexes: `actor.uid` + `createdAt` desc, and `action` + `createdAt` desc. |
| The log is never trimmed today (§24.3 item 4). | | Out of scope here; the page pages backwards with "Load older" so size doesn't matter. |

### 29.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D82 | Who can see the page? | **Every admin**, as with Recent activity today. The **internet address and browser** of each entry show only to **super admins** (they are for incidents). | Transparency for the board; device details kept to the people who handle incidents. |
| D83 | What does an entry show? | The sentence and detail (as on the dashboard), the date and time, the person's role, and when opened: **What changed** (each plain field before → after, as stored; nothing encrypted is ever stored there) and a **link to the record** while it still exists (member, event, minutes, broadcast, group, position, admin). | Answers "who changed this, and what was it before?". |
| D84 | Finding entries | Filters for **person** (any admin, past or present), **area** (members, events and tasks, minutes, broadcasts, positions and groups, admins and security, calls, other) and **dates** (from, to), plus a text box that narrows the loaded entries by words in the sentence. 50 at a time, newest first, **Load older**. | Small, quick reads; works however long the log gets. |
| D85 | Download | **Super admins** can download the filtered view as a CSV (date, person, sentence, detail, area, and for them the address and browser). The download itself is a new activity entry. | Evidence for the board or an attorney, without a trip to the Firebase console. |
| D86 | Is anything changed or hidden? | No. The log stays append-only; the page only reads. Entries about deleted members still show (with "Removed member" where the profile is gone). | The record can't be tidied away. |
| D87 | Where is it? | **Activity** in the admin menu (under Security), found by search, and **See all activity** on the dashboard's Recent activity card. | One click from where people already look. |

### 29.3 Design

- **22-A (server and rules):** `src/lib/activityLog.ts` (pure): `ACTIVITY_AREAS` (area → action names, built from the labelled actions; anything unknown is "Other"), `areaOf(action)`, `changedFields(before, after)` (plain scalar and short-list fields only, in a stable order), `recordHref(entry)` and `activityCsv(rows, { withDevice })`; unit tests, plus one that every labelled action belongs to an area. `GET /api/admin/activity?person=&area=&from=&to=&before=` (any active admin, rate limited): newest first, 50 per page, cursor by `createdAt` and id; `meta.ip` and `meta.userAgent` removed unless the caller is a super admin; area filters use `action in [...]` in chunks of 30 merged by time. `POST /api/admin/activity/export` (super admins): the same filters, up to 5,000 rows, logged as `activity_exported`. The two composite indexes in `firestore.indexes.json`.
- **22-B (page):** `/admin/activity` with the filters, the list, an expandable entry (What changed, the record link, and the device line for super admins), **Load older**, and **Download CSV** for super admins; **Activity** in the nav and search; **See all activity** on the dashboard. Browser spec: entries from several people and areas; each filter narrows the list; Load older pages; a plain admin sees no address or browser and no Download, and the API leaves them out; a super admin downloads and the download is logged; a member-email change shows "Email changed" with no address; links open the record. Admin guide section and go-live checklist wording ("Admin → Activity").

### 29.4 Sub-phases

- **22-A:** pure rules, read and export routes, indexes, tests.
- **22-B:** the page, nav and dashboard link, browser spec, docs.

Each sub-phase runs the full gate before any push, and is pushed only when the owner asks. The new indexes need `npx firebase deploy --only firestore` before the person and area filters work on the live site.

### 29.5 Risks and out of scope

- **Older entries** written by the legacy `logAudit` helper have a slightly different shape; the page reads both, as the dashboard does.
- **Trimming the log** (a retention policy) is a separate decision (§24.3 item 4); this page only reads.
- **Searching inside every entry** server-side is out of scope; the text box narrows what is loaded, and the filters do the heavy lifting.

### 29.6 22-A built (2026-11-06)

- `src/lib/activityLog.ts`: areas by action name (`areaOf`, `actionsInArea`; every labelled action has one, and no area has more than 30), `changedFields` (plain fields only, nested objects left out, 20 at most, long text cut), `recordHref` (no link for deleted records; Admins only for super admins) and `activityCsv` (spreadsheet-safe cells; address and browser columns only when asked). `LABELLED_ACTIONS` is exported from `adminView.ts`. Unit tests in `tests/unit/activityLog.test.ts`.
- `src/lib/activityLog.server.ts`: `readActivity` (newest first, 50 per page, "Load older" by time; an area alone uses `action in [...]`, a person and an area together read that person's entries and keep the area's; device details only for super admins), `activityPeople` and `activityFilters` (dates as days in the community's time zone; plain-words refusals).
- `GET /api/admin/activity` (any active admin, rate limited, not logged; the list of people on the first page) and `POST /api/admin/activity/export` (super admins, up to 5,000 rows with device details, logged as `activity_exported`: "downloaded the activity log").
- `firestore.indexes.json`: `auditLogs` (`actor.uid`, `createdAt` desc) and (`action`, `createdAt` desc). **Run `npx firebase deploy --only firestore` once this ships.**
- Browser spec `activity-log.spec.ts`: paging 50 + 12, each filter, bad filters refused, no device details or download for a plain admin; a super admin's device details and CSV (61 lines), the download logged, and the log untouched.

### 29.7 22-B built (2026-11-06)

- `/admin/activity` (`ActivityClient.tsx`): Person, Area, From and To filters (a change reloads from the newest), a box that narrows what's on screen, entries that open to **What changed** (a small table), **Open the record** and, for super admins, the address and browser; **Load older**; **Download CSV** for super admins. Empty and failed states in plain words.
- **Activity** in the admin menu under Account (and so in Search), and **See all activity** on the dashboard's Recent activity card.
- Browser spec (`activity-log.spec.ts`, third test): from the dashboard link to 50 entries, an entry's changes and record link, Load older to 62, the Minutes area, a person, a word; a plain admin has no device line or Download; a super admin's device line and a CSV download that is logged as "1 entry (Minutes)".
- Docs: admin guide §1n, a runbook section on reading the log in an incident (and case P points to it), and a go-live checklist step for the new indexes.

## 30. Phase 23 — Copy, and email one group (planned 2026-11-06; decisions accepted 2026-11-06)

**Goal.** Two everyday gaps from the audit (§24.3). First, a yearly event (Lhosar, the picnic) or a monthly reminder email is typed again from scratch each time; a cancelled broadcast can't be reused at all. Second, a broadcast can only go to **every** member who agreed to email; the cooking team or the callers can't be emailed on their own. Phase 23 adds **Copy** for events and broadcasts, and a group audience for broadcasts.

### 30.1 What was checked (2026-11-06)

| Fact | Where | Effect on the design |
|---|---|---|
| An approval is bound to a hash of the content, which already contains `audience: "all"` as a fixed value; editing after approval returns the broadcast to draft. | `broadcastHash.ts`, `broadcast.ts` | The audience joins the hashed content: an approval covers who it goes to, and changing the group after approval needs approval again. Existing broadcasts keep the same hash, because "everyone" hashes exactly as today. |
| Recipients are chosen when sending starts: every member whose email state is "ready" (active, agreed, not opted out or bounced). | `broadcastSender.server.ts` (`loadRecipients`, `selectRecipients`) | A group audience adds one condition: the member's `groupIds` contains the group. Nothing else about consent changes. |
| Unsubscribing stops all GHMO announcement emails; there is one list, not one per group. | `memberSuppression.server.ts`, unsubscribe page | A group email keeps the same unsubscribe link and meaning, and its footer says why the person got it. |
| An event is a document with title, summary, body, location, time zone, dates, status and flyer settings; tasks are separate documents with an `eventId`. Task templates already copy titles, notes and groups. | events route, `eventTasks` | Copying an event is a new draft with the same text and place and no dates; copying its tasks reuses the template logic. |
| Creating events and broadcasts is open to any admin; broadcasts need a second admin's approval before sending (D8). | routes | Copies follow the same rules: a copied broadcast is a new draft that needs approval again. |

### 30.2 Decisions (accepted by the owner 2026-11-06)

| ID | Question | Recommendation | Effect |
|---|---|---|---|
| D88 | Copying an event | **Copy event…** on the event's edit page. The copy is a **draft** with the same title (with " (copy)" added), summary, description, place, time zone and flyer settings, and **no dates**; it opens straight away so the new dates can be set. | Next year's Lhosar starts from this year's wording. |
| D89 | The event's tasks | A box in the copy dialog, ticked by default: **Also copy its tasks**. Copied tasks keep their title, notes and group; they start **not done**, with **no people** and **no due dates**. | The checklist comes along without stale names or dates. |
| D90 | Copying a broadcast | **Copy as new draft** on any broadcast, including sent and cancelled ones. The copy has the same subject, text and audience, is a draft, and needs approval like any other; it remembers which broadcast it came from. | A monthly reminder is two clicks plus an edit. |
| D91 | Emailing one group | When writing a broadcast, **Send to**: **Everyone who agreed to email** (as today) or **One group**, then the group. Only members of that group who can be emailed (active, agreed, not opted out or bounced) get it; the page shows how many that is now. Turned-off groups are not offered. | The cooking team gets the cooking email; nobody else does. |
| D92 | Approval and the audience | The approver sees **To: Cooking team (12 people)**. The audience is part of what is approved: changing it after approval returns the broadcast to draft. Members are counted again when sending starts, as today, so someone who joined the group in between is included. | Nobody can widen the audience after approval. |
| D93 | Unsubscribe and the footer | One list, as today: the link in a group email still stops all GHMO announcements. The footer adds "You got this because you are in the Cooking team." The activity log names the group for group broadcasts. | No new kinds of consent to keep track of. |

### 30.3 Design

- **23-A (copies):** `POST /api/admin/organizations/ghmo/events/[eventId]/copy` (`{ withTasks }`, any admin): new draft event; tasks copied in a batch through the same pure rule as templates (`copyTasksForEvent`); audit `event_copied` ("copied an event", with the source title). `POST /api/admin/broadcasts/[id]/copy` (any admin): new draft with `copiedFrom`; audit `broadcast_copied`. Buttons on the event edit page (a dialog with the tasks box) and on the broadcast page. Browser spec: copy an event with tasks (draft, no dates, tasks not done and unassigned), without tasks; copy a sent broadcast (new draft, needs approval, the original untouched).
- **23-B (one group):** `BroadcastContent` gains `audience: { kind: "all" } | { kind: "group"; groupId: string }`; `hashBroadcast` hashes `"all"` or `"group:<id>"` (old hashes unchanged); create and edit accept it; `loadRecipients` filters by group; the recipient count on the page follows the choice; the approve view and the detail page say who it goes to; the footer line for group emails; audit details name the group. Unit tests for the hash (old broadcasts still approved) and recipient selection; browser spec: a group broadcast goes only to ready members of that group, changing the group after approval returns it to draft, a turned-off group isn't offered, the footer line is present. Admin guide and plan status.

### 30.4 Sub-phases

- **23-A:** copy an event (with or without tasks) and copy a broadcast.
- **23-B:** the group audience for broadcasts.

Each sub-phase runs the full gate before any push, and is pushed only when the owner asks.

### 30.5 Risks and out of scope

- **A wrong group** sends to the wrong people: the approval step shows the group and the count, and the approver is a second admin (D8).
- **Several groups at once, or "everyone except"**, are out of scope; one group, or everyone.
- **Per-group unsubscribe** is out of scope (D93): it would need a consent record per group.

### 30.6 23-A built (2026-11-06)

- `src/lib/copies.ts` (pure, unit tested): `copyTitle` ("… (copy)" within 120 characters), `eventCopyFields` (same words, place, time zone and flyer settings; draft, not featured, no dates) and `taskCopyFields` (title, notes, order and a still-active group; open, nobody on it, no due date).
- `src/lib/copies.server.ts` with `POST /api/admin/organizations/ghmo/events/[eventId]/copy` (`{ withTasks }`, default true; one batch for the event and its tasks) and `POST /api/admin/broadcasts/[broadcastId]/copy` (any state; a new draft with `copiedFrom` and a fresh content hash, never an approval). Both any active admin; activity entries `event_copied` ("copied an event", with the source title and task count) and `broadcast_copied`.
- **Copy event…** on the event's edit page (a dialog with **Also copy its tasks**, then straight to the new event) and **Copy as new draft** on every broadcast page.
- Browser spec `copies.spec.ts`: copy with tasks (draft, no dates, not featured; tasks open, unassigned, undated; a turned-off group dropped), copy without tasks, the original untouched; a cancelled broadcast copied as a draft without approval, the original still cancelled, unknown ids refused.
- Admin guide §1f and §2.
