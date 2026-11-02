"use client";

import * as React from "react";
import { Label } from "@/src/components/ui/label";
import { cn } from "@/src/lib/utils";

type FieldProps = {
  label: React.ReactNode;
  /** Help text under the control. */
  description?: React.ReactNode;
  /** Error message; marks the control invalid and is announced to screen readers. */
  error?: React.ReactNode;
  className?: string;
  /** The control. It receives id, aria-describedby and aria-invalid automatically. */
  children: React.ReactElement<{ id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean }>;
};

/**
 * Label + control + help + error, wired together (plan §5.3: every input has a label).
 */
function Field({ label, description, error, className, children }: FieldProps) {
  const generatedId = React.useId();
  const id = children.props.id ?? generatedId;
  const descriptionId = description ? `${id}-description` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [children.props["aria-describedby"], descriptionId, errorId].filter(Boolean).join(" ") || undefined;

  return (
    <div data-slot="field" className={cn("grid content-start gap-2", className)}>
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, {
        id,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : children.props["aria-invalid"]
      })}
      {description ? (
        <p id={descriptionId} className="text-sm text-muted-foreground">
          {description}
        </p>
      ) : null}
      {error ? (
        <p id={errorId} role="alert" className="text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export { Field };
