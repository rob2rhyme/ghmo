import { Search } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

type AdminCommandPaletteProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

/** A small, secondary filter for what is shown on the dashboard (press "/" to focus it). Ctrl/⌘ K in the top bar is the main search. */
export default function AdminCommandPalette({ value, onChange, onClear, inputRef }: AdminCommandPaletteProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="flex items-center gap-2 rounded-md border border-input bg-card px-3 shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={handleChange}
        aria-label="Filter the dashboard"
        placeholder="Filter this page…"
        className="h-10 w-full min-w-0 bg-transparent text-base md:text-sm text-foreground outline-hidden placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="-mr-1 inline-flex min-h-9 items-center rounded-md px-2 text-sm font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Clear filter"
        >
          Clear
        </button>
      ) : (
        <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-xs font-medium text-muted-foreground sm:inline">/</kbd>
      )}
    </div>
  );
}
