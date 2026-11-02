# UI layout audit 2 (Phase 10-C) · 2026-11-02

A fresh pass over the site after Upgrade 1 (plan §13), with the same method as Audit 1 (`npm run ui:screens`: phone
375 px, tablet 768 px, desktop 1280 px, light and dark), plus states Audit 1 never saw: open phone menus, and the admin
pages with end-to-end encryption on, both locked (right after a page load) and unlocked. 268 screenshots; none scrolls
sideways (Audit 1: 3 pages did). Four reviewers: public pages, admin governance + shell, admin community + security, and
consistency across the whole admin console. Each verified the Audit 1 rows for their pages and looked for anything new.

Severity as in Audit 1. Finding ids: **P** public, **A** admin governance and shell, **S** admin community and security,
**C** consistency across the admin.

## Summary

**Audit 1, checked:** all 8 bugs are fixed, and no page scrolls sideways at any width (268 screenshots). Most Audit 1
rows are resolved; the rest are partly resolved, mainly where a fix landed on some pages and not others.

**What Audit 2 found:** 69 findings (5 High, 41 Medium, 23 Low) and 1 new bug. The site is no longer broken or
developer-facing anywhere; what remains is about *finish*:

1. **One regression:** on phones the admin menu shows only down to "My Calls"; five pages, including Encryption, are
   reachable only by scrolling inside the menu with no hint (A1).
2. **Five builders, five dialects:** 9 list styles, 4 back-link styles, 4 step indicators, two section boxes, the same
   status in different colours, Title Case and sentence case titles side by side (C1–C15).
3. **Encryption after launch:** the Encryption page puts the most technical card first and the actions last (S1); every
   locked page shows two boxes saying the same thing (A2); the "encryption is off" banner is long and worded unlike the
   status pill (A3); several screens still say "device(s)", "key generation", "plaintext", "thread" (S2, S3, C13).
4. **Day-one dead ends that remain:** Broadcasts gives no warning that nobody can be emailed yet (S10); Call Campaigns
   shows a disabled form that looks usable (S6); GUMBA's no-goal state has no next step (S15).
5. **The public site is correct but not yet premium:** the home page reads as a template (P1), the Donate page
   contradicts itself while donations are closed (P2, P4, P5), Media is nearly empty (P7), page widths and title sizes
   differ (P8), and there is no way to contact GHMO anywhere (P3).

**One new bug (B9, needs the owner's go-ahead):** event times can shift by hours, because the edit form and the server
both ignore the event's time zone (§2).

**Needs the owner:** a contact email for the site (P3); community photos for the home page (P1); the go-ahead to fix B9.

## Upgrade 2 plan (10-D), in order

1. **Fix the regression and B9** (with approval): phone admin menu scrolls as one; event times read and saved in the
   event's own time zone, with a browser test.
2. **Shared building blocks, then apply them everywhere:** `AdminList`/`AdminListRow`; `back` on `AdminPageHeader`;
   `AdminSectionCard` = `Card`; one `Steps`; `StatTile` and `ProgressBar`; `src/lib/statusBadges.ts`; a `row` button size;
   one destructive pattern (ghost red + `ConfirmDialog`); `Segmented` fixes (visible selected state in dark, link
   variant for the Minutes tabs); `Field`/`Input`/`Sheet` fixes; one load-error pattern; skeleton instead of the
   Firebase spinner. Public: `PublicPage` + `PublicPageHeader`, one message-page component, `not-found.tsx` per group.
3. **Encryption after launch:** one locked-state card per page; one-line "encryption is off" strip; Encryption page
   reordered with plain wording (every step and warning kept); `e2ee_*` activity sentences.
4. **Day-one guidance:** Broadcasts email warning; Call Campaigns form hidden until the tree is planned; GUMBA next
   step; Document generator preview without "TBD", no ids, compact on phones; Members list first on phones.
5. **Public finish:** home hero with an image slot and no repeated logo; honest closed-Donate state; Media as one
   featured YouTube card until there are posts; shared `EventCard` on home; contact column once the owner gives an
   address.
6. **Wording pass:** sentence-case titles with the nav; "topic"; "unlock/open" instead of "decrypt"; no "(s)", ids or
   env var names; "Download …" labels; "Open <page>" links; one-sentence descriptions.
7. Re-run `npm run ui:screens` (all states), the full test suite and an accessibility check.

---


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

## 2. Admin console: governance pages and shell

### Audit 1 rows

**Resolved:** B2 (edit event: loads, "doesn't exist / couldn't load" states, confirmed delete), B7, white-on-teal, the
Meeting Minutes overflow and blank space, Minutes duplicate controls and jargon, the Events table on phones, new/edit
event fields, sidebar fold on desktop, sidebar at tablet width, dates, skeletons.

| Audit 1 row | Status | What remains |
|---|---|---|
| One button/chip/card style | Partly | Hand-built Minutes tabs, overdue pill, Lock button, jump button; event form uses `Card` where other forms use `AdminSectionCard` (C rows). |
| One page frame / width | Partly | New/edit event centred at `max-w-3xl`, so its title starts 88 px right of every other page. |
| Touch targets | Partly | Preview Fit/100% 32 px, Minutes tabs 40 px, Lock and the status link 36 px. |
| Encryption worded three ways; banner | Partly | Pill fixed ("Encryption is off"); the banner is still 3–5 lines, worded differently, "end-to-end" unexplained. |
| Round theme toggle | Not resolved | Still round beside square controls (also P19). |
| Dashboard activity / two searches / quick actions | Partly | Sign-in entries are sentences; encryption entries are raw; two searches remain; six quick-action tiles push recent lists down on phones. |
| Plans & Issues wording | Partly | Heading says "topic", button and status still say "thread" (kept for tests). |
| Admin Chat height | Partly | With encryption off, the composer starts below the fold on phones. |
| Action Items wording | Partly | Tab still "Done / dropped" beside "Not needed". |

### New findings

| # | Page | Problem | Sev. | Fix | Where |
|---|---|---|---|---|---|
| A1 | Phone admin menu | **Regression:** the pinned footer (user card, encryption pill, Public site / theme / Sign out, ~185 px) leaves room only down to "My Calls"; GUMBA, both Documents pages, Security and Encryption are reachable only by scrolling inside the menu, with no hint. | High | Let the whole sheet scroll as one, or shrink the footer to one row (initials + Sign out) and move theme and Public site into the list. | `AdminShell.tsx:113-130,206-218` |
| A2 | Gated pages, locked | Two boxes say the same thing (an info Alert, then a generic Unlock card that mentions "chat and plans" on every page). | Medium | One card: "{Page} is locked on this device", one plain line, a large "Unlock with passkey" button. | `EncryptionGate.tsx:144-155`; `UnlockCard.tsx:213-231` |
| A3 | Gated pages, encryption off | The banner is 3–5 lines on every page, worded differently from the pill, and sits in different places (under the tabs on Minutes). | Medium | One line in one slot under the page header: "Encryption is off. Records here aren't extra-locked yet. Turn it on →", with a "What's this?". | `EncryptionGate.tsx:103-124`; `minutes/page.tsx:55-57` |
| A4 | Dashboard activity | Encryption events show raw ("Alice laptop", "End-to-end encryption enabled; recovery key held by…"). | Medium | Map the `e2ee_*` actions to sentences ("Alice Rai turned on encryption", "Alice Rai set up a device"). | `src/lib/adminView.ts:62-115,154` |
| A5 | Events list | Column headings sit 48 px left of their values (header row lacks the rows' `gap-4`). | Medium | Share one grid class. | `events/page.tsx:77,93` |
| A6 | Events | "Featured" means three things: "Homepage" column, "top of the Events page" checkbox, "home page" summary help. | Medium | One meaning, one wording. | `events/page.tsx:82,111`; `EventForm.tsx:71,122-123` |
| A7 | Plans & Issues | "Start a new topic" heading with a "Create thread" button and "Thread created." status. | Medium | "Start topic" / "Topic started." (update the two tests). | `CommsBoardClient.tsx:180,398-400` |
| A8 | Admin Chat, phone | Composer and Send below the fold while the banner shows (page 931 px on an 812 px screen). | Medium | Full-height flex column with `flex-1` chat, or the one-line banner (A3). | `AdminChatClient.tsx:126` |
| A9 | Action Items, phone | Filter wraps to two rows ("All" alone); the Open tab carries two numbers; "dropped" vs "Not needed". | Medium | Overdue as a badge in the list heading; tab "Done / not needed" (update the test); fit one row. | `ActionItemsClient.tsx:93-114` |
| A10 | Dashboard, phone | Six quick-action tiles and a second search come before the recent lists. | Medium | Hide quick actions below `md` (or three tiles); drop the page filter (update the test). | `AdminDashboardOverview.tsx:243-265` |
| A11 | Meeting Minutes, phone | The sticky Save bar is ~120 px (hint + left button), covering ~23% of the screen while typing. | Medium | One short line or none on phones, full-width button, ~64 px bar. | `MinutesEditorClient.tsx:789-800` |
| A12 | Meeting Minutes | Section actions sit in different places ("Add attendance" wraps under its text, "Add signatures" sits right); the "New minutes" card repeats the header; the action-item Task input has no visible label. | Low | Pinned header actions in `AdminSectionCard`; show the card only when editing; `Field label="Task"`. | `AdminSectionCard.tsx:35-40`; `MinutesEditorClient.tsx:559-770` |
| A13 | Top bar | Three control shapes and heights (pill, ghost link, round toggle); "Lock" is a bare grey word at 36 px. | Low | One 40 px height, `rounded-md`; "Lock now" outline button with an icon. | `ThemeToggle.tsx:19`; `EncryptionStatusBadge.tsx:32-57` |
| A14 | Dashboard, phone | "View all" floats under the description; "To approve" hint breaks mid-phrase. | Low | Text link aligned to the title; "1 draft". | `AdminDashboardOverview.tsx:238-276` |
| A15 | Events list | Sorted latest first with no Upcoming/Past split. | Low | Upcoming (soonest first), then Past. | `admin/events/route.ts:25`; `events/page.tsx:85` |

### Bug found on the way (behaviour, owner decision)

| # | Problem | Where |
|---|---|---|
| B9 | **Event times can shift by hours.** The edit form shows and sends times in the browser's own time zone, and the server reads the time without a zone (`new Date("2026-12-12T19:00")`, i.e. in the server's zone, UTC on Vercel). The event's own "Time zone" setting is ignored for both. The capture showed the same event at 4:59 PM in the list and 09:59 PM in the form. An admin in Harrisburg entering 7:00 PM could store 7:00 PM UTC (2:00 PM Eastern). | `EventForm.tsx:45-54`; `api/admin/organizations/[orgSlug]/events/route.ts` and `[eventId]/route.ts` (`parseOptionalDate`) |

**Strengths to keep:** every page fits at 375 and 768 px; plain guiding copy on Minutes ("Which meeting?", "Choose a
meeting first…", "Nothing is public until another admin approves it"); the edit-event load/error/delete flow; calm
encryption-on states with an honest status pill; the token dark theme; jump-dialog keywords.

## 3. Admin console: community, documents and security pages

### Audit 1 rows

**Resolved:** B8; white-on-teal and dark-mode selection on these pages; Encryption tablet overflow; raw colours; ALL-CAPS;
one page frame and width; skeletons; dates; Calling Tree day-one dead end (checklist, "Why?", reason under the button);
My Calls; Document generator dark mode; Document gallery; Security.

| Audit 1 row | Status | What remains |
|---|---|---|
| Touch targets | Partly | Member row buttons are 32 px from 640 px up (tablets); "Why?" / "What is…?" summaries shrink on wider screens. |
| Members | Partly | Disable still in every row (no "More" menu); no downloadable sample; "CSV" unexplained. |
| Broadcasts | Partly | **Still no warning** that 0 members can be emailed and no email provider is set. |
| Call Campaigns | Partly | The disabled form still looks active (S6). |
| Document generator polish | Partly | "Document saved (ID: …)" still shown; the step name appears twice. |
| GUMBA | Partly | The no-goal state is a dead end ("there is nothing to set on this page"). |
| Encryption jargon | Partly | Setup (off) is plain now; the encryption-on screens add new jargon (S2–S4). |
| Encryption reminder wording | Partly | Gate titles read "Call campaigns is…", "Action Items is…" (A2). |

### New findings

| # | Page | Problem | Sev. | Fix | Where |
|---|---|---|---|---|---|
| S1 | Encryption (on) | **The most technical card comes first and the actions last.** Order: status → "Device list verified" (signed history, fingerprint) → devices → recovery key → "Encrypt existing records". Locked: "Unlock with passkey" is the last card, below the fold on a phone. Unlocked: the only primary ("Encrypt existing records") is at the very bottom. | High | Next action first (Unlock when locked; "Encrypt existing records" as a to-do near the top while unfinished); integrity as a one-line "Device list checked ✓" with the fingerprint in a disclosure. Every check and text kept. | `EncryptionPanel.tsx:199-228,660-686` |
| S2 | Encryption (on) | Jargon and grammar: "1 active device(s) · key generation 1", "tamper-evident history (1 entries)", a hard-to-follow fingerprint sentence; the device-list explanation appears twice. | Medium | "1 approved device"; "key generation" only inside "What does rotating keys do?"; "Checked against a signed record of every change (1 change)"; plain fingerprint line; one explanation. | `EncryptionPanel.tsx:213-225,370,666` |
| S3 | Encrypt existing records | Rows show "—"; labels say "threads", "Thread conclusions"; the card always looks unfinished; "old plaintext"; failures list raw record ids. | Medium | "Not started / Nothing to do / 3 of 5"; topic wording; collapse to "All records are encrypted ✓" when done; "old unencrypted copies"; failures as area + count. Warning kept. | `src/lib/e2eeMigration.ts:18-27`; `MigrationSection.tsx:94-118` |
| S4 | Encryption devices | A disabled destructive button looks active (pink); it shows even when there's nothing to revoke; this device's icon sits where checkboxes are and reads as an empty box. | Medium | Muted disabled style for `destructive` (as `default` has); hide revoke with "Only your own device is listed"; neutral device icon spaced unlike a checkbox. | `src/components/ui/button.tsx:12`; `EncryptionPanel.tsx:375-416` |
| S5 | Recovery key; setup | The Test input has no format hint and stays disabled until 55 characters; "Replace recovery key" doesn't say when; the setup step name appears three times. | Low | Help text for both; title "Set up this device" only. | `EncryptionPanel.tsx:131-184,467-497` |
| S6 | Call Campaigns | With no calling tree the form is disabled but looks enabled; with encryption off the script help still says "Encrypted on this device" and saving fails with "Unlock this device"; three routes to the Calling Tree. | Medium | Hide the form until the tree is planned; "Turn on encryption to add a script" when off; one route. | `CallCampaignsClient.tsx:127-201` |
| S7 | Shared `Field`, `Input` | Side-by-side fields misalign when one has help text; disabled inputs look enabled (white at 50%). | Low | `content-start` on Field; `disabled:bg-muted` on Input. | `src/components/ui/field.tsx:29`; `input.tsx:9` |
| S8 | Members, phone | The list starts ~2,000 px down under Add and Import; each row spends a line on a lone red "Disable". | Medium | List first; "Add a member" / "Import a list" behind buttons; Disable in a "More" menu. | `MembersClient.tsx:262-380,512-524` |
| S9 | Members, tablet | 7-option filter wraps in its track at 768 px; 32 px row buttons; disabled-state copy says numbers "are encrypted" when encryption is off; import textarea label is screen-reader only. | Low | Segmented from `lg`; 44 px below `lg`; state-aware sentence; visible "Paste your list". | `MembersClient.tsx:76,270,335-338,402-412` |
| S10 | Broadcasts | No warning that 0 of 6 members can be emailed and email sending isn't set up; the empty-state button focuses the form right above it. | Medium | Inline `Alert` above the form with a link to Members; drop or repurpose the empty-state button. | `BroadcastsClient.tsx:53-92` |
| S11 | Calling Tree | Three loose grey status lines under the buttons repeat the checklist; a 35-word description. | Low | One status line; "Last saved" by the title; one short sentence. | `CallingTreeClient.tsx:264-292` |
| S12 | Document generator, phone | Six template cards stack ~720 px before the form; the stepper wraps; no preview below `lg` until the last step. | Medium | Compact picker on phones; shorter step labels; a "Preview" button below `lg`. | `DocBuilder.tsx:610-665,804` |
| S13 | Document generator | The live preview is full of "TBD at TBD location" and "Dear Valued Member,", so it looks broken; Wedding and Memorial share an icon; "Document saved (ID: …)". | Medium | Grey bracketed hints or the example values in the preview; distinct icon; "Saved to Saved documents" with a link. | `DocBuilder.tsx:428,663-665`; `TemplateTabs.tsx` |
| S14 | Document gallery | Two identical primary buttons when empty; "Export JPEG"; three names for one place ("Document gallery", "Saved documents"). | Low | Hide the header action when empty; "Download image (JPEG)"; one name. | `document-gallery/page.tsx:31-79` |
| S15 | GUMBA (admin) | Three ways of saying "nothing yet"; the goal empty state has no next step; minutes rows not clickable; mixed separators. | Medium | One line + a link ("See the Donate page"); rows link to the record; one separator. | `gumba-project/page.tsx:98-170` |
| S16 | My Calls, Security | Descriptions that don't fit the state ("never leave it" with encryption off; "passkeys waiting for your approval" when none are); "Authenticator app:" / "Passkey:" prefixes repeat card titles. | Low | State-aware sentences; drop the prefixes. | `my-calls/page.tsx:19`; `security/page.tsx:25`; panels |

**Strengths to keep:** the Calling Tree setup checklist (the model for day-one guidance); encryption setup when off
(three visible steps, "What is…?" lines in one place); Security "Your sign-in at a glance"; finished dark mode including
the Document generator; honest local copy (Dashain placeholder, "Sita Gurung", consent wording on Members).



## 4. Consistency across the admin console

Five implementers rebuilt the admin in Upgrade 1. The basics hold everywhere: `AdminPageHeader` on all 22 routes, tokens
only (no raw colours, hex or `dark:` patches outside paper previews), one locked-state pattern, skeletons instead of
"Loading…", dates through `format.ts`, `ConfirmDialog` instead of `window.confirm`. What diverges:

**Inventory (measured):** 9 list styles for "rows of things"; 4 back-link styles (one detail page has none); two section
boxes (`AdminSectionCard` in 6 files, `Card` in 15, 22 hand-built boxes); row buttons `size="sm"` (Members), 40 px
(Action Items), `h-11 sm:h-10` (Gallery), `max-sm:h-11` (Calling), `lg` everywhere (DocBuilder); 4 step indicators;
3 stat-tile styles and 3 progress-bar heights; page titles half Title Case, half sentence case; load errors shown three
ways; success shown as toasts on 14 files and inline text on 4.

| # | Problem | Sev. | One standard | Where |
|---|---|---|---|---|
| C1 | 9 list styles (radius, shadow, padding, gap, hover all differ; Plans & Issues nests cards in a card). | High | `AdminList` / `AdminListRow`: one bordered card with dividers, 56 px rows, hover; card grids only for rich items (campaigns). | events, broadcasts, gallery, action items, comms, members, GUMBA, dashboard, campaign detail |
| C2 | Back links differ in label, colour, height and grouping; Broadcast detail has none. | High | `back={{ href, label }}` on `AdminPageHeader` (ghost, muted, 44 px on phones), labelled with the section name. | new/edit event, topic, campaign and broadcast detail |
| C3 | The Firebase connection state is the admin's only spinner, says "Connecting to Firestore." / "Unable to connect to Firebase.", and keeps spinning on error with no retry. | High | Skeleton while connecting; `Alert` "Couldn't connect. Check your internet and try again." + Try again. | `FirebaseAdminAuthBootstrap.tsx:80-92` |
| C4 | Two section-box components with different padding and title size, chosen at random (both on one page). | Medium | `AdminSectionCard` = `Card` + header, one title size. | `AdminSectionCard.tsx`; `card.tsx`; `CallingTreeClient.tsx` |
| C5 | Page titles and nav labels mix Title Case and sentence case ("Document generator" page vs "Document Generator" nav). | Medium | Sentence case in nav and headers together ("Action items", "Meeting minutes", "Calling tree"…); list any proper names in `UI_STYLE.md`. | `adminNav.ts`; page headers |
| C6 | The main create action sits in the header, in a section card, or as a form above the list. | Medium | Header `actions` holds the one create button; inline create forms sit above the list. | comms, broadcasts, campaigns |
| C7 | Row button sizes differ (32/40/44 px; `lg` everywhere in DocBuilder). | Medium | A `row` button size: 40 px desktop, 44 px phone; `lg` only for a flow's Next/Save. | members, action items, gallery, DocBuilder |
| C8 | Too many primaries: "Mark done" and "Log call" on every row; 3–4 primaries on Minutes. | Medium | Row actions outline; one primary per view; show only the approval step that applies. | `ActionItemsClient.tsx:153`; `MyCallsClient.tsx:216`; `MinutesEditorClient.tsx:796-897` |
| C9 | Two-admin approval looks different on Broadcasts (stepper + "next step" card) and Minutes (all buttons at once). | Medium | Reuse the broadcast pattern for minutes. | `BroadcastDetailClient.tsx`; `MinutesEditorClient.tsx:803-830` |
| C10 | Same state, different badge colour or wording ("Done" secondary vs success; call outcomes warning vs secondary; "Submitted" vs "Waiting for approval"); badge maps copied in two places each. | Medium | One `src/lib/statusBadges.ts`. | action items, my calls, campaign detail, minutes, dashboard, comms |
| C11 | Destructive styles and confirmations differ: Close campaign solid red with no confirm; Disable member no confirm; broadcast send an inline red "Yes, send it now". | Medium | Ghost-red trigger set apart + `ConfirmDialog destructive`; sending a broadcast confirmed with a primary `ConfirmDialog` (same checks). | `CampaignDetailClient.tsx:183`; `MembersClient.tsx:514`; `BroadcastDetailClient.tsx:301` |
| C12 | Load errors shown three ways (EmptyState + retry, Alert without retry, RouteError). | Medium | In-page: `Alert` + Try again; whole-page: `RouteError`. | comms, authenticator, notifications, encryption, passkeys, calling tree |
| C13 | Wording: "thread" vs "topic"; "Decrypting…" / "can't be decrypted" beside "Unlock"; "device(s)", "key generation(s)"; env var names (`BROADCAST_ORG_NAME`, `BROADCAST_POSTAL_ADDRESS`) shown to admins. | Medium | "topic"; "Unlocking…" / "Can't be opened on this device"; written-out plurals; "Ask whoever manages the website to add…". | comms, my calls, campaign detail, members, chat, minutes, encryption, `BroadcastDetailClient.tsx:247-250` |
| C14 | Topic detail has two titles (H1 "Topic", then an off-scale `text-xl` h2 with the real title); Edit event's description is the event title. | Medium | Object name as the H1; one plain sentence. | `comms/[threadId]/page.tsx:45`; `CommsThreadDetailClient.tsx:472`; edit event |
| C15 | Steps, stat tiles, progress bars, "see all" links, card-title icons, export labels ("Export" vs "Download"), cross-links ("Go to" vs "Open"), "admins" vs "board members", empty-state styles, feedback channel (toast vs inline), full-width phone submits, long header descriptions (24–38 words), a second date helper in `adminView.ts` and server dates without a time zone on GUMBA all vary. | Low | One `Steps`, `StatTile`, `ProgressBar`; ghost "All …" links; no card-title icons (or one rule); "Download PDF / image (JPEG) / spreadsheet (CSV)"; "Open <page>"; "admins" for console users; `EmptyState` compact; toasts for completed actions; one-sentence descriptions (≤ 20 words); one date helper with `DEFAULT_TIMEZONE`. | across the admin |


