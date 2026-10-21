"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { Button } from "@/src/components/ui/button";

/**
 * Light/dark switch. The icon is chosen with CSS (`dark:`), so the button renders
 * on the server at full size and the header never shifts while hydrating.
 */
export default function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <Button
      type="button"
      variant="outline"
      size="icon"
      className="rounded-full"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      aria-label="Toggle light or dark theme"
    >
      <Moon className="dark:hidden" aria-hidden="true" />
      <Sun className="hidden dark:block" aria-hidden="true" />
    </Button>
  );
}
