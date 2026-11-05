"use client";

import * as React from "react";
import { X } from "lucide-react";
import { Input } from "@/src/components/ui/input";
import { cn } from "@/src/lib/utils";

type SearchInputProps = Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> & {
  value: string;
  onChange: (value: string) => void;
  /** Classes for the wrapper (width); `inputClassName` styles the field itself. */
  inputClassName?: string;
};

/**
 * A text box for filtering a list, with a clear (x) button once something is typed. The button empties the box and puts
 * the cursor back in it; Escape does the same from the keyboard.
 */
function SearchInput({ value, onChange, className, inputClassName, onKeyDown, ...props }: SearchInputProps) {
  const ref = React.useRef<HTMLInputElement>(null);
  const clear = () => {
    onChange("");
    ref.current?.focus();
  };
  return (
    <div data-slot="search-input" className={cn("relative w-full min-w-0", className)}>
      <Input
        {...props}
        ref={ref}
        type="text"
        inputMode="search"
        enterKeyHint="search"
        autoComplete="off"
        value={value}
        onChange={event => onChange(event.target.value)}
        onKeyDown={event => {
          onKeyDown?.(event);
          if (event.key === "Escape" && value) {
            event.preventDefault();
            event.stopPropagation();
            clear();
          }
        }}
        className={cn(value && "pr-11", inputClassName)}
      />
      {value ? (
        <button
          type="button"
          onClick={clear}
          aria-label="Clear search"
          className="absolute top-1/2 right-1 flex size-9 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
        >
          <X aria-hidden="true" className="size-4" />
        </button>
      ) : null}
    </div>
  );
}

export { SearchInput };
