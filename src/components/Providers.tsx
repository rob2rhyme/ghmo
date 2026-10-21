"use client";

import { ThemeProvider } from "next-themes";
import type { ReactNode } from "react";
import { Toaster } from "@/src/components/ui/sonner";

export default function Providers({ children, nonce }: { children: ReactNode; nonce?: string }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem nonce={nonce}>
      {children}
      <Toaster position="top-center" richColors closeButton />
    </ThemeProvider>
  );
}
