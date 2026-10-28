import type { Metadata, Viewport } from "next";

export const siteMetadata: Metadata = {
  title: "Greater Harrisburg Magar Organization",
  description:
    "Community hub for the Greater Harrisburg Magar Organization with fundraising, multi-media, and admin tools.",
  applicationName: "GHMO",
  icons: {
    icon: "/assets/favicon.ico",
    apple: "/icons/apple-touch-icon.png"
  },
  // Installed on iPhone/iPad: open full screen with the GHMO name under the icon.
  appleWebApp: { capable: true, title: "GHMO", statusBarStyle: "default" }
};

export const siteViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" }
  ]
};
