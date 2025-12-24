//app/layout.tsx
import type { Metadata } from "next";
import "./globals.css";
import Providers from "@/src/components/Providers";

export const metadata: Metadata = {
  title: "Greater Harrisburg Magar Organization",
  description:
    "Community hub for the Greater Harrisburg Magar Organization with fundraising, member access, and document generation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-200 dark:bg-slate-950 dark:text-slate-100">
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  );
}
