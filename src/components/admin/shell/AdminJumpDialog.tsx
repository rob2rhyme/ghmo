"use client";

import { CornerDownLeft, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/src/components/ui/dialog";
import { cn } from "@/src/lib/utils";
import { ADMIN_NAV } from "./adminNav";

type Entry = {
  href: (typeof ADMIN_NAV)[number]["items"][number]["href"];
  label: string;
  group: string;
  icon: (typeof ADMIN_NAV)[number]["items"][number]["icon"];
  keywords: string[];
};

const ENTRIES: Entry[] = ADMIN_NAV.flatMap(group =>
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
function keywordHit(entry: Entry, q: string): string | null {
  if (!q || `${entry.label} ${entry.group}`.toLowerCase().includes(q)) return null;
  return entry.keywords.find(word => word.toLowerCase().includes(q)) ?? null;
}

/** "Jump to…" palette (Ctrl/⌘ K): type a few letters of a page name or a task ("passkey", "donations"), press Enter. */
export function AdminJumpDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? ENTRIES.filter(entry => `${entry.label} ${entry.group} ${entry.keywords.join(" ")}`.toLowerCase().includes(q)) : ENTRIES;
  }, [query]);
  const q = query.trim().toLowerCase();
  const current = Math.min(active, Math.max(results.length - 1, 0));

  const go = (entry: Entry | undefined) => {
    if (!entry) return;
    setQuery("");
    setActive(0);
    onOpenChange(false);
    router.push(entry.href);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next);
        if (!next) {
          setQuery("");
          setActive(0);
        }
      }}
    >
      <DialogContent className="top-[20%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0">
        <DialogTitle className="sr-only">Jump to a page</DialogTitle>
        <DialogDescription className="sr-only">Type a page name or what you want to do, use the arrow keys, then press Enter.</DialogDescription>
        <div className="flex items-center gap-3 border-b border-border px-4">
          <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            role="combobox"
            aria-expanded="true"
            aria-controls="admin-jump-results"
            aria-activedescendant={results[current] ? `admin-jump-${current}` : undefined}
            aria-label="Jump to a page"
            value={query}
            onChange={event => {
              setQuery(event.target.value);
              setActive(0);
            }}
            onKeyDown={event => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setActive(Math.min(current + 1, results.length - 1));
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setActive(Math.max(current - 1, 0));
              } else if (event.key === "Enter") {
                event.preventDefault();
                go(results[current]);
              }
            }}
            placeholder="Jump to a page, or type a task like “passkey”…"
            className="h-12 w-full bg-transparent text-sm text-foreground outline-hidden placeholder:text-muted-foreground"
          />
        </div>
        <ul id="admin-jump-results" role="listbox" aria-label="Pages" className="max-h-80 overflow-y-auto p-2">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">No page matches “{query}”.</li>
          ) : (
            results.map((entry, index) => {
              const Icon = entry.icon;
              const hit = keywordHit(entry, q);
              return (
                <li
                  key={entry.href}
                  id={`admin-jump-${index}`}
                  role="option"
                  aria-selected={index === current}
                  onMouseMove={() => setActive(index)}
                  onClick={() => go(entry)}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-3 py-2.5 text-sm",
                    index === current ? "bg-accent text-accent-foreground" : "text-foreground/80"
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 truncate font-medium">{entry.label}</span>
                  <span className="truncate text-xs text-muted-foreground">{hit ? `matches “${hit}”` : entry.group}</span>
                  {index === current ? <CornerDownLeft className="ml-auto size-3.5 text-muted-foreground" aria-hidden="true" /> : null}
                </li>
              );
            })
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
