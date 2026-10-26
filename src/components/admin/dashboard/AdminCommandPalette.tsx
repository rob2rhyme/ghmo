import { Search } from "lucide-react";
import type { ChangeEvent, RefObject } from "react";

type AdminCommandPaletteProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

/** Filters what is shown on the dashboard (press "/" to focus it). */
export default function AdminCommandPalette({ value, onChange, onClear, inputRef }: AdminCommandPaletteProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 shadow-xs focus-within:border-primary/50 focus-within:ring-2 focus-within:ring-ring/30">
      <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      <input
        ref={inputRef}
        type="search"
        value={value}
        onChange={handleChange}
        aria-label="Filter the dashboard"
        placeholder="Filter actions, minutes and activity…"
        className="h-11 w-full bg-transparent text-sm text-foreground outline-hidden placeholder:text-muted-foreground"
      />
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-md px-2 py-1 text-xs font-semibold text-muted-foreground transition hover:bg-accent hover:text-foreground"
          aria-label="Clear filter"
        >
          Clear
        </button>
      ) : (
        <kbd className="hidden rounded-md border border-border bg-muted px-1.5 py-0.5 font-sans text-[11px] font-medium text-muted-foreground sm:inline">/</kbd>
      )}
    </div>
  );
}
