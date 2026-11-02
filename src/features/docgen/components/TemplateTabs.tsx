"use client";

import { Award, CalendarDays, FileText, Flower2, Landmark, Mail, Users } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/src/lib/utils";
import { DocTemplateMeta } from "../types";

type TemplateTabsProps = {
  tabs: DocTemplateMeta[];
  activeTabId: string;
  onTabChange: (id: string) => void;
};

const CATEGORY_ICONS: Record<string, ReactNode> = {
  Meeting: <Users />,
  Governance: <Landmark />,
  Events: <CalendarDays />,
  Religious: <Flower2 />,
  Certificate: <Award />,
  Letter: <Mail />
};

/** Template picker: a wrapping grid of cards, so every template is visible without sideways scrolling. */
export default function TemplateTabs({ tabs, activeTabId, onTabChange }: TemplateTabsProps) {
  return (
    <div role="group" aria-label="Templates" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {tabs.map(tab => {
        const active = tab.id === activeTabId;
        const descriptionId = `template-${tab.id}-description`;
        return (
          <button
            key={tab.id}
            type="button"
            aria-pressed={active}
            aria-label={tab.title}
            aria-describedby={descriptionId}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              "flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active
                ? "border-primary bg-primary/10 ring-1 ring-primary"
                : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
                active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
              )}
            >
              {CATEGORY_ICONS[tab.category] ?? <FileText />}
            </span>
            <span className="flex min-w-0 flex-col gap-0.5">
              <span className="text-sm font-semibold text-foreground">{tab.title}</span>
              <span id={descriptionId} className="text-sm text-muted-foreground">
                {tab.description}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
