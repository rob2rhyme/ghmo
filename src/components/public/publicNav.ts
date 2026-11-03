import type { Route } from "next";

/**
 * The public site's main pages, in menu order (header and phone menu). The Gumba Project page (/donate) is
 * reached from the header's own button, so it is not repeated here; the footer still lists it.
 */
export const PUBLIC_NAV: { href: Route; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/c/ghmo/events" as Route, label: "Events" },
  { href: "/minutes", label: "Minutes" },
  { href: "/multimedia", label: "Media" }
];

/** True when `href` is the current page or a page inside it. */
export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
