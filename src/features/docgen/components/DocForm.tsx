"use client";

import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
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
    <div className="flex flex-col gap-4">
      {fields.map(field => {
        const value = values[field.id] ?? field.defaultValue ?? "";
        const action = fieldActions?.[field.id];
        const description = [action?.status, field.hint].filter(Boolean).join(" · ") || undefined;
        return (
          <div key={field.id} className="flex flex-col gap-2">
            {field.type === "checkbox" ? (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-2 text-sm font-medium text-foreground">{field.label}</legend>
                <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md border border-input bg-card px-3 py-2 text-sm text-foreground">
                  <input
                    type="checkbox"
                    checked={value === "true"}
                    onChange={e => onChange(field.id, e.target.checked ? "true" : "false")}
                    className="size-4 accent-primary"
                  />
                  <span>{field.placeholder ?? "Enabled"}</span>
                </label>
                {description ? <p className="text-sm text-muted-foreground">{description}</p> : null}
              </fieldset>
            ) : (
              <Field label={field.label} description={description}>
                {field.type === "textarea" ? (
                  <Textarea
                    rows={field.rows ?? 3}
                    value={value}
                    onChange={e => onChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                  />
                ) : field.type === "select" ? (
                  <Select value={value} onChange={e => onChange(field.id, e.target.value)}>
                    <option value="">Choose an option</option>
                    {field.options?.map(option => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </Select>
                ) : (
                  <Input
                    type={field.type === "date" ? "date" : "text"}
                    value={value}
                    onChange={e => onChange(field.id, e.target.value)}
                    placeholder={field.placeholder}
                  />
                )}
              </Field>
            )}
            {action ? (
              <div className="flex flex-wrap items-center gap-2">
                {action.badge ? <Badge variant="success">{action.badge}</Badge> : null}
                <Button type="button" variant="outline" onClick={action.onClick} disabled={action.disabled}>
                  {action.label}
                </Button>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
