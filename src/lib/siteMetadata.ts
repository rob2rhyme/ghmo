import type { Metadata, Viewport } from "next";

const SITE_NAME = "Greater Harrisburg Magar Organization";
const DESCRIPTION =
  "The Magar community of Greater Harrisburg, Pennsylvania: events, meeting minutes, videos and the Gumba Project.";

/** Absolute links in link previews (Open Graph) need the site's address; only set when it is configured. */
function siteUrl(): URL | undefined {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_PUBLIC_URL;
  if (!configured) return undefined;
  try {
    return new URL(configured);
  } catch {
    return undefined;
  }
}

export const siteMetadata: Metadata = {
  metadataBase: siteUrl(),
  title: SITE_NAME,
  description: DESCRIPTION,
  applicationName: "GHMO",
  icons: {
    icon: "/favicon.ico",
    apple: "/icons/apple-touch-icon.png"
  },
  // What a shared link shows in chat apps and social media. Pages that set their own title also pass it here.
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: SITE_NAME,
    description: DESCRIPTION,
    locale: "en_US",
    images: [
      {
        url: "/assets/ghmo-building.webp",
        width: 1600,
        height: 1067,
        alt: "Artwork of the planned GHMO Gumba building, with children in traditional Magar dress outside"
      }
    ]
  },
  // Installed on iPhone/iPad: open full screen with the GHMO name under the icon.
  appleWebApp: { capable: true, title: "GHMO", statusBarStyle: "default" }
};

/** Open Graph for a page with its own title: keeps the site's preview image and name. */
export function pageOpenGraph(title: string, description?: string): Metadata["openGraph"] {
  return { ...siteMetadata.openGraph, title, ...(description ? { description } : {}) };
}

export const siteViewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#0f766e" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1220" }
  ]
};
