"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";

export default function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      {children}
    </ThemeProvider>
  );
}
