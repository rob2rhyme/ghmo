# Audit round 2: layout, performance, security, content · 2026-11-03

Four fresh audits of the site as merged in PRs #77–#79 (Phase 10 complete). Method: a production build, `npm run
ui:screens` (268 screenshots in every state, plus the axe accessibility scan), Lighthouse on the main pages at phone and
desktop, `npm audit`, bundle and asset sizes, and four reviewers reading the code: layout (fresh eyes), performance,
security, content and copy. Each finding cites the file and line.

**Severity.** High: would hurt a real visitor or admin or the organisation (data, money, trust, lockout), or a clear
regression. Medium: fix before or soon after launch. Low: polish.

## Summary

**Where the site stands.** Accessibility 100 and SEO 100 on every page measured; no page scrolls sideways; light and dark
both finished; production dependencies have no known vulnerabilities; the security basics (revocable sessions, strict
input handling, nonce CSP, rate limits, audited separation of duties) are sound. Desktop performance is 69–100.

**What this round found: 72 findings** (layout 19, performance 18, security 18, content 17), 6 High, 27 Medium,
39 Low. The Highs, grouped:

| # | High | Why it matters |
|---|---|---|
| S1 | An email link alone can add a passkey to an admin who uses the authenticator app, and it activates at once. | Whoever controls an admin's inbox can get a full admin session without the 6-digit code. One function to fix. |
| C1 | Blank fields print "TBD", "Dear Valued Member" and invented `@ghmo.org` addresses into real letters and certificates. | Documents go out on GHMO letterhead with placeholder text and contacts nobody owns. |
| L1 | The shared step list squeezes its text into a 90 px column on phones (Calling tree checklist). | A regression from Upgrade 2 on the page meant to guide a new admin on day one. |
| P1–P4 | Phones score 50–59 on the main public pages: the Firebase SDK ships to every visitor, pages render per request and call their own API, and admin pages verify the session three times. | Slow first visits on phones, which is how most members will arrive. |

Then the Mediums that matter most: member sign-in accepts unverified emails (S2), a disabled admin can still read one
route (S3), a dead route stores document inputs in plaintext (S4), one project name instead of three (C2), a form field
that does nothing (C3), Members and the dashboard without a focal point on desktop (L2–L4), and oversized images (P8).

**Needs the owner:** nothing to decide for the Highs (all are code). Later: turn off password sign-in in Firebase (S2),
the GoFundMe link and contact email (still unset), community photos (L6).

## Fix plan (round 2), in order

1. **Security Highs and quick wins:** S1 (passkey enrolment vs authenticator) with a browser test; S3; S4 (delete the
   dead route); S2 (verified email + provider check; checklist item for the Firebase console).
2. **Content High:** C1 (no placeholder text or invented contacts in exported documents; the two broken sentences),
   then C2–C6 (one project name, remove the dead form field, encryption vocabulary, plain connection and signing errors).
3. **Layout High and the shared-component fixes:** L1 (`Steps` wraps on phones), L9 (time and zone on one line), L10 and
   L12 (`AdminList` chevron and flush footer), L11 (inline "What's this?"), L2–L4 (Members rows and order, dashboard
   focal point), L5–L8 (Donate notice, Media card, Plans & Issues primaries), then the Lows.
4. **Performance, biggest first:** P1 (Firebase out of the public bundle), P8 (favicon, hero, letterhead, unused files),
   P5–P6 (crypto polyfill, lazy export libraries), the desktop layout shift, then P2–P4 (cached server reads, no
   self-calls, one session check) as a careful second step with the browser suite as the net.
5. **Wording pass** (C7–C18) and the security Lows (S7–S16) as time allows; re-run screenshots, axe and Lighthouse.

---

## Status after the fix pass (2026-11-03)

Fixed in this pass (one branch, four commits: security, content, layout, performance); every suite below was rerun on
the result. Rows not listed are still open and summarised under "Deferred".

**Security.** S1 (passkey enrolment needs the authenticator app once one is set up, with a browser test), S2 (member
sign-in needs a verified email from the email-link or custom-token provider, plus a go-live checklist item to turn
off password sign-in), S3 (timeline route checks the admin record), S4 (dead plaintext route deleted), S5 (server
self-calls use the configured origin; production refuses to guess), S6 (webhook signature covers a timestamp, replay
window 5 minutes, dedup by transaction, `event_id` required), S8 (date fallback escaped), S9 (generic error bodies on 31
routes; details stay in server logs), S11 (`img-src` narrowed), S12 (WebAuthn origin must be configured in production),
S13 (failed sign-in requests no longer store the typed address), S14 (broadcast PATCH in a transaction), S16 in part
(production audit gate at `high`), S18 in part (the route sweep now covers every non-public route). From S17's notes:
unlocked keys lock after 15 minutes without input, and passphrase devices lock when the tab is hidden.

**Content.** C1 (no "TBD", placeholder salutations or invented contacts; empty fields leave their sentence out; template
version 2 with tests), C2 ("Gumba Project" everywhere), C3 (flyer-template field removed), C4 ("remove" / "make new
keys"), C5, C6, C7 (American spellings), C8, C9, C10, C11 (rate-limit and connection messages say what to do), C13
(in-card email confirmation), C12 (site description), C14, C15 (error pages show the contact address when `CONTACT_EMAIL` is
set), C16, C17, C18.

**Layout.** L1 (`Steps` wraps its action under the text on phones), L2–L4 (Members list first at every width with Add
and Import behind buttons; dashboard zero tiles collapsed, one Donations card, quick actions only where there is no
sidebar), L5, L6 (Donate hero cropped to the building, no `priority` on hidden images), L7 (Media featured card with the
video image and a whole-card link), L8 (one primary on Plans & Issues), L9 (time and zone on one line), L10 (chevron on
row links), L11 (inline "What's this?"), L12 (flush last row), L13–L19.

**Performance.** P1 (no Firebase SDK on public pages: Auth loads on sign-out only, Firestore only on the pages that
listen), P5 (no Node crypto polyfill in the broadcast bundle), P6 (PDF, image and QR libraries load on Download), P8
(10 KB favicon, WebP hero, letterhead and seal, unused files removed), P9 (YouTube feed cached for 15 minutes across
cold starts), P10 (signature poll backs off to 5 s and pauses when hidden), P11 (chat limited to the last 100 messages;
one listener per comment, kept across updates), P13 (public calendar, events and donation stats cacheable for 5
minutes; admin and auth stay `no-store`), P18 (`next/font/local` Inter with a size-adjusted fallback; worker caches
optimised images, no 158 KB icon precache).

**Deferred, and why.** P2–P4 and P7 were done in a separate speed pass (next section). P12, P14–P17 are scale and
structure work. S7 (per-email sign-in limit), S10 (`__Host-` cookie: the test suites run over http), S15
(shape checks in Firestore rules), S16's SHA pinning and S18's permission matrix are next on the security list. L6's
second half (different artwork on Donate) waits for the owner's photos.

**Rerun after the fixes** (same method as the audit): typecheck and lint clean (75 warnings, cap 77), 331 unit tests,
97 emulator tests, 221 browser tests, 334 screenshots with axe at 0, production build and its 41 browser tests.
Lighthouse, phone score before → after: Home 50 → 80, Donate 59 → 84, Events 58 → 87, Minutes 51 → 83, Media 80 → 92,
Board guide 78 → 99, Admin sign-in 72 → 99, Member sign-in 78 → 97; page weight 1.3 MB → 0.4–0.5 MB everywhere; phone
blocking time 660–1,070 ms → 110–240 ms; desktop Donate CLS 0.91 → 0. The desktop Home shift (0.53) was the route's
loading skeleton being replaced by the page: the events and feeds now stream behind placeholders of their own height.
Media's phone LCP rose to 3.3 s because the featured card gained a picture (measured against the 4 MB original; now the
WebP, preloaded). Phones are not at 90 yet: the rest is P2–P4 (server rendering per request and the self-calls).

**Speed pass (P2, P3, P4, P7), same day.**
- **P2:** published events, donation totals and the minutes archive are read through shared loaders
  (`src/lib/publicData.server.ts`) that keep the result in Next's data cache for 5 minutes, tagged by kind
  (`src/lib/publicCache.server.ts`). Home, Donate and Minutes are built once and refreshed in the background
  (`s-maxage=300` on the CDN). Every admin write expires its tag at once: event create, update and delete, every
  minutes change, the encryption migration, the GoFundMe webhook and reconcile. A change made outside the app (the
  Firebase console) shows within 5 minutes. A failed read at request time throws, so the last good page keeps being
  served; during the build (CI has no Firebase settings) it shows a "can't be read" state instead of failing. Against
  the emulators nothing is cached, because the browser suites write to Firestore directly; a separate check on a
  normal build confirmed that an admin write shows at once and a direct database write stays hidden until the refresh.
- **P3:** admin pages call shared read functions (`src/lib/adminData.server.ts`) instead of their own API, and the API
  routes call the same functions, so their answers are unchanged. `internalFetch` and its URL helper are deleted, which
  also removes S5's session-forwarding path.
- **P4:** in a server render, `requireActiveAdmin()` verifies the cookie and reads the admin record once for the layout
  and the page (React `cache()`); every check and refusal reason is unchanged. The encryption gate requests the device
  log alongside the overview instead of after it; every verification step is unchanged.
- **P7:** the public events list and event page render on the server with their data. The event page reads one event,
  decides admin-ness from the server session (no probe of the admin minutes API for every visitor) and includes the
  event's minutes.
- Also: creating an event through the API without a summary no longer fails with a 500. Lint warnings 75 → 67.

Lighthouse, phone (same method as §2a):

| Page | Audit | Round 2 | Speed pass | Phone LCP | Phone blocking |
|---|---|---|---|---|---|
| Home | 50 | 80 | **88** | 3.7 s | 158 ms |
| Donate | 59 | 84 | **97** | 2.6 s | 85 ms |
| Events | 58 | 87 | **99** (66 cold) | 0.8 s | 140 ms |
| Minutes | 51 | 83 | **99** | 0.8 s | 118 ms |
| Media | 80 | 92 | **98** | 1.9 s | 132 ms |
| Board guide | 78 | 99 | **99** | 0.8 s | 140 ms |
| Admin sign-in | 72 | 99 | **99** | 0.8 s | 118 ms |
| Member sign-in | 78 | 97 | **97** | 0.8 s | 186 ms |

Desktop is 100 on every page. Events renders per request (it sits under the secure, nonce-based layout): three runs
scored 83, 99 and 99; the batch caught its first request after the server started (module load and first database
read), which scored 66. Home's remaining phone time is the hero picture arriving on a slow connection.

**Still needs the owner:** `GOFUNDME_PUBLIC_URL`, `CONTACT_EMAIL`, social links, community photos, and turning off
password sign-in in the Firebase console (checklist).

---

## 1. Layout (fresh eyes)

Checked at 375/768/1280 px in light and dark, including the encryption-on states and both phone menus. Nothing scrolls
sideways (334 screenshots); light and dark both read as finished; every Audit 2 High is fixed; the axe accessibility scan
is at 0. What follows is what the upgrades left behind or made inconsistent.

| # | Area | Problem | Sev. | Fix | Where |
|---|---|---|---|---|---|
| L1 | Calling tree checklist, phone (any `Steps layout="list"` with an action) | **Regression from Upgrade 2:** the shared `Steps` list never wraps its action button under the text, so on a phone the step text is squeezed into a ~90 px column, two words per line. This is the first-day checklist that Audit 2 called the model for guidance. | High | In `Steps`, let the row wrap: the action goes under the text on phones (`basis-full pl-10`) and beside it from `sm`. | `src/components/ui/steps.tsx:20,42`; `CallingTreeClient.tsx:241-244` |
| L2 | Members, tablet and desktop | Every member row is two decks (~123 px) with the buttons floating at 60% of the row, because the page forces `sm:flex-col` while `AdminListRow` caps the action box. Six people take 740 px. | Medium | One row with right-aligned buttons that wrap only when needed, or a `stacked` option on `AdminListRow` that drops the cap and left-aligns the actions under the name. | `MembersClient.tsx:480`; `AdminList.tsx:63` |
| L3 | Members, tablet and desktop | The phone got "list first, forms behind buttons"; wider screens still show two tall form cards (~690 px) before the list, so at 1280×800 no member is visible without scrolling. | Medium | The phone pattern at every width: list first, Add and Import open a panel. | `MembersClient.tsx:274,289` |
| L4 | Admin dashboard, tablet and desktop | No focal point: three zero tiles, then six quick-action tiles repeating the sidebar, and the real content only at y≈700. The "Raised" tile links to a Sync anchor at the very bottom, where a second Sync button sits. | Medium | Hide quick actions when the sidebar shows; collapse zero tiles to one line ("No donations synced yet · Sync"); one Donations card near the figures. | `AdminDashboardOverview.tsx:146-190,268` |
| L5 | Donate | Two notices say the same thing a screen apart ("Donations open soon" alert, then a "Fundraising starts soon" box). | Medium | While not started, fold the one sentence into the alert and drop the box; keep the alternatives row. | `donate/page.tsx:73,88-98` |
| L6 | Home → Donate | The same illustration, same size and place, is the hero on both pages; Home sets `priority` on two images. | Medium | Different art or crop on Donate (or move it down to "Why the Gumba Project matters"); a community photo on Home when the owner supplies one. | `page.tsx:49-58`; `homeHero.ts:6`; `donate/page.tsx:75-84` |
| L7 | Media | The featured YouTube card's left half is an empty tinted panel with a play glyph, which reads as a failed video, and it isn't clickable. | Medium | A real image (channel art, latest thumbnail from the feed, or the building artwork) and a whole-card link. | `MultimediaHomeContent.tsx:13-21` |
| L8 | Plans & Issues, desktop | Two primaries for one action on one screen: header "New topic" and the always-open form's "Start topic" 450 px below; the header button stays live while the page is locked. | Medium | Show the form only on `?new=1` (collapsed otherwise); hide the header button while locked. | `comms/page.tsx:36-42`; `CommsBoardClient.tsx:72-77,235-269` |
| L9 | Home "Next events", Events grid | The time wraps so the zone sits alone on a second line ("7:36 AM / EST") in every card. | Medium | Keep time and zone together (`whitespace-nowrap`), or omit the zone when it is the default Harrisburg zone. | `EventCard.tsx:62-65`; `eventDates.ts:49-54` |
| L10 | Admin Events, dashboard minutes, GUMBA minutes | Whole-row links have no visible affordance (hover only); rows are 940 px wide with content in the left third. | Medium | A muted chevron at the row end when `href` is set and there are no actions; cap wide lists or add a right-hand column. | `AdminList.tsx:44-63`; `events/page.tsx:55,106` |
| L11 | Encryption-off strip, every gated page | "What's this?" is forced onto its own row, so the one-line strip is two rows at 1280 and four at 375; the state has three wordings across the strip, the Encryption page and Members. | Low | Inline the disclosure; one opening phrase ("Encryption is off.") on all three. | `EncryptionGate.tsx:50-67`; `EncryptionPanel.tsx:603`; `MembersClient.tsx:594` |
| L12 | Lists inside section cards | A bare `AdminList` draws its bottom border and the card adds padding, so every list ends in an empty band that looks like a missing row. | Low | Pull the last list to the card edge, or a flush footer slot on `AdminSectionCard`. | `AdminList.tsx:16`; `AdminSectionCard.tsx:24` |
| L13 | Donate, desktop | Rhythm zig-zags between full-width tinted boxes and reading-width prose. | Low | Hero wide, everything else at reading width. | `donate/page.tsx:88-211` |
| L14 | Header on /donate | The current-page marker is a 2 px bar hanging under a solid button; it reads as a glitch. | Low | On `/donate` render the button as secondary/outline with `aria-current`, no underline. | `CommunityHeader.tsx:147-160` |
| L15 | 404, tablet and desktop | Four equal buttons wrap 3 + 1. | Low | One primary plus three text links in a row. | `NotFoundBody.tsx:7-30` |
| L16 | Home "Next events", tablet | Three cards in two columns leave an orphan half-row. | Low | `md:grid-cols-3`. | `UpcomingEvents.tsx:39` |
| L17 | Meeting minutes editor | Agenda and Decisions open with an empty input plus a remove button; an action item starts as "Task 1" with a blank task. | Low | Start with the "Add …" button only, or hide remove while the list is one empty row. | `MinutesEditorClient.tsx:176-215` |
| L18 | Document generator, desktop | The form card stretches to the preview's height, leaving ~250 px blank under "Next". | Low | `items-start` on the grid. | `DocBuilder.tsx:658` |
| L19 | Public minutes list vs detail | The same meeting is dated two ways ("Oct 4, 2026" vs "Sun, Oct 4, 2026"). | Low | One helper for both. | `minutes/page.tsx:50`; `minutes/[id]/page.tsx:32` |

**Keep:** one public frame (titles at the same x on every page, one scale, one footer, one message-page look); the
admin sign-in and encryption setup screens; the phone admin (sticky Save, list-first Members, document generator select,
chat composer on screen, menu scrolling as one); honest empty states; `EventCard` and the calm minutes reading page.



## 2. Performance

**Measured on the production build** (Turbopack; sizes gzip unless noted): 0 static pages (every public page renders
per request); first-load JS `/` 377 KB, `/donate` 378 KB, `/admin` 399 KB, `/admin/minutes` 547 KB,
`/admin/document-generator` 562 KB; one 646 KB (191 KB gz) chunk holding the Firebase client SDK ships on **every** page
including public ones; 44 of 123 API route files import `firebase-admin` (about 13 MB traced each); assets:
`Ghmo-building.png` 4.1 MB (the hero), `favicon.ico` 557 KB (every page), `logo-light/dark.png` 560/524 KB, docgen
letterhead + seal 1.3 MB as raw `<img>`, two unreferenced files (606 KB + 506 KB). Fonts are lean (Inter variable,
subsetted, `swap`). Lighthouse scores are in §2a below.

| # | Area | Problem | Sev. | Fix | Where |
|---|---|---|---|---|---|
| P1 | All public pages | The header's Sign-out button imports `firebase/auth` and `firebaseClient` (which also starts Firestore), so every visitor downloads and runs the Firebase SDK (191 KB gz) on the home page for nothing. | High | Lazy-import `firebase/auth` inside `handleSignOut`; split `firebaseClient.ts` so Firestore is pulled only by chat/comms/action-items. About −120 KB gz on every public page. | `SignOutButton.tsx:6-7`; `firebaseClient.ts:2-50`; `CommunityHeader.tsx:10` |
| P2 | Home, Donate, Minutes, Media, Events | No public page is static or cached: `force-dynamic`/`revalidate = 0`, and `internalFetch` reads cookies, so every visit runs a server function and the CDN caches nothing. | High | Read Firestore directly in server components with a 60–300 s cache (`unstable_cache`/`"use cache"`); drop `force-dynamic` from public pages (keep `/verify`); revalidate the minutes archive on approval. TTFB from 0.3–3 s to a CDN hit. | `donate/page.tsx:11-24`; `minutes/page.tsx:10`; `minutes/[id]/page.tsx:7`; `internalFetch.ts:12`; `UpcomingEvents.tsx:17` |
| P3 | Home, Donate, 9 admin pages | Server pages call their **own HTTP API** (`internalFetch` → `/api/…`): a second function run, a second cold start and a second session check per page view. | High | Call the data functions directly (as `minutes/page.tsx` does); keep the API for the browser. | `internalFetch.ts:10-24`; `admin/page.tsx:28`; `donate/page.tsx:136`; `feeds.ts:78` |
| P4 | Every admin page | One page load verifies the session 3× on the server (layout, page, API), each a round trip to Google plus a Firestore read; then the browser makes 2 more sequential calls before the encryption gate shows the page. | High | Wrap `requireActiveAdmin` in React `cache()`; after P3 the API hop goes away; return overview + roster from one endpoint. Admin TTFB roughly halves. | `auth.ts:72-83`; `admin.ts:86-107`; `admin/layout.tsx:38`; `E2eeProvider.tsx:178-230` |
| P5 | Broadcasts | `BroadcastsClient` imports two constants from `broadcast.ts`, which imports `node:crypto`, so the browser bundle ships a Node crypto polyfill (132 KB gz). | Medium | Move constants to `broadcast.shared.ts`; `import "server-only"` in `broadcast.ts`. | `broadcast.ts:1,34`; `BroadcastsClient.tsx:18` |
| P6 | Minutes, Document generator | `jspdf`, `html-to-image` and `qrcode` are static imports (134 KB gz) though they run only on Download. | Medium | `await import(...)` inside the export handlers. | `MinutesEditorClient.tsx:4-5`; `DocBuilder.tsx:3-5` |
| P7 | Public events list and event page | Client pages that fetch after hydration (skeleton → API), the event page fetches the whole list to find one event, probes `/api/admin/minutes` for every visitor (a 401), then refetches; they sit under the nonce/no-store layout. | Medium | Server-render list and detail with the cached loader; `findEventDoc` for one id; admin-ness from the server session. | `EventsClient.tsx:578-596`; `events/[eventId]/page.tsx:752-832`; `(member)/layout.tsx:9` |
| P8 | Assets | `favicon.ico` is 557 KB on every first visit; `rob2rhyme.png` and `favicon1.ico` (1.1 MB) are unreferenced; five `priority` images on the home page (two always hidden) compete with the hero; the hero source is 3500 px / 4.1 MB; letterhead + seal 1.3 MB as raw `<img>`. | Medium | A ~10 KB favicon; delete the two files; `priority` on the hero only; pre-shrink the hero to ~1600 px WebP (~200 KB); WebP letterhead and seal. | `siteMetadata.ts:9`; `public/assets/`; `page.tsx:27-58`; `ThemeLogo.tsx:18-19`; `LetterheadPage.tsx:33-55` |
| P9 | Home, Media | Social feeds are loaded in the request path with an in-process 5-minute cache that a cold function loses; YouTube goes through an extra API hop. | Medium | `loadYouTubeMedia()` directly inside a 15-minute `unstable_cache`. | `feeds.ts:76-86`; `media.ts:28-150` |
| P10 | Document generator | The signature poll restarts on every keystroke and fires about 2 requests per 2 s per pending signer, with no back-off and no pause when the tab is hidden. | Medium | One effect keyed on pending ids; back off to 5–10 s; pause on `document.hidden`. | `DocBuilder.tsx:311-368` |
| P11 | Admin chat, Plans & Issues | Chat listens to the whole message collection with no limit (and decrypts all of it); the topic page opens one listener per comment and re-subscribes all on every change. | Medium | `limitToLast(100)` with load-older; like counts on the comment doc; subscribe only to changed ids. | `AdminChatClient.tsx:62-66`; `CommsThreadDetailClient.tsx:131-175` |
| P12 | Cold starts | Admin pages and 44 routes bundle `firebase-admin` + gRPC (13–14 MB traced); the flyer route adds pdfkit (21 MB). 1–3 s cold on Hobby, doubled by the self-fetch (P3). | Medium | P3/P4 first; consider Firestore's REST transport (`preferRest: true`) to skip gRPC init. | `firebaseAdmin.ts:21-37` |
| P13 | API caching | `Cache-Control: no-store` on **all** `/api/*`, including the public calendar feed, events and donation stats. | Low | Keep `no-store` for admin and auth; `public, s-maxage=300, stale-while-revalidate=600` on public GETs. | `next.config.mjs:24`; `api/calendar/route.ts:6` |
| P14 | proxy.ts | Runs on every page request only to add a static CSP header on public paths: an extra function hop. | Low | Narrow the matcher to secure prefixes; emit the public CSP from `headers()`. | `proxy.ts:606-645`; `csp.ts:13-18` |
| P15 | Events storage | Every events read queries 3 collections (needing 3 composite indexes); fine at today's scale but permanent overhead. | Low | One-off copy of the two legacy collections into the primary path, then retire the fallbacks. | `events.ts:170-207` |
| P16 | Large client components | `MinutesEditorClient` 1,035 lines / 10 states, `DocBuilder` 871, `MembersClient` 760, `CommsThreadDetailClient` 763, `EncryptionPanel` 716: single state roots, so every keystroke re-renders the whole page; 9 `set-state-in-effect` lint warnings. | Low | Split form, list and preview into memoised children; derive `previewReady` from the load callback; debounce the preview. | `MinutesEditorClient.tsx:465-508`; `MinutesPreview.tsx:46-67` |
| P17 | Lists without limits | `/api/admin/minutes` returns up to 100 full records and the browser decrypts all before the list shows; members returns the whole roster. Fine today. | Low | Paginate (25 + cursor); decrypt lazily. | `api/admin/minutes/route.ts:1500`; `members/route.ts:1793` |
| P18 | Fonts, service worker | Inter loads via CSS `@import` (no preload, no fallback metrics); the worker precaches the 158 KB manifest icon and never caches `/_next/image`. | Low | `next/font/local` on the same file; drop the icon from precache; small stale-while-revalidate cache for `/_next/image`. | `globals.css:3`; `sw.js:659-676` |

**Keep:** the service worker and header rules (pages and API never cached); heavy server libraries isolated to their one
route; realtime Firestore opt-in per page; `useAuthSession` deduplicating `/api/auth/me`; lean fonts and one 12 KB CSS
file; `next/image` with `sizes` on the hero and cards.

### 2a. Lighthouse (production build, local server, no CDN)

Scores 0–100 (90+ is good). Accessibility is 100 everywhere and SEO 100 everywhere; best practices 96–100.

| Page | Phone perf | Desktop perf | Phone LCP | Phone blocking | Desktop CLS | Page weight |
|---|---|---|---|---|---|---|
| Home | **50** | 74 | 5.7 s | 1,071 ms | **0.53** | 1.3 MB |
| Donate | **59** | 69 | 7.7 s | 687 ms | **0.91** | 1.4 MB |
| Events | **58** | 95 | 7.7 s | 658 ms | 0.03 | 1.3 MB |
| Minutes | **51** | 100 | 7.2 s | 773 ms | 0 (phone 0.16) | 1.3 MB |
| Media | 80 | 95 | 0.8 s | 860 ms | 0 | 1.3 MB |
| Board guide | 78 | 100 | 0.8 s | 974 ms | 0 | 1.3 MB |
| Admin sign in | 72 | 100 | 3.4 s | 814 ms | 0 | 1.3 MB |
| Member sign in | 78 | 100 | 0.8 s | 974 ms | 0 | 1.3 MB |

What the numbers say (they match the code review above):
- **Every page weighs about 1.3 MB before any content**, and phones spend 0.7–1.1 s blocked on JavaScript: that is the
  Firebase SDK in the public bundle (P1) plus the framework. Lighthouse's "unused JavaScript" on Home is 194 KB.
- **Slow largest paint on phones (5.7–7.7 s)** on Home, Donate, Events and Minutes: the 4.1 MB hero source and the
  557 KB favicon (P8), plus per-request rendering (P2).
- **Layout shift on desktop Home (0.53) and Donate (0.91)**, where under 0.1 is good: the whole `<main>` moves once as
  the page loads (the two-column hero reflows). Not caught by any reviewer; to reproduce and fix in the fix round
  (likely the hero image's `fill` box or the font swap). Minutes on phones shifts 0.16 when the footer moves.
- Server response is fine (110 ms root document locally); the cost is in the browser and, on Vercel, cold starts.




## 3. Security (internal review before the outside penetration test and cryptography review)

`npm audit --omit=dev`: 0. The 19 moderate dev-only advisories are one minimatch ReDoS reached only through ESLint
plugins and `firebase-tools`, which run on developer machines against our own patterns (accepted 2026-10-31). Items
already accepted in writing (Phase 7 R6, R10, R12, R14, R16) are not re-flagged.

| # | Area | Problem | Sev. | Fix | Where |
|---|---|---|---|---|---|
| S1 | Admin sign-in | **An email link alone can add a passkey to an admin who uses the authenticator app.** `decideNewPasskeyStatus` only looks at existing passkeys, so an admin with an active authenticator and no passkey gets a new passkey activated at once from a magic-link session. Whoever controls that inbox can then sign in with the passkey and get a full session without ever entering the 6-digit code. The mirror protection exists for the other direction (`totp/setup` refuses when a passkey exists). Verified in the code. | **High** | Treat an active authenticator like an existing active passkey in `decideNewPasskeyStatus` (pending until another admin approves), and refuse `register/options` for magic-link sessions when the authenticator is active; browser test. | `passkeys.ts:118-123`; `passkey/register/options/route.ts:15`; `passkey/register/verify/route.ts:58-59` |
| S2 | Member sign-in | Any Firebase token whose email matches an active member becomes a member session; `email_verified` and the sign-in provider are never checked. If password sign-up is on in Firebase (the default with the Email provider), someone can create an account with a member's address, get a member session, and `post-auth` binds the record to their uid, locking the real member out. Member-only content is small today. | Medium | Require `email_verified` and provider ∈ {emailLink, custom} in `session`, `post-auth` and `findActiveMember`; in Firebase turn off password sign-in; add to the go-live checklist. | `auth/session/route.ts:43-54`; `auth/post-auth/route.ts:125-152`; `auth.ts:165-186` |
| S3 | `/api/organizations/ghmo/gumba/timeline` | Checks only the token claim (`assertCommunityRole`), so a **disabled** or magic-link-only admin can read the internal timeline for up to 8 h; the route sweep skips it because it tests disabled admins only under `/admin/`. | Medium | `enforceActiveAdmin`; delete `assertCommunityRole`; widen the sweep to every non-public route. | `gumba/timeline/route.ts:24-26`; `auth.ts:151-156`; `route-sweep.spec.ts:86` |
| S4 | `/api/docgen/log` | Dead route (no caller) that still stores document inputs in **plaintext**, readable by every admin, with no check that encryption is on. | Medium | Delete it (and the collection if it has data). | `api/docgen/log/route.ts:20-69`; `firestore.rules:54-56` |
| S5 | Server self-calls | `internalFetch` builds its URL from `x-forwarded-host`/`host` and forwards the admin's session cookie to it. Safe on Vercel (platform-set headers); on any other host a spoofed header would send the cookie to an attacker. | Medium | Base URL from `NEXT_PUBLIC_APP_URL`, failing closed in production; better, call data functions directly (also P3). | `serverUrl.ts:224-233`; `internalFetch.ts:204-219` |
| S6 | GoFundMe webhook (not wired yet) | HMAC covers the body only (no timestamp); dedup relies on an optional `event_id` (missing → random, so a captured payload can be replayed); read-then-set, not a transaction. | Medium, before wiring | Require `event_id`; sign with a timestamp and tolerance window (as `svix.ts` does); `create()` in a transaction. | `gfmpro/webhook/route.ts:51-59`; `gofundme.ts:16-36` |
| S7 | Admin magic-link start | A per-email limit of 5 per 5 min lets a stranger keep an admin out of email sign-in indefinitely; the quota branch and an extra round trip happen only for real admin addresses (a small enumeration signal). | Low | Key on (email, IP) or 10/hour; generic 200 on quota. | `auth/email/start/route.ts:62-125` |
| S8 | Docgen templates | `formatDate()` returns unparseable input unescaped into the letter HTML (self-XSS for admins; CSP blocks handlers, but a document could carry injected markup). | Low | Escape the fallback; add a test. | `renderTemplateHtml.ts:80-89` |
| S9 | Error bodies | `err.message`, `detail` and missing env var names reach clients on some routes. | Low | Generic client messages; details to the server log. | public events `:86-90`; docgen templates `:72-76`; email start `:38-41` |
| S10 | Session cookie | `__session`, `SameSite=Lax`, no `__Host-` prefix (plan S-09 asked for it; the comment cites Firebase Hosting, but the site runs on Vercel). | Low | `__Host-session` (one forced re-login); keep Lax and the `Sec-Fetch-Site` check. | `sessionCookies.ts:9-20` |
| S11 | CSP (secure pages) | `img-src … https:` lets any script that does run exfiltrate via image beacons. | Low | Restrict to `'self' data: blob:` plus the hosts actually used. | `csp.ts:49-50` |
| S12 | WebAuthn origin | Falls back to the request `Host` when `NEXT_PUBLIC_APP_URL` is unset. | Low | Refuse to start WebAuthn in production without a configured origin. | `passkeys.ts:50-53`; `appUrl.ts:106-120` |
| S13 | Audit log privacy | Failed admin sign-in requests store any typed email, readable by all admins. | Low | Hash it, or record only matched admins. | `auth/email/start/route.ts:61-88` |
| S14 | Broadcast PATCH | Read-then-merge without a transaction; the send-time hash check still prevents wrong emails. | Low | `runTransaction` as `manual-post` does. | `broadcasts/[broadcastId]/route.ts:117-134` |
| S15 | Firestore rules | `timeline`, `docgen/**`, `gumba/**`, `home/blocks`, `donations/**` are admin-writable from the client with no shape or size checks (hygiene, not XSS: nothing renders them as raw HTML). | Low | `keys().hasOnly` and `size()` caps, or route through the API. | `firestore.rules:37-53,91-94,270-276` |
| S16 | CI / supply chain | Actions pinned to major tags, not SHAs; the production audit gate is `critical` only. | Low | Pin SHAs (Dependabot keeps them fresh); `--audit-level=high`. | `ci.yml:21-24,86,101`; `codeql.yml:124-125` |
| S17 | E2EE (notes for the outside reviewer) | Device keys are generated extractable, exported and sealed under the KEK, then re-imported non-extractable; plan §4.2 says "extractable: false", so the document should describe what is built. No idle auto-lock: an unlocked laptop stays unlocked. Nothing key-shaped is logged; drafts are ciphertext. | Low | Document the seal design; add an idle lock (15 min; on `visibilitychange` for passphrase devices). | `e2ee/keys.ts:50-136`; `E2eeProvider.tsx:196,373` |
| S18 | Route sweep gaps | No admin-vs-super-admin matrix, no cross-admin object tests (author approving own broadcast, passkey self-approval), nothing outside `/admin/`. | Low | Add those cases to `tests/e2e-auth`. | `route-sweep.spec.ts:41-88` |

**Reproduction sketch for S1.** Admin "bob" has an authenticator app and no passkey; an attacker controls bob's inbox.
(1) Request an email link, open it: a magic-link session. (2) `POST /api/auth/passkey/register/options` → expected 403,
actual 200. (3) Complete WebAuthn with the attacker's device, `POST …/register/verify` → actual `{status: "active"}`.
(4) Sign in with that passkey → a full admin session; members, broadcasts and the calling tree (plaintext) are readable.
Encrypted content still needs a device approval.

**Keep:** revocable session cookies with the revocation check and an admin re-read on every call, mirrored in the
Firestore rules; every JSON body through `parseJsonBody` (size cap, strict schema); ids regex-checked; webhooks
constant-time verified; CSV and ICS escaping; fail-closed rate limiting keyed on account and IP; nonce + `strict-dynamic`
CSP with `frame-ancestors 'none'` and the `Sec-Fetch-Site` check; no tokens, emails or ciphertext in any `console.*`;
the assurance pipeline (rules tests, route sweep, gitleaks, CodeQL, production audit at 0).



## 4. Content and copy

Judged against `docs/UI_STYLE.md` "Words". Checked and fine: the board member guide's steps match the code; no "(s)"
plurals, doubled spaces or mixed quote styles; "since 2017" is consistent; the notification and broadcast emails and the
offline page are plain and correct.

| # | Area | Problem | Sev. | Fix (before → after) | Where |
|---|---|---|---|---|---|
| C1 | Document generator letters | **Blank fields print placeholder text into real letters:** "TBD", "TBD location" (15 defaults in 5 templates), "Dear Valued Member", "Esteemed Community Leader", and invented contacts `executive@ghmo.org` / `board@ghmo.org`. The general-meeting letter can read "Our focus will be on Agenda and updates to be shared soon." and "…responding via Please RSVP with the executive team." | High | Render nothing instead of "TBD" or a made-up address (skip the sentence when a field is empty, as the board letter already does for agenda); never default a contact to an address nobody owns (use `getContactEmail()` or leave the line out); rewrite the two broken sentences so each clause is optional. | `src/features/docgen/templates/meetingMemberInvitation.ts:22-35`; `eventHostInvitation.ts:32-36`; `boardMeetingInvitation.ts:30-34`; `bhajanProgram.ts:24-28`; `deathCertificate.ts:28-33` |
| C2 | Site-wide | Three names for one thing: "Gumba Project" on every public page, "GUMBA project" in the admin (nav, title, dashboard, activity), "Gumba project" in docgen placeholders. | Medium | One name everywhere: **Gumba Project** ("Gumba" is a word, not an acronym); update `UI_STYLE.md`. | `adminNav.ts:57`; `gumba-project/page.tsx:72`; `AdminDashboardOverview.tsx:63`; `adminView.ts:110-112`; docgen templates; `docs/UI_STYLE.md:59` |
| C3 | Edit / New event | "Flyer template name (optional) — only needed if a custom flyer template was set up" is saved but nothing reads it; "was set up" implies a hidden step. | Medium | Remove the field (keep the stored property harmless). | `EventForm.tsx:127-128` |
| C4 | Encryption | Two words for one act: "Revoke" (16 uses) vs "Device removed" / "removed a device" / "remove it"; "Rotate keys" vs "make new keys". | Medium | "Remove" for devices and "make new keys" for keys, everywhere (panel, badge, activity, confirm dialogs, toasts). | `EncryptionPanel.tsx:354-670`; `EncryptionStatusBadge.tsx:23`; `adminView.ts:120-122` |
| C5 | Admin chat, Plans & Issues, Topic | "Firebase is not configured." (×3) names a vendor and gives nothing to do. | Medium | "This page can't connect right now. Try again in a moment; if it keeps happening, tell whoever manages the website." (log the detail to the console). | `AdminChatClient.tsx:35`; `CommsBoardClient.tsx:60`; `CommsThreadDetailClient.tsx:69` |
| C6 | Public signing page | A witness sees "Session not found.", "Unable to load session.", "Failed to submit (500)". | Medium | "This signing link isn't valid." / "We couldn't open this signing link." / "Your signature couldn't be sent. Try again, or ask the person who sent the link for a new one." | `app/(sign)/sign/[sessionId]/page.tsx:49-166` |
| C7 | American English | "cancelled" (5 visible), "recognised/recognise" (3, while 4 others say "recognize"), "programme", "Grey", "acknowledgement", "tick/ticks" (11), "straight away" (2), "agree a conclusion" (2); day-month example dates ("12 October", "15 November"); "..." (4) vs "…" (50); "e.g.," (1) vs "e.g." (21). | Low | canceled, recognize, program, gray, acknowledgment, check, right away, agree on; "October 12"; "…"; "e.g.". | `statusBadges.ts:22`; `DocBuilder.tsx:590,807`; `BroadcastDetailClient.tsx:223,271`; `adminView.ts:100`; `members.ts:137`; `DeviceSetupForm.tsx:66`; `EventForm.tsx:74`; `weddingCertificate.ts:153`; `CallingTreeClient.tsx`; `MembersClient.tsx`; `MyCallsClient.tsx:169`; `onboarding/page.tsx:47`; `edit/page.tsx:162`; comms pages; `BroadcastsClient.tsx:64,74`; `CallCampaignsClient.tsx:177`; `login/page.tsx:60,181`; sign page `:235`; `AdminChatClient.tsx:191`; `CommsBoardClient.tsx:248` |
| C8 | Casing and titles | "Issuing Authority" vs "Issuing authority"; the seeded sample topic says "Admin Chat"; Media's tab title is "Greater Harrisburg Magar Organization \| Media" while every other page is "<Page> · GHMO"; Verify's title lacks "· GHMO". | Low | One casing; "Media · GHMO"; "Verify a certificate · GHMO". | sign page `:20`; `comms/seed/route.ts:22-23`; `multimedia/page.tsx:6`; `verify/[code]/page.tsx:17` |
| C9 | Document generator | Signature step: "No session", "Signed ✓", "Re-request". | Low | "Not requested yet", "Signed", "Request again". | `DocBuilder.tsx:586-596` |
| C10 | Calling tree, Meeting minutes | Toast shows an internal version ("saved (v3)"); approved-version rows end with "fingerprint 3f9a0c…". | Low | Drop the version and the hash (or label it "record code"). | `CallingTreeClient.tsx:147`; `MinutesEditorClient.tsx:941` |
| C11 | Toasts from API errors | Terse or technical server messages reach the screen: "Too many attempts" (no wait time), "Unavailable", "Unknown or inactive encryption device.", "Payload too large", "Invalid JSON", "Request failed". | Low | "Too many attempts. Wait a few minutes and try again."; "Sign-in settings can't be loaded right now."; "This device isn't set up for encryption, or was removed. Open Encryption to check."; client fallback "Something went wrong. Try again." | `api/auth/totp/*`, `api/admin/totp`, `api/admin/passkeys`, `api/admin/call-campaigns`, signing finalize |
| C12 | Search / link previews | The default description says "…with fundraising, multi-media, and admin tools." | Low | "The Magar community of Greater Harrisburg, Pennsylvania: events, meeting minutes, videos and the Gumba Project." | `src/lib/siteMetadata.ts:6` |
| C13 | Member sign-in | Finishing the email link can open a bare browser `window.prompt("Confirm your email…")`. | Low | An in-card "Confirm your email" field and "Finish signing in" button, as the admin flow does. | `login/page.tsx:64-67` |
| C14 | Dashboard quick actions | Three blurbs don't describe the pages ("Track project updates and tasks", "Create formatted letters quickly", "Browse saved PDF documents"). | Low | "Fundraising progress and the minutes behind it." / "Letters, invitations and certificates on GHMO letterhead." / "Letters and certificates you saved." | `AdminDashboardOverview.tsx:61-63` |
| C15 | Error page | "pass on the reference code below" doesn't say to whom. | Low | "email us and include the code below" (contact email when set; else "tell a board member"). | `RouteError.tsx:26` |
| C16 | Document generator letters | Board/leader/member invitations read like corporate memos ("continued governance and strategic direction", "align on operational decisions", "collective impact"). | Low | Plain, warm rewrite ("Your voice matters in the decisions we make together."). | `boardMeetingInvitation.ts:43-52`; `eventHostInvitation.ts:48-58`; `meetingMemberInvitation.ts:34-35` |
| C17 | Encryption | The "device list isn't sealed yet" note reads alarming and says "database". | Low | Calm wording that explains what sealing does and the next step. | `EncryptionPanel.tsx:226-231` |
| C18 | Board member guide | "Another board member approves your device" vs "admin" everywhere else. | Low | "Another admin approves your device." | `onboarding/page.tsx:38` |

**Keep:** the "What is this?" explainers; empty states and next-step cards that link onward; activity sentences with
names; the public pages' warm, specific copy; confirm dialogs that name the consequence and buttons that say what happens.
