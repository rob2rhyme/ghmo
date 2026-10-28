import type { MetadataRoute } from "next";

/** Web app manifest: lets people install the site on a phone or computer (plan §11). */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Greater Harrisburg Magar Organization",
    short_name: "GHMO",
    description: "Community hub for the Greater Harrisburg Magar Organization.",
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
    shortcuts: [{ name: "Admin", url: "/admin", icons: [{ src: "/icons/icon-192.png", sizes: "192x192" }] }]
  };
}
