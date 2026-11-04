import type { Metadata } from "next";
import type { ReactNode } from "react";

// The page is a client component, so its tab title lives here ("New event · GHMO admin").
export const metadata: Metadata = { title: "New event" };

export default function Layout({ children }: { children: ReactNode }) {
  return children;
}
