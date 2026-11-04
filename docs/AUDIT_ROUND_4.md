# Audit round 4: layout, performance, security, content · 2026-11-04

Four fresh audits of the site as merged in PR #81 (round 3's fixes). Evidence: the 370 screenshots and the axe scan
from round 3's verification run (taken on exactly the merged code), Lighthouse on a build that read real data,
`npm audit`, the production build, and four reviewers reading the code. Every High and Medium below was checked against
the code by the lead before it went into this document.

**Severity.** High: would hurt a real visitor or admin or the organisation (data, money, trust, lockout), or a clear
regression. Medium: fix before or soon after launch. Low: polish.

## Summary

**Where the site stands.** Accessibility 100 and 0 axe violations; dark mode finished; production dependencies at 0
known vulnerabilities (19 moderate alerts, all dev-only). The round-3 security work mostly holds: the fail-closed
encryption check catches every server-side rollback the reviewer tried except one edge (S6), Bearer tokens are gone,
every Firestore admin rule ends with the session, every route is guarded or deliberately public, and the public cache
only ever holds public shapes and is expired by every admin write.

**What this round found: 48 findings** (layout 11, performance 12, security 10, content 15), **3 High, 15 Medium, 30
Low.** Two of the Highs are in the certificate pipeline, which no screenshot covered:

| # | High | Why it matters |
|---|---|---|
| C1 | Every date typed into a document prints **one day early** in the US ("2026-11-04" prints "November 3, 2026" in Harrisburg). | Wrong dates on wedding certificates and memorial notices. Confirmed with `TZ=America/New_York`. The template tests use noon UTC, so they never caught it. |
| L1 | Downloads and the signed certificate capture **only page 1** of a multi-page preview. | The wedding certificate (version 2) runs over two pages: the issued, hashed PDF is missing the Nepali text, witnesses, issuer and QR code. |
| S1 | A valid admin cookie can be renewed forever: the site's custom-token endpoint gives a token whose sign-in is fresh, and the session route turns it into a new 8-hour cookie. | Round 3's "sessions end after 8 hours" (S2) can be bypassed with a stolen cookie. Confirmed in code. |

Then the Mediums that matter most: the flyer download fails for any title with Nepali text, an en dash or a curly
apostrophe (S2); signatures print as dark boxes (L2); the certificate number can be blank, so the check page shows a
template id (C2); the member sign-in page's occasional layout jump now has a cause (P1); and two encryption issues for
before the cryptography review (S5 sealing, S6 the rollback pin).

**Needs the owner:** how to take GoFundMe Pro donations (S3: recommendation, link to GoFundMe's own page rather than run
their script on this site); whether certificates are numbered automatically (C2: recommendation, yes, "GHMO-2026-001");
the board to confirm the certificate's wording for a Magar bride with a non-Magar groom (C5).

## Fix plan (round 4), in order

1. **The three Highs, with tests:** document dates as calendar dates (C1, with a test under `TZ=America/New_York`);
   multi-page export and finalize, cutting pages on section boundaries (L1; until then, refuse to finalize a document
   longer than a page); close the cookie → custom token → cookie loop (S1, with a browser test).
2. **What families and checkers see:** the flyer filename (S2) and flyer content (C6); dark ink on a light background
   for signatures (L2); certificate numbers (C2); the recognition wording (C5); signing page states (L4).
3. **Security before the outside reviews:** seal only what the admin reviewed (S5), keep the rollback pin across
   re-setup (S6), authenticator reset and lock visibility (S4), GoFundMe Pro off the admin origin (S3), then the Lows.
4. **Speed:** the sign-in shift (P1), a narrower proxy (P2), service-worker navigation preload (P3), then the Lows.
5. **Wording and layout Lows**, then the full re-check with new screenshots of the certificate Review step and the
   signing page (L11).

---

## 1. Layout

| # | Area | Problem | Severity | Fix | Where |
|---|---|---|---|---|---|
| L1 | Document generator: Download and "Finalize & save signed certificate" | Only page 1 is captured (`previewRef` is on page 0; one `toPng`, one jsPDF page). The page split is a fixed-pixel cut, so a line or signature row can be sliced at a page edge. | High | A ref per page, one image per page, `addPage()` between them; cut on section boundaries; until then block finalize when `pageCount > 1`. | `src/features/docgen/components/DocPreview.tsx:79,93-116`; `DocBuilder.tsx:418-437,533-560` |
| L2 | Signatures on certificates | The pad paints a navy background with near-white ink into the PNG, which goes onto the white certificate unchanged. (Also in the content audit.) | Medium | Dark ink on a white or transparent background; trim to the ink. | `app/(sign)/sign/[sessionId]/page.tsx:130-132,190-191`; `DocBuilder.tsx:369-376` |
| L3 | Meeting minutes export | One letter page with `overflow-hidden`: longer minutes are cut off in the preview and the PDF without a warning. | Medium | Multi-page as L1, or at least "doesn't fit on one page". | `src/features/minutes/components/MinutesPreview.tsx:85-94`; `MinutesEditorClient.tsx:363-385` |
| L4 | Signing page | No loading state (the pad shows before the session is read, then may switch to "expired"); rotating a phone clears the pad but keeps `hasInk`, so Submit sends a blank signature. | Medium | A skeleton until the session is read; pad only when pending; reset `hasInk` on resize (or keep the drawing). | `app/(sign)/sign/[sessionId]/page.tsx:115-137,241-246,292-327` |
| L5 | Wedding certificate made on a phone | A viewport media query changes the fixed 816 px page's layout on phones, so it differs from one made on a desktop; the QR address is 8 px. | Low | Drop the media query; at least 0.65rem for the address. | `weddingCertificate.ts:486-490,505-515` |
| L6 | Home "Next events", tablet | Three cards in two columns leave one alone. | Low | Two cards at `md`, or one column until `lg`. | `UpcomingEvents.tsx:38` |
| L7 | Event cards | Round 3's fix moved the "·" to the start of the wrapped time line. | Low | No separator; wrap date and time with a gap. | `EventCard.tsx:76-87` |
| L8 | Events "All" | Only a small badge marks where past events start. | Low | A "Past events" subheading. | `EventsClient.tsx:59,116-122` |
| L9 | "All minutes" on the dashboard and Gumba page | On phones it reads as a stray label; aligned differently on the two pages. | Low | One shared "All minutes →" link. | `AdminDashboardOverview.tsx:219`; `gumba-project/page.tsx:101` |
| L10 | Global 404 | No header; logo and icon tile stack as two emblems. | Low | One emblem, or the slim public header. | `app/global-not-found.tsx:30` |
| L11 | Screenshot coverage | The signing page, the document generator's Review step, the verify page's "found" state and the calendar view are never captured, which is why L1, L2 and L4 went unseen. | Low | Captures for those states, with a seeded certificate. | `tests/ui-audit/screenshots.spec.ts` |

## 2. Performance

| # | Area | Problem | Severity | Fix | Where |
|---|---|---|---|---|---|
| P1 | Member sign-in (round 3's open item) | **Cause found:** the card sits in `<Suspense fallback={null}>` and the shell before it is over React's 12.8 KB chunk size, so React sends the card after the footer and reveals it by script; if the browser paints first, the reveal waits 300 ms and the footer jumps. The bad run's first frame shows an empty main with the footer high up. | Medium | Read `next` from `searchParams` on the server and drop the Suspense (no `useSearchParams`). | `app/(auth)/login/page.tsx:19,245-249` |
| P2 | `proxy.ts` on every request | In Next 16 the proxy runs as a Node function (`functions-config-manifest.json`), so every view of a cached page, client navigation and even `/sw.js` and icons cost a function run before the cached HTML is served. On public paths it only sets a fixed CSP (and round 3's hint backfill, useless 8 hours after a deploy). Round 2's P14 at Low is now too low. | Medium | Public CSP in `next.config` `headers()`; matcher only for the secure prefixes; drop the backfill. | `proxy.ts:5-22,41-45,70-79` |
| P3 | Return visits | The service worker answers page loads with `fetch()` but has no navigation preload, so every load on a return visit waits for the worker to start. | Medium | `navigationPreload.enable()` in `activate`; `event.preloadResponse` first. | `public/sw.js:23-30,51-55` |
| P4 | Cached public pages | `app/(public)/loading.tsx` and Home's two Suspense wrappers make every built page send its content after the footer (the same mechanism as P1); readers without JavaScript see only the skeleton. Not seen in lab runs. | Low | Remove the public `loading.tsx` and Home's wrappers; keep loading states only where a page renders on demand. | `app/(public)/loading.tsx`; `app/(public)/page.tsx:83-85,107-109` |
| P5 | Prefetch (**R3 P5 incomplete**) | Links that cross root layouts or point to per-request pages still prefetch: the header on secure pages (5 public pages), board sign-in → guide, guide → board sign-in, member sign-in → board sign-in, the event page's admin links. | Low | `prefetch={false}` there; the header turns prefetch off when rendered in a secure layout. | `CommunityHeader.tsx:34,58-59,105-106`; `AdminLoginClient.tsx:263`; `onboarding/page.tsx:62`; `login/page.tsx:235`; `EventMinutesCard.tsx:122,141,149` |
| P6 | Admin dashboard | Reads 50 whole minutes records (ciphertext included) and an unused home-blocks document for 5 rows and 2 counts. | Low | `select()` the shown fields, limit 5, `count()` for the totals; drop the blocks read. | `src/lib/adminData.server.ts:81-92` |
| P7 | Events list payload | Every event's `body` and `status` go to the browser; the cards use neither. | Low | A card shape without `body`. | `publicData.server.ts:51`; `EventsClient.tsx:35` |
| P8 | Home "Next events" | Uses the build-time clock, so a copy up to an hour old can show an ended evening event as next. | Low | Filter in the browser with `useNow`, as the Events page does. | `UpcomingEvents.tsx:16-20` |
| P9 | Calendar feed and flyer | Per-request routes get `unstable_cache`'s stale value at once and refresh in the background, so a console edit reaches them a request late. Admin writes are not affected. | Low | Note it; optionally a short timer for these two. | `app/api/calendar/route.ts:9`; `announcement.pdf/route.tsx:22` |
| P10 | Public events API | No page uses it; it skips the cached loader; a bad `rangeStart` gives a 500. | Low | Serve the public variant from `getPublishedEvents()` and validate dates, or keep only the admin variants. | `app/api/organizations/[orgSlug]/events/route.ts:34-60` |
| P11 | Board guide | Fixed text, but in a secure root layout, so every view renders per request. | Low | Drop `secure` for `(docs)`. | `app/(docs)/layout.tsx:10` |
| P12 | Images | The hero (largest paint on Home and Donate) is 72 KB at quality 75; the logo downloads twice (36 px and 48 px sizes). | Low | `quality={60}` on heroes (with `images.qualities`); one logo size. | `app/(public)/page.tsx:54-62`; `donate/page.tsx:76-80`; `SiteFooter.tsx:46` |

Also confirmed by the performance review: when a cached page rebuilds, Next 16.4.3 waits for fresh data rather than
reusing a stale copy, so round 3's "a console edit can take ~10 minutes" is really "up to 5 minutes"; `expireTime`
caps a served page at an hour.

## 3. Security

Round 3's S1, S5–S7, S10 and S11 hold; S3 holds against every server-side lever tried except S6 below; S4's lockout
can't be used by a stranger (wrong codes need the victim's email-link session); S2 is bypassable (S1 below); S8 and S9
each have one leftover (S9, S7 below).

| # | Area | Problem | Severity | Fix | Where |
|---|---|---|---|---|---|
| S1 | Sessions (**R3 S2 incomplete**) | `GET /api/auth/firebase-custom-token` returns a custom token for any valid admin cookie; signing in with it gives an ID token with a fresh `auth_time` and the admin claims; `POST /api/auth/session` (admin branch) mints a new 8-hour cookie from it, and the new expiry becomes the next `sessionExp`. Repeatable, so a stolen cookie never expires until sign-out or disable. | High | Remove the admin branch from `/api/auth/session` (admin sessions are only made server-side: passkey, authenticator, email verify); refuse tokens carrying `sessionExp` in `createSessionResponse`; a browser test for the chain. | `app/api/auth/firebase-custom-token/route.ts:21-32`; `app/api/auth/session/route.ts:45-54`; `src/lib/sessionCookies.ts:41-58` |
| S2 | Public flyer | Any title with a character above U+00FF (Nepali, en dash, a phone's ’) makes the download fail with a 500: the title goes raw into `Content-Disposition` (confirmed with Node). Found by two reviewers. | Medium | ASCII fallback plus `filename*=UTF-8''…`; unit tests with a Devanagari title and ’. | `announcement.pdf/route.tsx:27-33` |
| S3 | Public pages share the admin origin | The public CSP has no `script-src`, and `/donate` will run GoFundMe Pro's script once enabled. A script there runs same-origin: for a signed-in admin it can call admin APIs, get a custom token (S1), read the sealed device keys and delete the rollback pin. No third-party script runs today. | Medium (before GoFundMe Pro is switched on) | Link to GoFundMe's hosted page (or embed it in a cross-origin iframe); if the snippet must run here, a host-allowlist `script-src` on `/donate`; longer term, admin on its own subdomain. | `src/lib/security/csp.ts:63-70`; `GoFundMeProInstallSnippet.tsx:21-22` |
| S4 | Authenticator lock and reset (S4 follow-up; also in the content audit) | A lock means someone with the admin's inbox has been guessing; after the documented super-admin reset, the next email-link session can enroll a new authenticator with no approval. The daily failure counter isn't cleared on reset (the first typo re-locks for up to 24 h); nobody can see who is locked; it locks on the 21st wrong code, not the 20th. | Medium | After a reset, a new authenticator waits for another admin's approval (as email-link passkeys already do); clear the counter; show "Locked" in the super admin list and say who in the notice; fix the off-by-one. | `app/api/admin/totp/[ownerUid]/route.ts:26-27`; `app/api/auth/totp/setup/route.ts:24-27`; `app/api/auth/totp/verify/route.ts:45-47`; `app/api/admin/totp/route.ts:17`; `src/lib/totpStore.ts:44-48` |
| S5 | Encryption: sealing an existing device list | "Seal the device list" signs a candidate fetched from the server at click time, not the list the super admin just reviewed, so a database attacker could slip a device or key into the first log entry (only for workspaces sealed after the fact). | Medium (before the crypto review) | Build the first entry in the browser from the reviewed overview, or check the candidate equals it before signing. | `src/lib/e2ee/client/E2eeProvider.tsx:642-651`; `app/api/admin/e2ee/roster/route.ts:16-17` |
| S6 | Encryption: rollback pin lost on re-setup | The pin is stored inside the device identity; setting a device up again overwrites it, so after a (server-forced or legitimate) re-setup, "encryption off" is accepted again. Unsealed workspaces never get a pin. | Low | Carry the pin into the new identity, or store pins by uid; pin "encryption has been on" too. | `E2eeProvider.tsx:367-384`; `src/lib/e2ee/client/deviceStore.ts:57` |
| S7 | `/api/auth/me` (**R3 S9 incomplete**) | The env-error branch still returns `missing` (env variable names). | Low | Drop it. | `app/api/auth/me/route.ts:48` |
| S8 | Emulator-only test route | Gated only on `NEXT_PUBLIC_USE_FIREBASE_EMULATORS`; set by mistake in Vercel, anyone could flush the public cache (and the flag widens the CSP and origin fallbacks). | Low | Also refuse when `VERCEL` is set; a checklist line that the flag must be unset. | `app/api/test/expire-public-cache/route.ts:12` |
| S9 | Calendar feed (S8 leftover) | Event links inside the `.ics` come from the request Host, and the CDN can cache them. | Low | `getAppOrigin(req)`. | `app/api/calendar/route.ts:17`; `[eventId]/route.ts:17` |
| S10 | Supply chain | `jsonwebtoken` is a production dependency nothing imports. | Low | Remove it. | `package.json` |

## 4. Content and copy

| # | Area | Problem (current text) | Severity | Fix | Where |
|---|---|---|---|---|---|
| C1 | All documents, minutes preview | Typed dates print one day early: `new Date("2026-11-04")` is midnight UTC, formatted in the browser's zone ("November 3, 2026" in Harrisburg). | High | Read `YYYY-MM-DD` as a calendar date (or format in UTC); a test run under `TZ=America/New_York`. | `src/features/docgen/render/renderTemplateHtml.ts:3-7,81-90`; `MinutesPreview.tsx:202-210` |
| C2 | Certificate number | Optional; left blank, the record's number falls back to the template id, so the check page shows "Certificate number: wedding-certificate" and tells the reader to compare it. | Medium | Number certificates automatically (GHMO-2026-001), or require it; a hint saying where it appears. | `DocBuilder.tsx:288`; `verify/[code]/page.tsx:59-66` |
| C3 | Admin refusals (**R3 C15 incomplete**) | With bounded sessions an admin mid-task sees "Unauthorized"; also "Admin profile not found", "Super admin required", "Cross-site request refused"; "Admin env not configured" in 65 places, "Unavailable" in 3. | Medium | One mapping of refusal reasons to plain words ("Your sign-in has ended. Sign in again, then try once more."; "Only a super admin can do this."). | `src/lib/admin.ts:117-167`; `src/lib/totpRoutes.ts:14`; `src/lib/e2eeRoute.ts:15,22`; signing-session routes |
| C4 | Admin email sign-in | "Invalid or expired link" with no next step (the most common failure); "Daily email sign-in quota exceeded… enable billing"; "Unable to mint session"; "Server misconfigured"; "Missing oobCode". | Medium | "This sign-in link has expired or was already used. Request a new one below; only the newest link works." Plain quota and outage lines. | `app/api/auth/email/verify/route.ts:19,86-96,132`; `email/start/route.ts:125-138` |
| C5 | Wedding certificate (**R3 C2 incomplete**) | For a Magar bride with a non-Magar groom it still prints the Maiti representative paragraph "from the Magar community"; for two non-Magar partners, "recognizes their union within the Magar community". | Medium | The Maiti paragraph only when the bride's community isn't Magar; a neutral welcome otherwise; same in Nepali; board to confirm. | `weddingCertificate.ts:322-360` |
| C6 | Event flyer (now public) | No GHMO name or address; "Date/Time:" repeating the date for start and end; an empty "Details:" heading; A4; the file is called "… Announcement.pdf". | Medium | GHMO header and event-page footer; "When"/"Where"; the date once; no empty sections; US Letter; "<title> flyer.pdf". | `announcement.pdf/route.tsx:27,39-85` |
| C7 | Lockout message, guide | Doesn't say recovery codes stop working too; the guide never mentions the lock; "That code is not right" has no next step. | Low | As in the reviewer's notes. | `app/api/auth/totp/verify/route.ts:18-19`; `onboarding/page.tsx:44-50` |
| C8 | Wedding template description | "A marriage certificate…" contradicts "It is not a legal marriage certificate". | Low | "A community wedding certificate… (not a legal marriage record)…". | `weddingCertificate.ts:202` |
| C9 | Encryption "paused" | Raw check reasons ("current epoch differs from the signed log"); the strip and the Encryption page give different next steps. | Low | One plain line, one next step in both places, the raw reason under "Details". | `src/lib/e2ee/rollback.ts:9-11`; `EncryptionGate.tsx:51-55`; `EncryptionPanel.tsx:578-586` |
| C10 | Signing page, signature buttons | "Signature for Witness 1", "as Issuing authority"; buttons "Request" / "Request again". | Low | "Sign as witness 1", "as the issuer"; "Request signature" / "Send a new link". | `sign/[sessionId]/page.tsx:16-21,253-256`; `DocBuilder.tsx:630` |
| C11 | Examples and placeholders | Several imply GHMO has a hall; "Saturday, October 12" is a Monday in 2026; "at Magar Heritage Celebration"; "Service place". | Low | Neutral addresses; no weekday; small fixes. | templates; `BroadcastsClient.tsx:66` |
| C12 | Email notifications panel | Leaves out call reminders and the lockout notice. | Low | List all four. | `NotificationsPanel.tsx:99` |
| C13 | Broadcast refusals | An env var name, "this chunk", "Already cancelled.", "The daily sending limit is 0." | Low | Plain wording, "canceled". | `broadcastSender.server.ts:67,91,219`; `broadcast.ts:95` |
| C14 | Verify page, revoked | "This certificate has been revoked" with no next step. | Low | "This certificate is no longer valid" plus who to ask. | `verify/[code]/page.tsx:56` |
| C15 | Public minutes detail | "Discussion" before "Agenda". | Low | Agenda, Discussion, Decisions, Action items. | `app/(public)/minutes/[id]/page.tsx:53-60` |

## Strengths (keep)

- The fail-closed encryption check, Bearer removal, `withinSession()` on every admin rule, and a guard on every route.
- The public cache holds only public shapes, every in-app write expires its tag, failed reads are never cached, and
  public pages cost 0 Firestore reads per view.
- Round 3's layout fixes all landed (encryption strip, sidebar labels, one primary on Plans & Issues, past events).
- The signing page maps every server answer to a plain sentence; the certificate's legal note is clear in both
  languages; the memorial notice is gentle; failure states share one pattern.
- Accessibility 0 violations, dark mode finished, desktop Lighthouse 100.
