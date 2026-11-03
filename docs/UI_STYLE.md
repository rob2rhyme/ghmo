# UI style rules

How pages are built (plan §13, Phase 10). The aim: beginner friendly, calm and consistent, finished in light and dark.
Follow these for every new or changed page.

## Building blocks (use these, don't hand-build)

| Need | Use |
|---|---|
| Buttons and button-looking links | `Button` (`src/components/ui/button.tsx`); links via `<Button asChild><Link …/></Button>` |
| Status labels | `Badge` (`default`, `secondary`, `success`, `warning`, `destructive`, `outline`) with text, never colour alone |
| Boxes | `Card` (public and shared), `AdminSectionCard` (admin sections) |
| Page title (admin) | `AdminPageHeader`: title + one plain sentence + actions |
| Form fields | `Field` + `Input` / `Select` / `Textarea` (label above, help under, error under) |
| Tabs, filters, view switches | `Segmented` (`src/components/ui/segmented.tsx`), with a `label` |
| Notices | `Alert` (`info`, `warning`, `destructive`) |
| Nothing to show | `EmptyState`: icon, what this is, what to do next, and a button or link to do it |
| Loading | `Skeleton` / `PageSkeleton`, not "Loading…" text |
| Are you sure? | `ConfirmDialog`, never `window.confirm` |
| Dates | `formatDate`, `formatShortDate`, `formatTime`, `formatDateTime` (`src/lib/format.ts`): no seconds |
| Admin page title | `AdminPageHeader` with `back={{ href, label }}` on detail and form pages (label = the section's name), `badge`, and one primary in `actions` |
| Admin section box | `AdminSectionCard` (title, description, `actions`, optional muted `icon`); a bare `Card` only for untitled boxes |
| Rows of things | `AdminList` + `AdminListRow` (title, meta, badges, actions, `href` for whole-row links) |
| Row actions | `Button variant="outline" size="row"` (44 px on phones, 40 px from sm); one primary per view |
| Status badges | `statusBadge(kind, status)` from `src/lib/statusBadges.ts`: one label and colour per state |
| Steps in a process | `Steps` (`src/components/ui/steps.tsx`) |
| Figures and progress | `StatGrid` + `StatTile`, `ProgressBar` (`src/components/ui/stat.tsx`) |
| Tabs that are pages | `SegmentedNav` (same look as `Segmented`) |
| Destructive actions | ghost button with `text-destructive`, set apart from other buttons, opening `ConfirmDialog destructive` |
| Errors inside a page | `Alert variant="destructive"` with a "Try again" button; whole-page failures use `RouteError` |
| Feedback | toasts (`sonner`) for finished actions; inline text only for lasting state ("Saved 2 min ago") |
| Encrypted pages | `EncryptionGate what="the meeting minutes"` (lower case, as it reads mid-sentence) and an optional `detail` |
| Public page | `PublicPage width="wide|reading"` + `PublicPageHeader`; `PublicSectionTitle` for sections |
| "Can't help you here" | `MessagePage` (404, broken link, board-only tool, unavailable record) |
| Contact | `getContactEmail()` (`src/lib/contact.ts`); show contact only when it returns an address |

## Colour

- Only theme tokens: `bg-background`, `bg-card`, `bg-muted`, `text-foreground`, `text-muted-foreground`, `border-border`,
  `text-primary`, `bg-primary/10`, `text-success|warning|destructive`, `bg-success/10` … They have light and dark values.
- No raw palette classes (`slate-`, `gray-`, `emerald-`, `rose-`, `amber-` …), no hex colours, no `dark:` patches.
- Never `text-white` on `bg-primary`: dark mode's teal needs dark text. `Button` already uses `text-primary-foreground`.
- One accent (teal `primary`). Orange `highlight` only for rare emphasis, never for a plain number.
- Text tokens meet 4.5:1 on every surface they're used on (cards, the page, muted tracks, tinted notices). Don't put `text-primary` text on tinted backgrounds; use `text-foreground` with a primary icon or underline. `npm run ui:screens` runs an axe check that fails on contrast problems.
- An element's accessible name contains its visible text: don't add an `aria-label` to a button that already shows words.

## Type

| Role | Classes |
|---|---|
| Page title | `text-2xl md:text-3xl font-semibold tracking-tight` (public hero: up to `text-4xl md:text-5xl`) |
| Section title | `text-lg font-semibold` |
| Card title | `text-base font-semibold` |
| Body | `text-base` (reading pages) or `text-sm` (dense admin UI) |
| Meta, help | `text-sm text-muted-foreground` |
| Smallest | `text-xs`, only for badges, keyboard hints and counts |

- No `text-[11px]`-style sizes, no ALL-CAPS labels (a single short eyebrow above a page title is the exception).
- Sentence case for labels, buttons, page titles and nav ("Meeting minutes", "Save event"). Proper names keep their capitals: GHMO, GUMBA, Plans & Issues, YouTube.

## Shape and space

- Two radii: controls `rounded-md`, surfaces `rounded-xl`. `rounded-full` only for badges, avatars and round icon buttons.
- Page sections `gap-6`; inside cards `gap-4`. Use `gap`, not margins between siblings.
- Rows of buttons always `flex flex-wrap gap-2` (or `gap-3`): buttons don't shrink, so rows must wrap.
- Grid columns `minmax(0,1fr)` and `min-w-0` on flex children that hold text, so nothing pushes the page sideways.
- One admin content width (set by the admin shell). Reading pages (forms, guides) may narrow to `max-w-3xl`.

## Words

- Say what a page is for in one plain sentence under the title.
- Name things the way a board member would: "topics", "phone numbers", "approved devices", "unlock" and "open", not "threads", "envelopes", "epochs", "decrypt", "plaintext". Write plurals out ("1 device", "2 devices"), never "device(s)".
- People who use the admin are "admins"; "board members" is for the real-world group.
- Exports say "Download PDF", "Download image (JPEG)", "Download spreadsheet (CSV)". Links to another admin page say "Open <page>".
- Page descriptions are one sentence of 20 words or fewer.
  When a technical word must stay (passkey, recovery key, safety code), explain it once in a short line.
- Buttons say what happens: "Send invite", "Save changes", "Delete event".
- Errors say what went wrong and what to do, next to the field.
- Nothing developer-facing on public pages: no env var names, file paths, IDs or "configure X".

## Touch and keyboard

- Tap targets at least 44 px on phones (`Button` default is 40 px; use `size="lg"` for the main action on phone layouts,
  never `size="sm"` for the only action in a row).
- Nothing only on hover. Focus rings stay visible (global `:focus-visible`).

## Security screens

Restyle and reword freely, but keep every step, check, confirmation and warning exactly as strong as before.

## Checking

`npm run ui:screens` captures every page at 375/768/1280 px in light and dark (see `docs/UI_AUDIT_1.md`).
