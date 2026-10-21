# GHMO Platform — Upgraded Project Plan (v2)

_Status: **approved** (all §7 recommendations accepted 2026-10-21) · Last updated: 2026-10-21_

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

1. **Bootstrap:** the first super-admin creates epoch 1 (WDK + sealing key) and a **recovery key** (256-bit, shown once as a printable code). The recovery key wraps the WDK. **Required** (decision D1): E2EE cannot be switched on until two named trustees have each confirmed they hold a paper copy. The trustees' names (not the key) are recorded in the keyring doc. Without the key, losing all devices means losing all E2EE data; the UI says this plainly.
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
| **0** | Foundation repair | Fix React/Next version mismatch (React 19 for Next 16). Add ESLint, Vitest, Playwright and GitHub Actions CI. | CI green on `main`; branch protection on. |
| **1** | Security hardening | S-01 → S-21. Security headers + CSP. Revocable session cookies. Durable rate limiting. **Remove PIN login and PIN bootstrap.** Remove debug routes. Zod on every route. `proxy.ts`. | Header scan (securityheaders.com) A; disabled admin loses access within 1 minute in a test; no third-party script on `/admin`. |
| **2** | Passkeys + UI foundation | WebAuthn passkeys **required** for admin login (magic link only for first enrollment and lost-device recovery). Tailwind v4 upgrade, design tokens, shadcn/ui primitives, new admin shell. | Every admin enrolled with a passkey; admin routes reject sessions without passkey auth; all admin pages on the new shell. |
| **3** | E2EE core | `src/lib/e2ee/` (keys, envelopes, wrapping, sealing) with full tests. Keyring collection + rules. Device enrollment, safety codes, recovery key with two-trustee confirmation, Devices & keys page. | Two devices can share the WDK; removing one + rotating blocks it from new data (automated test); recovery drill passes. |
| **4** | E2EE rollout | Encrypt Admin Chat → Plans & Issues → draft minutes → signatures (sealed) → document history. Client-side search. Migration job. Rules updated to envelope validation. | Firestore console shows no plaintext in E2EE collections; migration verified; plaintext backups scheduled for deletion. |
| **5** | Governance features | Original roadmap items, built on the encrypted base: minutes approval workflow + versioning, action-item tracking, template versioning, QR verification (signed hash of the published document), attendance exports. | Per-feature acceptance. |
| **6** | Public & integrations | Public governance archive, `.ics` export, notification emails (content-free), autosave drafts (encrypted locally). | — |
| **7** | Assurance | External review of `src/lib/e2ee/`, pen-test of auth, incident-response runbook, key-rotation drill. | Findings fixed or accepted in writing. |

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

