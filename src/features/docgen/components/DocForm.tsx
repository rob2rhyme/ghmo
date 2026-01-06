"use client";

import { DocField } from "../types";

type DocFormProps = {
  fields: DocField[];
  values: Record<string, string>;
  onChange: (fieldId: string, value: string) => void;
  fieldActions?: Record<
    string,
    {
      label: string;
      onClick: () => void;
      status?: string;
      badge?: string;
      disabled?: boolean;
    }
  >;
};

export default function DocForm({ fields, values, onChange, fieldActions }: DocFormProps) {
  return (
    <div className="space-y-4 rounded-2xl border border-slate-200 bg-white/60 p-5 shadow-inner">
      {fields.map(field => {
        const value = values[field.id] ?? field.defaultValue ?? "";
        const action = fieldActions?.[field.id];
        return (
          <div key={field.id} className="space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                {field.label}
              </label>
              {action ? (
                <div className="flex items-center gap-2">
                  {action.badge ? (
                    <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[0.65rem] font-semibold text-emerald-700">
                      {action.badge}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={action.onClick}
                    disabled={action.disabled}
                    className="rounded-full border border-slate-200 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wide text-slate-600 transition hover:border-primary disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {action.label}
                  </button>
                </div>
              ) : null}
            </div>
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
            ) : field.type === "checkbox" ? (
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={value === "true"}
                  onChange={e => onChange(field.id, e.target.checked ? "true" : "false")}
                  className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
                />
                <span>{field.placeholder ?? "Enabled"}</span>
              </label>
            ) : (
              <input
                type={field.type === "date" ? "date" : "text"}
                value={value}
                onChange={e => onChange(field.id, e.target.value)}
                placeholder={field.placeholder}
                className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/50"
              />
            )}
            {action?.status ? <p className="text-xs text-slate-400">{action.status}</p> : null}
            {field.hint ? <p className="text-xs text-slate-400">{field.hint}</p> : null}
          </div>
        );
      })}
    </div>
  );
}
