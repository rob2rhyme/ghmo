# Audit round 3: layout, performance, security, content · 2026-11-03

Four fresh audits of the site as it stands after round 2's fixes (PR #80) and the speed pass (local commits on
`claude/elegant-hypatia-klg5se`, not yet merged). Method: 334 screenshots and the axe scan from the speed pass's
verification run, Lighthouse on 8 pages (re-measured, see §2a), `npm audit`, the production build, and four reviewers
reading the code: layout (fresh eyes), performance, security, content and copy. Every High and Medium finding below was
checked against the code by the lead before it went into this document. Each finding cites the file and line.

**Severity.** High: would hurt a real visitor or admin or the organisation (data, money, trust, lockout), or a clear
regression. Medium: fix before or soon after launch. Low: polish.

## Summary

**Where the site stands.** Accessibility 100 and 0 axe violations on every page; dark mode finished; production
dependencies at 0 known vulnerabilities (the 19 moderate alerts are all dev-only, via `minimatch`). The speed pass holds
up under review: the public cache only ever holds published events, approved minutes and totals; every in-app write
that changes public data expires its cache tag; the per-render session memo keeps every check; admin pages check the
session before reading. Round 2's S1, S3, S4, S6, S8, S12–S14 and S16 fixes hold.

**What this round found: 58 findings** (layout 17, performance 13, security 11, content 17), 4 High, 21 Medium, 33 Low.
All four Highs are in what the community sees:

| # | High | Why it matters |
|---|---|---|
| C1 | Every wedding certificate prints "Issued by: Magar Community Council / Magar Samaj / Association Name" unless an admin retypes it. | A placeholder on GHMO's most formal document. Round 2's placeholder fix (C1) missed this template. |
| C2 | The wedding certificate always prints a "Community Recognition (Interethnic Marriage)" section, and "Magar" is not an option for the bride. | Wrong for a Magar–Magar couple, the most common case. |
| C3 | The certificate calls the marriage "lawful", then says it doesn't replace civil registration "unless permitted by law". | Someone could rely on it for immigration or benefits. The Nepali note already says it plainly. |
| C4 | "Download flyer (PDF)" is shown to every visitor, but the flyer needs a signed-in member: visitors get a page reading `{"error":"Unauthorized"}`. | A broken button on every public event. |

Then the Mediums that matter most: member sign-in's second route still skips round 2's verified-email check (S1);
the admin session can outlive its 8 hours through the browser's Firebase sign-in (S2); the encryption client can be
switched to plaintext from the server without any device noticing (S3, before the outside crypto review); a build-time
read failure would publish an error page as the cached copy (P1); and two regressions from round 2's layout fixes on
phones and tablets (L1, L2).

**Correction to the speed pass.** Its Lighthouse table measured Home, Donate and Minutes on the "can't be read"
versions prebuilt without Firebase settings, not on real content. §2a re-measures them on a build that read real data.

**Needs the owner:** who may see the event flyer (C4, recommendation: everyone, since it only covers published
events); a review of the wedding certificate's community list with elders (C5); one line on what a Gumba is for the
Donate page (C9). Still open from before: the GoFundMe link, the contact email, photos, turning off password sign-in.

## Fix plan (round 3), in order

1. **Community-facing Highs:** wedding certificate version 2 (C1–C3, C6, and C5's label and mislabels; the list itself
   waits for the board), with tests; the flyer (C4).
2. **Security Mediums:** S1 (post-auth), S2 (`auth_time`, Bearer, in-memory persistence), S3 (fail closed when a
   pinned device sees encryption off or an empty log, with tests), S5 (delete the unused event-minutes API), S4
   (long-window lockout for wrong authenticator codes).
3. **Performance:** P1 (fail the build instead of publishing an error page when settings are present), P2
   (`expireTime`), P3 (logo `sizes`), P4 (events pages into the public layout, cached), P5 (no prefetch across root
   layouts or on the admin sidebar).
4. **Layout regressions and states:** L1, L2, L3, then the Lows.
5. **Wording pass:** C7–C12, then the Lows; re-run screenshots, axe and Lighthouse.

## Status after the fix pass (2026-11-03)

The owner said "fix all". Defaults taken where the owner had not answered: the event flyer is public (C4); the wedding
certificate's community list gains "Magar" and "Other", loses "जात", fixes two labels and becomes optional, while the
list itself waits for the board and elders (C5); the Donate page's line on what a Gumba is reuses the site's own words
and is marked for the board to confirm (C9).

**Fixed: 55 of 58.** Partly: L17 (past events are now seeded and captured; empty and failed lists still can't be),
P9 (ids are checked before the cache; "not found" is still cached, because the page cache would store it anyway).
Deferred: L8 (the Donate artwork waits for the owner's photos).

- **Security (all 11):** S1 `post-auth` links a member record only after the same verified-email and same-account
  check as the session route. S2 a session cookie is minted only from a sign-in under 5 minutes old; Bearer tokens are
  no longer accepted; the browser's Firebase sign-in lives in memory only; the custom token carries the session's expiry
  (`sessionExp`) and the Firestore rules end database access with it (with a rules test). S3 a device that has pinned
  the device list treats "encryption off" or an empty list as an integrity failure, and never writes plaintext after one
  (unit tests; the gate shows the failure first). S4 20 wrong authenticator codes in a day lock code sign-in until a
  super admin resets it, with an audit entry and a notice to opted-in admins (browser test). S5 the public
  event-minutes API is deleted (its test moved to the archive page) and the event page caches only the minutes' id.
  S6 cache expiry right after each data write; the public events API and calendar feed keep a CDN copy for one minute,
  never stale. S7 visitors get a public event shape (no creator uid, no flyer settings). S8 emailed and signing links
  use only the configured address in production. S9 no env names or raw database text in responses. S10 every shared
  admin read takes the caller's admin check as a required argument. S11 `img-src` no longer allows googleusercontent.
- **Performance:** P1 a build with Firebase settings fails instead of publishing an error page. P2 `expireTime: 3600`.
  P3 the logo is fetched at its drawn size. P4 the events list and event page live in the public layout, cached for 5
  minutes like Home, with the admin-only minutes controls loaded in the browser; Home → Events is no longer a full
  reload. P5 no prefetch across root layouts or on the admin sidebar. P6 `fetchPriority="high"` on both heroes,
  `sizes` on the Akkha images. P7 a readable sign-in hint cookie (no secret) lets visitors skip `/api/auth/me`; the
  route verifies once and reuses the guard's profile. P8 minutes detail is cached on first visit; `/gumba-project` is a
  config redirect; the document-generator message is static. P10 the calendar and flyer use the cached loaders; the
  flyer is CDN-cacheable for a minute. P11 upcoming and past events are read separately (the 100 most recent past
  events), undated ones by name, and the archive reads every approved record. P12 the GoFundMe Pro snippet loads on
  Donate only, lazily. P13 the device-list request is skipped when this tab last saw encryption off.
- **Layout:** all but L8, as in the table (L17 partly).
- **Content:** all 17. Still for the board: proofread the certificate's Nepali text and review its community list.

**Testing change.** The browser suites now run with the public cache on, exactly as production does; the shared
reset (`clearEmulators`) also expires it through `/api/test/expire-public-cache`, a route that exists only in emulator
builds and answers 404 in every real build. Before, the cache was off in the test build, which also hid a real
problem: a cached page with an id in its URL can't switch to per-request rendering at runtime.

**Release note.** Deploy the site before the Firestore rules: the new rules need the `sessionExp` claim that only the
new site adds (`docs/GO_LIVE_CHECKLIST.md`). Changing `CONTACT_EMAIL` or the GoFundMe link now takes a redeploy, since
more pages are built ahead of time.

**Rerun after the fixes** (every suite on the final code): typecheck clean; lint 62 warnings (cap lowered to 62); 346
unit tests; 98 emulator tests (rules, auth integration); 224 browser tests; 370 screenshots and the axe scan at 0; the
production build and its 43 browser tests; the cache check on a normal build (an admin write shows at once, a direct
database write stays hidden, the events list and event page are CDN-cacheable, visitors get no sign-in hint cookie,
the flyer downloads for visitors and an unknown one is a plain 404): 15 of 16 pass, and the one miss was the check
script still looking for the old "couldn't be loaded" wording. Lighthouse on a build that read real data, phone:

| Page | Round 2 audit | Round 3 audit (real data) | After round 3 fixes |
|---|---|---|---|
| Home | 50 | 94 | **90** |
| Donate | 59 | 98 | **84–94** (three runs; the hero picture on a slow connection) |
| Events | 58 | 95 | **99** |
| Minutes | 51 | 99 | **100** |
| Media | 80 | 94 | **94** |
| Board guide | 78 | 99 | **97** |
| Admin sign-in | 72 | 94 | **99** |
| Member sign-in | 78 | 97 | **97–100** (see below) |

Desktop is 100 on every page; page weight is down another 30–70 KB on each (the logo). SEO on the two sign-in pages is
63 by design: they are now marked "don't index". **Open item:** the member sign-in page showed a 0.29 layout shift (the
footer moving) in 2 of 9 phone runs, with no cause recorded and no late request; a focused probe with a throttled phone
saw none. Worth watching in production (Vercel Speed Insights) before chasing further.

---

## 1. Layout (fresh eyes)

| # | Area/page | Problem | Severity | Fix | Where |
|---|---|---|---|---|---|
| L1 | "Encryption is off" strip, every gated admin page, phone | **Regression from R2 L11.** With "Turn it on" and "What's this?" inline, the sentence is squeezed into a ~100 px column (four lines). The text span is `flex-1 min-w-0`, so the row never wraps. | Medium | `basis-full sm:basis-auto` on the text so the links drop under it; `rounded-xl`/`rounded-md` instead of `rounded-lg`. | `src/components/admin/encryption/EncryptionGate.tsx:51-57` |
| L2 | Home "Next events", tablet | **Regression from R2 L16.** Three ~230 px cards leave ~110 px for text: titles break per word, the date takes three lines, the "·" hangs at a line end. | Medium | `lg:grid-cols-3` (one column or two at `md`), or stack the date tile in compact cards. | `src/components/public/UpcomingEvents.tsx:37`; `src/components/public/events/EventCard.tsx:46-50,68` |
| L3 | Event page, past event | It still leads with "Add to calendar", says nothing about being over, and every past event (a football day too) shows "Meeting minutes · No minutes recorded for this event yet." | Medium | A "This event has passed" line; no primary "Add to calendar"; the minutes card only when minutes exist or the viewer is an admin. | `app/(member)/c/[orgSlug]/events/[eventId]/page.tsx:92,132-186` |
| L4 | Events list, Past and All | Past and upcoming cards look the same; "All" starts with the oldest past event. | Low | A "Past" badge or muted tile; upcoming first, then past newest first. | `EventCard.tsx:38-98`; `EventsClient.tsx:52` |
| L5 | Dashboard "Recent minutes" | **R2 L12 incomplete:** the list still ends in an empty band, because a hidden phone-only button is the card's last child. | Low | Put the phone link before the list or in the header. | `AdminDashboardOverview.tsx:233-249`; `AdminList.tsx:18` |
| L6 | Dashboard "Recent minutes" rows | Both rows open the Records list, not their record. | Low | Link to `/admin/minutes?minutesId=<id>`. | `AdminDashboardOverview.tsx:239` |
| L7 | Media featured card | **R2 L7 incomplete:** the thumbnail branch can never run (the card only shows when no feed has items), so it always shows the home artwork with a play button over it. | Low | Drop the play glyph without a thumbnail, or read the channel's thumbnail first. | `MultimediaHomeContent.tsx:28-30,59-60` |
| L8 | Donate hero | R2 L6's crop is the same scene at 16:9; Home and Donate still look identical. | Low | A real building crop, or wait for photos. | `app/(public)/donate/page.tsx:64-73` |
| L9 | Minutes archive, "can't be shown" | The new state looks like "none yet", with no Try again. | Low | `Alert` with `RefreshButton` and the contact email. | `app/(public)/minutes/page.tsx:30-35` |
| L10 | Event page, minutes read failure | A failed read shows "No minutes recorded for this event yet.", which is untrue. | Low | Return `undefined` on failure and say the minutes can't be shown. | `src/lib/publicData.server.ts:83-85` |
| L11 | Events pages, loading | Only the generic page skeleton, then a jump to a narrow list or reading page. | Low | Route `loading.tsx` shaped like each page. | `app/(member)/c/[orgSlug]/loading.tsx` |
| L12 | Events list, load failure | The Show and View switches and the calendar button stay above the error. | Low | Hide them when loading failed or there are no events. | `EventsClient.tsx:65-79` |
| L13 | Event cards | The "·" separator hangs at the end of the date line. | Low | Put it inside the nowrap time span. | `EventCard.tsx:68` |
| L14 | Plans & Issues, first run | **R2 L8 incomplete:** with no topics the form opens and the header's "New topic" stays: two primaries. | Low | Hide the header button while the form shows. | `app/(admin)/admin/comms/page.tsx:34`; `CommsBoardClient.tsx:200` |
| L15 | Broadcasts, new draft | The placeholders are a complete announcement, so the form looks pre-filled. | Low | Short placeholders; the example as help text. | `BroadcastsClient.tsx:64,74` |
| L16 | Admin sidebar | Group labels are ALL CAPS, against UI_STYLE. | Low | Sentence case, or record an exception. | `src/components/admin/shell/AdminShell.tsx:47` |
| L17 | Screenshot coverage | No past event, empty or failed events list, live campaign or minutes error is ever captured; L3, L4, L9 and L12 were found from code only. | Low | Seed a past event (with and without minutes) and capture those states. | `tests/ui-audit/screenshots.spec.ts:18-34` |

## 2. Performance

| # | Area | Problem | Severity | Fix | Where |
|---|---|---|---|---|---|
| P1 | Cached pages at build | `cachedPageData` returns null during the build for any failure. A Vercel build that fails one read (Firestore hiccup) publishes the "can't be read" page as the cached copy for at least 5 minutes, longer on a quiet site. The speed pass's own Lighthouse numbers for Home, Donate and Minutes came from such pages (§2a). | Medium | Return null at build only when the Firebase admin settings are missing (CI); when they are present, throw so the deploy fails instead. | `src/lib/publicCache.server.ts:62-76` |
| P2 | Cached pages, quiet periods | Next's default expiry is a year, so the first visitor after a quiet weekend gets the old page while a new one builds: Home can show last Saturday's event as "next", Donate a stale "time left". The data cache is stale-while-revalidate, so a console edit can take ~10 minutes, not 5 as documented. | Medium | `expireTime: 3600` (or lower) in next.config; correct the docs. | `next.config.mjs:20-36`; `publicCache.server.ts:40`; `docs/AUDIT_ROUND_2.md` |
| P3 | Logo, every page | **R2 P8 incomplete:** `ThemeLogo` is 240 px with no `sizes`, so phones download a 640 px copy (~129 KB) for a ~48 px slot: the largest file on every phone page. | Medium | `sizes="48px"` (or a 96 px WebP). | `src/components/ThemeLogo.tsx:18-19` |
| P4 | Events list and event page | **R2 P7 incomplete:** server-rendered now, but still under the secure root layout (`private, no-store`, nonce): every view runs a function, cold starts show (66 on a first hit), and Home → Events is a full reload across root layouts. | Medium | Move both pages into `(public)` (list cached like Home; event page `generateStaticParams() { return [] }`), and show the admin-only minutes controls from the browser's existing session check. | `app/(member)/c/[orgSlug]/events/**`; `src/lib/security/csp.ts:11` |
| P5 | Link prefetching | Public pages prefetch Events, Board sign in and Board guide, which render per request in other root layouts, so the result is never used. 16 admin sidebar links prefetch, each running the admin layout's session check. | Medium | `prefetch={false}` on links that cross root layouts and on the admin sidebar. | `SiteFooter.tsx:10-19,75,87`; `CommunityHeader.tsx:55,101`; `AdminShell.tsx:56` |
| P6 | Hero and Akkha images | Next 16's `priority` preloads but doesn't set `fetchpriority="high"`; the Akkha image has no `sizes` (fetched at 3840 px for ≤384 px). | Low | `fetchPriority="high"` on both heroes; `sizes="384px"` on the Akkha images. | `app/(public)/page.tsx:29-30,53-60`; `donate/page.tsx:66-74` |
| P7 | `/api/auth/me` | Called on every full page load; for admins it verifies the cookie twice and re-reads the admin record. | Low | Reuse the guard's profile; skip for visitors without a session hint. | `app/api/auth/me/route.ts:10-62` |
| P8 | `/minutes/[id]`, `/gumba-project`, `/document-generator` | Minutes detail renders per request (no `generateStaticParams`); a redirect and a fixed message are `force-dynamic`. | Low | `generateStaticParams = () => []`; redirect in next.config; drop `force-dynamic`. | `app/(public)/minutes/[id]/page.tsx:7`; `gumba-project/page.tsx:3`; `document-generator/page.tsx:8` |
| P9 | Cache keys | Any id in the URL makes a data-cache entry (the format check is inside the cached function); an unknown event costs 3 sequential reads. | Low | Check the id first; don't cache "not found". | `src/lib/publicData.server.ts:48-58`; `src/lib/events.ts:54-60` |
| P10 | Calendar and flyer downloads | The calendar routes don't use the cached loaders; the flyer PDF reruns pdfkit and Firestore on every download (no-store). | Low | Use the loaders; `public, s-maxage=300` on the flyer. | `app/api/calendar/**`; `announcement.pdf/route.tsx` |
| P11 | Growth limits | Events are read oldest first with `limit(200)`, so past 200 the upcoming ones drop off; the archive takes 300 with no order. | Low | Query upcoming and past separately; order the archive. | `src/lib/events.ts:119-120`; `minutesArchive.server.ts:8` |
| P12 | GoFundMe Pro snippet | Once set, it runs on every public page, not just Donate; its cost is unmeasured. | Low | Load it on `/donate` only, `lazyOnload`. | `app/(public)/layout.tsx:15-21` |
| P13 | Encryption gate | The device-log request runs even when encryption is off (answer discarded). | Low | Acceptable once encryption is on; otherwise skip it. | `E2eeProvider.tsx:174-180` |

Event payload size (all fields of every event in the page) and the order of cache expiry in write routes are listed
once, under S7 and S6.

### 2a. Lighthouse (re-measured)

The speed pass measured Home, Donate and Minutes on the "can't be read" pages its build had prebuilt without Firebase
settings (P1). These numbers come from a build that read real data (the screenshot run's sample events and minutes),
the way a Vercel build with its settings does, with one warm-up request per page. Phone scores:

| Page | Round 2 audit | After round 2 fixes | Speed pass (as reported) | Re-measured, real data |
|---|---|---|---|---|
| Home | 50 | 80 | 88 | **94** (83, 94, 96 over three runs) |
| Donate | 59 | 84 | 97 | **98** |
| Events | 58 | 87 | 99 (66 cold) | **95** |
| Minutes | 51 | 83 | 99 | **99** |
| Media | 80 | 92 | 98 | **94** |
| Board guide | 78 | 99 | 99 | **99** |
| Admin sign-in | 72 | 99 | 99 | **94** |
| Member sign-in | 78 | 97 | 97 | **97** |

Desktop is 100 on every page. Phone largest paint: Home 2.6–4.0 s (the hero picture on a slow connection, P3 and P6),
Donate 2.2 s, Media 2.8 s, everything else under 1 s. The batch run's first page, Home on a phone, scored 47 while the
machine was still busy from the build (1.7 s to parse a 13 KB stylesheet); three reruns scored 83, 94 and 96. So the
speed pass's conclusions hold with real content, but its table was measured on the wrong pages, and P1 is a real risk
for deploys.

## 3. Security

The speed pass was the first priority: no cached loader can hold non-public data, the per-render session memo keeps
every check, the event page is never shared (`private, no-store`), and every admin page checks the session before it
reads. Round 2's S1, S3, S4, S6, S8, S12, S13, S14 and S16 hold; S5 is moot (`internalFetch` is gone); S2 and S9 are
incomplete (S1 and S9 below); S11 is slightly loose (S11 below). Deferred rows (S7, S10, S15, S16 pinning, S18) keep
their severities.

| # | Area | Problem | Severity | Fix | Where |
|---|---|---|---|---|---|
| S1 | Member sign-in (**R2 S2 incomplete**) | `post-auth` still accepts any Firebase token (no verified-email, provider or revocation check) and binds the member record to that account's uid. With password sign-up on, someone who registers with a member's email can claim the record and lock the real member out. | Medium | `hasTrustedMemberEmail` and `verifyIdToken(token, true)` before binding, or bind only in `/api/auth/session` after `findActiveMember`; add a test. | `app/api/auth/post-auth/route.ts:23,38-46` |
| S2 | Admin session lifetime | The admin browser's Firebase sign-in (custom token with `authMethod: passkey/totp`) persists, so its refresh token keeps minting ID tokens after the 8-hour cookie expires. Those tokens work as `Authorization: Bearer` on admin APIs and can be swapped at `POST /api/auth/session` for a fresh strong cookie: `createSessionResponse` doesn't check `auth_time`, though its comment says it does. | Medium | Refuse ID tokens older than 5 minutes (`auth_time`) when minting a cookie; drop or cap the Bearer path; in-memory persistence for the admin Firebase client. | `src/lib/sessionCookies.ts:22-29`; `src/lib/auth.ts:58-61`; `FirebaseAdminAuthBootstrap.tsx:42,64` |
| S3 | Encryption (threat T4) | Someone with console or service-account access can, without any device noticing, set `e2ee/state.enabled=false` (new chat, minutes and contacts are then written in plaintext) or empty the device log (status becomes "unsealed", not "failed", even on a device that pinned it). | Medium | Fail closed: a device whose stored identity has a pin treats "off" or an empty log as an integrity failure and refuses to write plaintext; unit tests for both. Before the crypto review. | `E2eeProvider.tsx:188,192,663`; `src/lib/e2ee/roster.ts:318-319` |
| S4 | Authenticator codes | 6 wrong codes per 10 minutes with no long-term lockout: someone with an admin's inbox can keep guessing (~7% a month, ~60% a year). | Medium | A daily cap (e.g. 20 failures in 24 h) that locks the authenticator until cleared, with a notice to other admins. | `app/api/auth/totp/verify/route.ts:26-28` |
| S5 | Public event-minutes API | `GET /api/organizations/ghmo/events/{id}/minutes` returns attendee, absentee and guest names, assignees and who recorded, which the archive deliberately hides. No page uses it since the speed pass. | Medium | Delete the route (move its test to `/minutes/{id}`); cache only what the event page shows. | `app/api/organizations/[orgSlug]/events/[eventId]/minutes/route.ts:61`; `publicData.server.ts:71-78` |
| S6 | Cache expiry order | `expirePublicCache` runs after the audit write: if that throws, an unpublished event stays public up to 5 minutes (and the admin may retry and duplicate it). The CDN copy of the public events API (`s-maxage=300, swr=600`) is never purged. | Low | Expire right after the data write; drop `stale-while-revalidate` on the public events API or document the delay. | admin event and minutes routes; `app/api/organizations/[orgSlug]/events/route.ts:15` |
| S7 | Public event records | Each published event sent to browsers includes `createdByUid` and internal fields, now also in the events page HTML, twice. | Low | Map to a public shape in the loaders and the public route. | `src/lib/events.ts:12-31`; `publicData.server.ts:38,54` |
| S8 | Emailed and shared links | Without `NEXT_PUBLIC_APP_URL` in production, links in magic-link, broadcast, unsubscribe and notification emails use the request Host; signing links use `x-forwarded-host`. | Low | Refuse to send without a configured origin, as WebAuthn now does. | `src/lib/appUrl.ts:17-23`; `app/api/admin/signing-sessions/route.ts:49-55` |
| S9 | Error bodies (**R2 S9 incomplete**) | `post-auth` returns env variable names; the dashboard sends raw Firestore error text in `warnings`. | Low | Remove `missing`; send labels only. | `post-auth/route.ts:56`; `src/lib/adminData.server.ts:41` |
| S10 | Admin loaders | `adminData.server.ts` trusts that callers checked the session; the public event page is now a (guarded) caller. | Low | Take the guard result as a required argument. | `src/lib/adminData.server.ts`; `events/[eventId]/page.tsx:41-49` |
| S11 | CSP `img-src` | `https://*.googleusercontent.com` covers any user-hosted Google content. | Low | The specific host used. | `src/lib/security/csp.ts:49` |

## 4. Content and copy

| # | Area | Problem (current text) | Severity | Fix | Where |
|---|---|---|---|---|---|
| C1 | Wedding certificate | **R2 C1 incomplete:** issuer default and fallback "Magar Community Council / Magar Samaj / Association Name"; still `version: 1`. | High | Default and fallback "Greater Harrisburg Magar Organization"; version 2; a test like the other five templates. | `src/features/docgen/templates/weddingCertificate.ts:160-165,206-208` |
| C2 | Wedding certificate | "Magar" isn't a bride's-community option, and "Community Recognition (Interethnic Marriage)" always prints, assuming the groom is Magar. | High | Magar first; print that section only when the communities differ (add a groom's community field). | `weddingCertificate.ts:54-100,499-516,557-570` |
| C3 | Wedding certificate | "accepted as a lawful and honorable union" … "does not replace civil or governmental marriage registration unless permitted by law". | High | "…accepted as an honorable union within the Magar cultural tradition." Note: "This certificate records community recognition. It is not a legal marriage certificate and does not replace civil marriage registration." | `weddingCertificate.ts:483,516-518` |
| C4 | Events list and event page | "Download flyer (PDF)" for every visitor; the route needs a signed-in member and answers `{"error":"Unauthorized"}`. | High | Make the flyer public (published events only) or show the button only to members; never raw JSON on a public link. | `EventCard.tsx:89-95`; `events/[eventId]/page.tsx:138-143`; `announcement.pdf/route.tsx:25-26` |
| C5 | Wedding certificate | The "दुलहीको जात/समुदाय" (caste/community) list of 42 includes Dalit caste names (one is a slur in India); "Bahun / ब्राह्मण" and "Chetri" are mislabelled. | Medium | Board and elders review the list; label "Bride's community / दुलहीको समुदाय", optional, with "Other"; fix the two labels. | `weddingCertificate.ts:54-100,476-479,536-539` |
| C6 | Wedding certificate | The Nepali section is labelled "मगर / नेपाली (Magar Cultural Language Section)"; "(Optional)" prints; no English title; spelling (समुदायिक, माईती, जेष्ठ); the issuer's signature lands in the seal row. | Medium | "Nepali / नेपाली"; no "(Optional)" in print; English title "Magar Community Marriage Certificate"; proofread by a Nepali-literate board member; a signature row for the issuer. | `weddingCertificate.ts:188,460-465,523,566,581-596,651-655` |
| C7 | Public signing page | **R2 C6 incomplete:** raw server text after Submit ("Session not pending", "Session expired", "Missing or invalid signature data", PNG parse errors); a server outage says "This signing link isn't valid"; the page never says what is being signed; a blank pad can be submitted; two success messages. | Medium | Map status codes to plain messages; "You're signing a wedding certificate from GHMO as Witness 1"; block an empty pad; one success message. | `app/(sign)/sign/[sessionId]/page.tsx`; `app/api/signing-sessions/[sessionId]/**` |
| C8 | Tab titles and link previews | Donate, the event page, signing, both sign-in pages and all admin pages fall back to the site name; "Unsubscribe" alone; no Open Graph tags or preview image, so shared links show generic text. | Medium | Per-page titles ("Support the Gumba Project · GHMO", "<event> · GHMO", "%s · GHMO admin"); `openGraph` and `metadataBase` with the hero image. | `src/lib/siteMetadata.ts:3-14`; pages listed |
| C9 | Donate | "GHMO is planning a 6-month fundraising campaign" stays once totals are live; "mass donation effort"; never says what a Gumba is. | Medium | Wording that stays true once open; one line on what a Gumba is (board to confirm). | `app/(public)/donate/page.tsx:57,156-162` |
| C10 | Memorial notice | Filed as a "Certificate" (id `death-certificate`); "We honor the passing of"; no service time; a corporate remarks example. | Medium | Category "Notice"; "With deep sorrow, we share the passing of…"; a service time field; a gentler example. | `src/features/docgen/templates/deathCertificate.ts:9-21,38-46` |
| C11 | Certificate check | "may be a forgery", "may have been altered" (any re-saved copy fails), and "compare the date" though the page shows the issue time, not the printed date. | Medium | Calm wording that explains only the original file matches; compare the number only. | `app/(public)/verify/[code]/page.tsx:48,55,65`; `VerifyPdf.tsx:24,43` |
| C12 | General meeting letter | The header prints "GHMO Executive Council", a body named nowhere else. | Medium | "Greater Harrisburg Magar Organization". | `meetingMemberInvitation.ts:29` |
| C13 | Other letters | "at … at"; "The ${hostName} warmly invites" breaks with a person's name; "prasadam" (prasad); clipped examples; non-Magar example names; "GHMO-2024-001". | Low | As listed in the reviewer's notes. | `boardMeetingInvitation.ts:34`; `bhajanProgram.ts:31,39,44`; `eventHostInvitation.ts:19,39,46` |
| C14 | Failure states | Three wordings for one problem ("can't be read", "can't be shown", "temporarily unavailable"); "read" is system language. | Low | One pattern: "We couldn't load the events right now. Try again in a moment." | `EventsClient.tsx:87`; `events/[eventId]/page.tsx:61`; `minutes/page.tsx:33-34`; `donate/page.tsx:28` |
| C15 | Toasts (**R2 C11 incomplete**) | "Unknown or inactive encryption device." (3 routes); "Request failed" and "Unexpected response (status)" fallbacks; "Unavailable" JSON on the public calendar link; "Admin env not configured" shown as-is. | Low | The round-2 wordings; a plain calendar error page. | listed in the reviewer's notes |
| C16 | Admin Gumba Project | With encryption on, draft minutes show "0 decisions" (sealed). | Low | Leave the count out for sealed drafts. | `app/(admin)/admin/gumba-project/page.tsx:98,120-130` |
| C17 | Naming polish | "board list" vs "admin list"; "trusted people" vs "trustees"; title-case template names; mismatched gallery categories; a manifest "Admin" shortcut and old description; toast periods. | Low | One term each; sentence case. | `onboarding/page.tsx:17,40`; `templates/*.ts:6-8`; `manifest.ts:9,20` |

## Strengths (keep)

- The public cache holds only public shapes, failed reads are never cached, and every in-app write expires the right tag.
- The per-render session memo and the shared admin reads (no self-calls) are clean; every refusal reason is unchanged.
- Members is list-first at every width; `Steps` wrap on phones; row links show chevrons; public pages share one frame.
- Dark mode is finished, axe reports 0, desktop Lighthouse is 100, public JavaScript is lean (~196 KB gz, no Firebase).
- The five letters fixed in round 2 never print placeholders; names ("Gumba Project", "remove", "topics") are consistent.
