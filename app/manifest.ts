import type { MetadataRoute } from "next";

/** Web app manifest: lets people install the site on a phone or computer (plan §11). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Greater Harrisburg Magar Organization",
    short_name: "GHMO",
    description:
      "The Magar community of Greater Harrisburg, Pennsylvania: events, meeting minutes, videos and the Gumba Project.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0f766e",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ],
    shortcuts: [
      { name: "Events", url: "/c/ghmo/events", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] },
      { name: "Board member sign in", short_name: "Sign in", url: "/admin/login", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }
    ]
  };
}
