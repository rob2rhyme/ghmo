import type { ChangeEvent, RefObject } from "react";

type AdminCommandPaletteProps = {
  value: string;
  onChange: (value: string) => void;
  onClear: () => void;
  inputRef?: RefObject<HTMLInputElement | null>;
};

export default function AdminCommandPalette({ value, onChange, onClear, inputRef }: AdminCommandPaletteProps) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    onChange(event.target.value);
  };

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-xs">
      <div className="flex flex-1 items-center gap-3">
        <span className="text-sm text-slate-400" aria-hidden>
          /
        </span>
        <input
          ref={inputRef}
          type="search"
          value={value}
          onChange={handleChange}
          placeholder="Search actions, minutes, and audit activity..."
          className="w-full bg-transparent text-sm text-foreground placeholder:text-slate-400 focus:outline-hidden"
        />
      </div>
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground"
          aria-label="Clear search"
        >
          Clear
        </button>
      ) : null}
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cmd/Ctrl + K</span>
    </div>
  );
}
