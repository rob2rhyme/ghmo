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
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
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
          className="w-full bg-transparent text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
      </div>
      {value ? (
        <button
          type="button"
          onClick={onClear}
          className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500 transition hover:border-primary hover:text-slate-900"
          aria-label="Clear search"
        >
          Clear
        </button>
      ) : null}
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Cmd/Ctrl + K</span>
    </div>
  );
}
