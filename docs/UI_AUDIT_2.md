# UI layout audit 2 (Phase 10-C) · 2026-11-02

A fresh pass over the site after Upgrade 1 (plan §13), with the same method as Audit 1 (`npm run ui:screens`: phone
375 px, tablet 768 px, desktop 1280 px, light and dark), plus states Audit 1 never saw: open phone menus, and the admin
pages with end-to-end encryption on, both locked (right after a page load) and unlocked. 268 screenshots; none scrolls
sideways (Audit 1: 3 pages did). Four reviewers: public pages, admin governance + shell, admin community + security, and
consistency across the whole admin console. Each verified the Audit 1 rows for their pages and looked for anything new.

Severity as in Audit 1. Finding ids: **P** public, **A** admin governance and shell, **S** admin community and security,
**C** consistency across the admin.

<!-- SUMMARY -->

---

## 1. Public and member pages

### Audit 1 rows

All §1 public bugs (B1, B3–B6) **resolved**. §3 and §4 rows **resolved** except:

| Audit 1 row | Status | What remains |
|---|---|---|
| Selected tabs/chips vanish in dark | Partly | The selected `Segmented` chip is darker than its track in dark mode (P15). |
| Off-scale type / one card style | Partly | No arbitrary sizes left, but page widths and title sizes differ between pages (P8); a few `rounded-2xl`/`rounded-lg` leftovers. |
| Home is not the organisation's own site | Partly | Structure done (hero, About, events, Gumba, Follow us); the first screen still reads as a template (P1). |
| Footer | Partly | Themed `<footer>`, pinned to the bottom; no contact (P3). |
| Donate stats and prose | Partly | While closed, the stats card contradicts the page (P4). |
| Verify dead end; unsubscribe bad link | Partly | "Ask a GHMO board member" / "Email us" have nowhere to point (P3). |
| Touch targets | Mostly | The phone menu's close button is ~28 px (P14). |

### New findings

| # | Page | Problem | Sev. | Fix | Where |
|---|---|---|---|---|---|
| P1 | Home | Doesn't yet feel premium or like the organisation's own site: the logo appears four times in the first screen (header, a 144 px logo, the two-line name, the Akkha script), all centred in a pale boxed card; no image although `/assets/Ghmo-building.png` exists; the "language, culture and traditions" sentence repeats three times; a facts card repeats the hero and footer; "Follow us" is a lone quarter-width YouTube tile that duplicates the footer. | Medium | Two-column hero from `lg` (eyebrow "Harrisburg, PA · since 2017", h1, smaller Akkha line, sentence, buttons) with an image slot (building artwork now, a community photo later); drop the big logo and the boxed card; delete the facts card; hide "Follow us" when there is one profile and no posts. | `app/(public)/page.tsx:16-131`; `HomeMultimediaSection.tsx:21` |
| P2 | Header | "Gumba Project" and the Donate button both go to `/donate`; on `/donate` the button shows no current state; the most prominent button on every page says "Donate" but lands on "Donations open soon". | Medium | One menu entry for the page; label the button "Support the Gumba" until `getDonateUrl()` returns a link; `aria-current` on `/donate`. | `publicNav.ts:7`; `CommunityHeader.tsx:63-119`; `SiteShell.tsx:51` |
| P3 | Site-wide | No way to contact GHMO anywhere (Verify, the events error, the board-tool page and unsubscribe all point to "a board member" with no route). | Medium | Owner supplies a contact email (and Facebook if wanted); footer "Contact" column; those lines become `mailto:` links. | `SiteFooter.tsx`; `verify/[code]/page.tsx:89`; `c/[orgSlug]/events/page.tsx:105`; `document-generator/page.tsx:17`; `unsubscribe/page.tsx:39` |
| P4 | Donate | While closed, the card says "Be the first to give" though giving isn't possible, "6-month campaign" beside "Time left: Ongoing", and holds one lonely stat. | Medium | With no link and $0: "Fundraising starts soon", one line on what it will build, no stats; "Be the first to give" only when the link is set; hide "Time left" without an end date. | `donate/page.tsx:86-154` |
| P5 | Donate | "Donations open soon" is a dead end. | Medium | Secondary actions under the notice: "See upcoming events", "Watch us on YouTube" (and "Email us" once P3 exists). | `DonateAction.tsx:25-32` |
| P6 | Home | The Gumba strip's "Donations open soon" is bare bold text beside an outline button, unlike the notice on Donate. | Low | Reuse `DonateAction`. | `app/(public)/page.tsx:114-126` |
| P7 | Media | A top-level menu item that shows one YouTube tile under "Videos, photos and news". | Medium | Until a feed has posts: "Watch our programmes on YouTube" with one large featured card, or leave Media out of the menu. | `MultimediaHomeContent.tsx:12-31`; `publicNav.ts:9` |
| P8 | All public | Page frame differs per implementer: title left edge at 1280 px is x=88 (Events, Media), 192 (Donate), 256 (Minutes, event, guide) or 352 (Verify, board-tool page), so opening an event moves the title 168 px; titles `2xl/3xl` to `3xl/4xl`; one uppercase eyebrow; section titles `text-xl/2xl` on home and Donate but `text-lg` elsewhere. | Medium | `PublicPageHeader` (eyebrow, h1, one sentence, actions) and a `PublicPage` wrapper with `wide` and `reading` widths aligned to the header; one section-title class. | events, media, minutes, event, donate, onboarding, verify, board-tool pages |
| P9 | Home vs Events | Two event card designs (home's has no time zone, smaller summary, different hover); "Flyer (PDF)" vs "Download flyer (PDF)". | Medium | Compact `EventCard` on home; one label. | `UpcomingEvents.tsx`; `EventCard.tsx` |
| P10 | Admin sign in | Links say "Board member sign in" but the page says "Admin sign in" / "Admin email"; no `<h1>`; help text repeats the description; no route to the guide for first-timers. | Low | `<h1>` "Board member sign in", label "Email", shorter help, "First time? Read the board member guide". Every step kept. | `AdminLoginClient.tsx:185-205`; `login/page.tsx:184-187` |
| P11 | Member sign in | Nothing links to `/login`; it never says who it's for; placeholder domains differ (`.com` vs `.org`). | Low | One sentence of purpose (owner decides the audience); one placeholder. | `login/page.tsx` |
| P12 | Message pages | "Can't help you here" pages are built five ways (board-tool page, unsubscribe, unavailable event, 404, error page); Verify's results are hand-built boxes and its only form button is outline. | Low | One message-page component; Verify results via `Alert`; "Check code" primary. | as listed |
| P13 | Missing records | Likely unstyled 404 for missing records (`/minutes/<bad-id>`): no `not-found.tsx` in the route groups, and `global-not-found` covers unmatched URLs only. | Medium | Shared 404 body; `not-found.tsx` in `(public)`, `(member)`, `(auth)`, `(docs)`. | `minutes/[id]/page.tsx:32`; `app/global-not-found.tsx` |
| P14 | Phone menus | The sheet close button is ~28 px at 70% opacity. | Medium | 44 px, full opacity, labelled. | `src/components/ui/sheet.tsx:45-46` |
| P15 | `Segmented` (shared) | In dark mode the selected chip is darker than its track, so it looks pressed in; the track uses a third radius. | Medium | Selected `bg-primary/15 ring-1 ring-primary/40` (tokens); track `rounded-md`. | `src/components/ui/segmented.tsx:29,41-45` |
| P16 | Events list | Desktop list cards ~1100 px wide with content in the left 40%. | Low | Cap list view at `max-w-3xl` or default to grid from `lg`; flyer beside "View details". | `events/page.tsx`; `EventCard.tsx` |
| P17 | Event detail | Order reads facts → buttons → summary; past events re-render minutes in a second layout. | Low | Title → when/where card → summary → buttons; "Read the minutes" link. | `events/[eventId]/page.tsx` |
| P18 | Header | At 768 px the bar is "GHMO" plus three controls, ~60% empty. | Low | Inline links from `md` when signed out, or a visible "Menu" label. | `CommunityHeader.tsx` |
| P19 | Header | Round theme toggle between square buttons (also in admin). | Low | `rounded-md`. | `ThemeToggle.tsx:19` |
| P20 | Footer | Tall sparse columns on desktop (44 px rows); lone social icon box. | Low | `md:min-h-8` links (44 px on phones); icons inline; Contact column (P3). | `SiteFooter.tsx` |
| P21 | Home, event | Stacked phone buttons at ragged widths; "See all events" wraps indented. | Low | `w-full sm:w-auto`; `-ml-3` on the ghost link. | `page.tsx`; `UpcomingEvents.tsx`; `events/[eventId]/page.tsx` |
| P22 | Polish | Minutes empty state ends with a full stop and has no link; onboarding's uppercase eyebrow and margins; British and American spellings mixed. | Low | No full stop + action; sentence-case eyebrow, `gap`; one spelling. | `minutes/page.tsx:31`; `onboarding/page.tsx`; `document-generator/page.tsx` |
| P23 | Events calendar | Month-cell event names truncated at 12 px, full name only on hover. | Low | `line-clamp-2`, no `truncate`. | `EventsCalendar.tsx:106-113` |

**Strengths to keep:** admin sign-in order (email first, passkey optional with one plain line); the Events page (labelled
filters, whole-card links, date tiles, agenda list on phones); the header and phone menu current-page marker; finished
light and dark modes; calm, plain copy (Donate story and pull-quote, the board member guide, "This link doesn't work").

<!-- ADMIN -->
