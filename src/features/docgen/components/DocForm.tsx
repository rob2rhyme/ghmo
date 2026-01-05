"use client";

import { DocField } from "../types";

type DocFormProps = {
  fields: DocField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
};

export default function DocForm({ fields, values, onChange }: DocFormProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/60 p-5 shadow-inner">
      {fields.map(field => {
        const value = values[field.id] ?? "";
        return (
          <div key={field.id} className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {field.label}
            </label>
            {field.type === "textarea" ? (
              <textarea
                rows={field.rows ?? 3}
                value={value}
                onChange={e => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            ) : field.type === "select" ? (
              <select
                value={value}
                onChange={e => onChange(field.id, e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              >
                <option value="">Choose an option</option>
                {field.options?.map(option => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                type={field.type === "date" ? "date" : "text"}
                value={value}
                onChange={e => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
            {field.hint ? <p className="text-xs text-slate-400">{field.hint}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
