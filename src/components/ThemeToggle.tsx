"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";

export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const toggle = () => setTheme(resolvedTheme === "dark" ? "light" : "dark");

  const icon =
    resolvedTheme === "dark" ? (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
        <path
          d="M12 4.5a1 1 0 0 1 1 1V7a1 1 0 1 1-2 0V5.5a1 1 0 0 1 1-1Zm0 9.5a2 2 0 1 0 0-4 2 2 0 0 0 0 4Zm7.5-2a1 1 0 0 1-1 1H17a1 1 0 0 1 0-2h1.5a1 1 0 0 1 1 1Zm-11 0a1 1 0 0 1-1 1H6a1 1 0 0 1 0-2h1.5a1 1 0 0 1 1 1Zm8.036 5.036a1 1 0 0 1 0-1.414l1.06-1.06a1 1 0 0 1 1.415 1.414l-1.061 1.06a1 1 0 0 1-1.414 0Zm-9.192 0-1.06-1.06A1 1 0 1 1 8.607 15.6l1.06 1.06a1 1 0 0 1-1.414 1.415Zm9.192-11.072a1 1 0 0 1 1.414 0l1.06 1.06a1 1 0 0 1-1.414 1.415l-1.06-1.061a1 1 0 0 1 0-1.414Zm-9.192 0a1 1 0 0 1 0 1.414L7.283 9.44A1 1 0 0 1 5.87 8.025l1.06-1.06a1 1 0 0 1 1.415 0ZM12 17a1 1 0 0 1 1 1v1.5a1 1 0 1 1-2 0V18a1 1 0 0 1 1-1Z"
          fill="currentColor"
        />
      </svg>
    ) : (
      <svg viewBox="0 0 24 24" aria-hidden className="h-5 w-5">
        <path
          d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 1 0 9.79 9.79Z"
          fill="currentColor"
        />
      </svg>
    );

  if (!mounted) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label="Toggle theme"
      className="inline-flex rounded-full border border-slate-200 bg-white/80 p-2 text-slate-800 shadow-sm backdrop-blur transition hover:scale-105 hover:shadow dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100"
    >
      {icon}
    </button>
  );
}
