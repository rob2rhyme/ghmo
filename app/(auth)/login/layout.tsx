import type { Metadata } from "next";
import type { ReactNode } from "react";

// The sign-in page is a client component, so its tab title lives here.
export const metadata: Metadata = { title: "Member sign in · GHMO", robots: { index: false, follow: false } };

export default function MemberLoginLayout({ children }: { children: ReactNode }) {
  return children;
}
