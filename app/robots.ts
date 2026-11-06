import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/src/lib/siteMetadata";

/** Search engines may read the public pages; the board's area, sign-in, signing and one-off links stay out. */
export default function robots(): MetadataRoute.Robots {
  const sitemap = absoluteUrl("/sitemap.xml");
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/", "/sign/", "/login", "/unsubscribe", "/verify/", "/docs/", "/document-generator"] },
    ...(sitemap ? { sitemap } : {})
  };
}
