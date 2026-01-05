"use client";

import { DocTemplateMeta } from "../types";

type TemplateTabsProps = {
  tabs: DocTemplateMeta[];
  activeTabId: string;
  onTabChange: (id: string) => void;
};

export default function TemplateTabs({ tabs, activeTabId, onTabChange }: TemplateTabsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs uppercase tracking-wide text-slate-500">Templates</p>
        <span className="text-xs text-slate-400">Choose one</span>
      </div>
      <div className="flex gap-2 overflow-x-auto whitespace-nowrap px-1">
        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onTabChange(tab.id)}
              className={`flex-0 rounded-full border px-4 py-2 text-xs font-semibold transition ${
                active
                  ? "border-primary bg-primary/10 text-primary shadow-sm"
                  : "border-slate-200 bg-white text-slate-800 hover:border-primary/60"
              }`}
            >
              {tab.title}
            </button>
          );
        })}
      </div>
    </div>
  );
}
