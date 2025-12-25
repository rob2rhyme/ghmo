"use client";

import { useState } from "react";

type TimelineItem = {
  id: string;
  title?: string;
  body?: string;
  timestamp?: number | null;
  tags?: string[];
};

export default function TimelineListClient({ items }: { items: TimelineItem[] }) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <div className="mt-4 space-y-4">
      {items.length === 0 ? <p className="text-sm text-slate-500">No entries yet.</p> : null}
      {items.map(item => {
        const isOpen = expanded[item.id];
        return (
          <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-800">
            <div className="flex items-center justify-between">
              <p className="font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
              <span className="text-xs text-slate-500">
                {item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}
              </span>
            </div>
            {item.body ? (
              <p className={`mt-2 whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-200 ${isOpen ? "" : "line-clamp-2"}`}>
                {item.body}
              </p>
            ) : null}
            {item.body && item.body.length > 80 ? (
              <button
                className="mt-2 text-xs font-semibold text-primary"
                onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !isOpen }))}
              >
                {isOpen ? "View less" : "View more"}
              </button>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
