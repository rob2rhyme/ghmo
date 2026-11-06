"use client";

import type { Route } from "next";
import { CalendarDays, CornerDownLeft, Landmark, Mail, NotebookPen, Search, UserRound, UsersRound, type LucideIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/src/components/ui/dialog";
import { matchRecords, searchHref, seeAllHref, type SearchEntry, type SearchKind } from "@/src/lib/adminSearch";
import { cn } from "@/src/lib/utils";
import { ADMIN_NAV, navFor } from "./adminNav";

type PageEntry = {
  href: (typeof ADMIN_NAV)[number]["items"][number]["href"];
  label: string;
  group: string;
  icon: (typeof ADMIN_NAV)[number]["items"][number]["icon"];
  keywords: string[];
};

const entriesFor = (superAdmin: boolean): PageEntry[] =>
  navFor(superAdmin).flatMap(group =>
    group.items.map(item => ({
      href: item.href,
      label: item.label,
      group: group.label,
      icon: item.icon,
      keywords: (item.keywords ?? "")
        .split(",")
        .map(word => word.trim())
        .filter(Boolean)
    }))
  );

/** The keyword that matched, when the page name itself did not (shown as a hint beside the result). */
function keywordHit(entry: PageEntry, q: string): string | null {
  if (!q || `${entry.label} ${entry.group}`.toLowerCase().includes(q)) return null;
  return entry.keywords.find(word => word.toLowerCase().includes(q)) ?? null;
}

const KIND_ICONS: Record<SearchKind, LucideIcon> = { member: UserRound, event: CalendarDays, minutes: NotebookPen, group: UsersRound, position: Landmark, broadcast: Mail };

// People and records (plan §27, D72): fetched when the palette first opens, kept in this tab's memory only, for 10 minutes.
const INDEX_TTL_MS = 10 * 60 * 1000;
let cachedIndex: { at: number; entries: SearchEntry[] } | null = null;

type Item =
  | { type: "page"; key: string; href: string; label: string; hint: string; icon: LucideIcon }
  | { type: "record"; key: string; href: string; label: string; hint?: string; badge?: string; icon: LucideIcon }
  | { type: "more"; key: string; href: string; label: string };

/**
 * Search (Ctrl/⌘ K): pages by name or task ("passkey", "donations"), and, from two letters, members, events, minutes,
 * groups, positions and broadcasts by name (plan §27). Arrow keys move, Enter opens.
 */
export function AdminJumpDialog({ open, onOpenChange, superAdmin = false }: { open: boolean; onOpenChange: (open: boolean) => void; superAdmin?: boolean }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const [index, setIndex] = useState<SearchEntry[] | null>(() => (cachedIndex && Date.now() - cachedIndex.at < INDEX_TTL_MS ? cachedIndex.entries : null));
  const [indexError, setIndexError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    if (cachedIndex && Date.now() - cachedIndex.at < INDEX_TTL_MS) return;
    let cancelled = false;
    void fetch("/api/admin/search-index", { cache: "no-store" })
      .then(async res => {
        const data = (await res.json().catch(() => ({}))) as { entries?: SearchEntry[]; error?: string };
        if (!res.ok || !Array.isArray(data.entries)) throw new Error(data.error || "People and records couldn't be loaded. Pages can still be found.");
        cachedIndex = { at: Date.now(), entries: data.entries };
        if (!cancelled) {
          setIndex(data.entries);
          setIndexError(null);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) setIndexError(error instanceof Error ? error.message : "People and records couldn't be loaded. Pages can still be found.");
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const pages = useMemo(() => entriesFor(superAdmin), [superAdmin]);
  const q = query.trim().toLowerCase();
  const pageItems: Item[] = useMemo(
    () =>
      (q ? pages.filter(entry => `${entry.label} ${entry.group} ${entry.keywords.join(" ")}`.toLowerCase().includes(q)) : pages).map(entry => {
        const hit = keywordHit(entry, q);
        return { type: "page", key: `page:${entry.href}`, href: entry.href, label: entry.label, hint: hit ? `matches “${hit}”` : entry.group, icon: entry.icon };
      }),
    [pages, q]
  );
  const groups = useMemo(() => (index ? matchRecords(index, query) : []), [index, query]);
  const sections = useMemo(() => {
    const out: { label: string; items: Item[] }[] = [];
    if (pageItems.length) out.push({ label: "Pages", items: pageItems });
    for (const group of groups) {
      const items: Item[] = group.entries.map(entry => ({
        type: "record",
        key: `${entry.kind}:${entry.id}`,
        href: searchHref(entry),
        label: entry.title,
        hint: entry.detail,
        badge: entry.badge,
        icon: KIND_ICONS[entry.kind]
      }));
      const more = seeAllHref(group.kind, query);
      if (more && group.total > group.entries.length) items.push({ type: "more", key: `more:${group.kind}`, href: more, label: `See all ${group.total} matching ${group.label.toLowerCase()}` });
      out.push({ label: group.label, items });
    }
    return out;
  }, [pageItems, groups, query]);
  const flat = useMemo(() => sections.flatMap(section => section.items), [sections]);
  const current = Math.min(active, Math.max(flat.length - 1, 0));
  const wantsRecords = q.replace(/\s/g, "").length >= 2;

  const reset = () => {
    setQuery("");
    setActive(0);
  };
  const go = (item: Item | undefined) => {
    if (!item) return;
    reset();
    onOpenChange(false);
    router.push(item.href as Route);
  };

  let position = -1;
  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">Type a page, a task, or the name of a member, event, meeting, group, position or broadcast. Use the arrow keys, then press Enter.</DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-jump-results"
            aria-activedescendant={flat[current] ? `admin-jump-${current}` : undefined}
            aria-label="Search"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={event => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive(Math.min(current + 1, flat.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive(Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(flat[current]);
              }
            }}
            placeholder="Search pages, people, events, minutes…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <ul id="admin-jump-results" role="listbox" aria-label="Results" className="max-h-96 overflow-y-auto p-2">
          {flat.length === 0 ? (
            <li role="presentation" className="px-3 py-8 text-center text-sm text-muted-foreground">
              Nothing matches “{query}”.
            </li>
          ) : (
            sections.map(section => (
              <li key={section.label} role="presentation">
                <p className="px-3 pt-2 pb-1 text-xs font-semibold text-muted-foreground" aria-hidden="true">
                  {section.label}
                </p>
                <ul role="group" aria-label={section.label}>
                  {section.items.map(item => {
                    position += 1;
                    const at = position;
                    const Icon = item.type === "more" ? Search : item.icon;
                    return (
                      <li
                        key={item.key}
                        id={`admin-jump-${at}`}
                        role="option"
                        aria-selected={at === current}
                        onMouseMove={() => setActive(at)}
                        onClick={() => go(item)}
                        className={cn(
                          "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm",
                          at === current ? "bg-accent text-accent-foreground" : "text-foreground/80"
                        )}
                      >
                        <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                        <span className={cn("min-w-0 truncate", item.type === "more" ? "text-primary" : "font-medium")}>{item.label}</span>
                        {item.type !== "more" && item.hint ? <span className="truncate text-xs text-muted-foreground">{item.hint}</span> : null}
                        {item.type === "record" && item.badge ? <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">{item.badge}</span> : null}
                        {at === current ? <CornerDownLeft className="ml-auto size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" /> : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          )}
        </ul>
        {wantsRecords && !index ? (
          <p role="status" className="border-t border-border px-4 py-2 text-xs text-muted-foreground">
            {indexError ?? "Loading people and records…"}
          </p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
