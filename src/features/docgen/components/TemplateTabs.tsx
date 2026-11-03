"use client";

import { Award, CalendarDays, FileText, Flower2, Landmark, Mail, Ribbon, Users } from "lucide-react";
import type { ReactNode } from "react";
import { Field } from "@/src/components/ui/field";
import { Select } from "@/src/components/ui/select";
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

/** Templates that share a category but should not share an icon. */
const TEMPLATE_ICONS: Record<string, ReactNode> = {
  "death-certificate": <Ribbon />
};

const iconFor = (tab: DocTemplateMeta) => TEMPLATE_ICONS[tab.id] ?? CATEGORY_ICONS[tab.category] ?? <FileText />;

function TemplateIcon({ tab, active }: { tab: DocTemplateMeta; active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-md [&_svg]:size-4",
        active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
      )}
    >
      {iconFor(tab)}
    </span>
  );
}

/**
 * Template picker. Phones get a compact select with the chosen template described under it; from sm up,
 * a wrapping grid of cards shows every template without sideways scrolling.
 */
export default function TemplateTabs({ tabs, activeTabId, onTabChange }: TemplateTabsProps) {
  const activeTab = tabs.find(tab => tab.id === activeTabId);
  return (
    <>
      <div className="flex flex-col gap-3 sm:hidden">
        <Field label="Template">
          <Select value={activeTabId} onChange={e => onTabChange(e.target.value)}>
            {tabs.map(tab => (
              <option key={tab.id} value={tab.id}>
                {tab.title}
              </option>
            ))}
          </Select>
        </Field>
        {activeTab ? (
          <div className="flex items-start gap-3 rounded-xl border border-primary/50 bg-primary/5 p-3">
            <TemplateIcon tab={activeTab} active />
            <p className="min-w-0 text-sm text-muted-foreground">{activeTab.description}</p>
          </div>
        ) : null}
      </div>
      <div role="group" aria-label="Templates" className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-3">
        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              aria-pressed={active}
              onClick={() => onTabChange(tab.id)}
              className={cn(
                "flex min-h-11 min-w-0 cursor-pointer items-start gap-3 rounded-xl border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-primary bg-primary/10 ring-1 ring-primary" : "border-border bg-card hover:border-primary/50 hover:bg-muted/50"
              )}
            >
              <TemplateIcon tab={tab} active={active} />
              <span className="flex min-w-0 flex-col gap-0.5">
                {/* The button's name is its visible text (title, then description), so speech users can say what they see. */}
                <span className="text-sm font-semibold text-foreground">
                  {tab.title}
                </span>
                <span className="text-sm text-muted-foreground">
                  {tab.description}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
