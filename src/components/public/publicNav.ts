import type { Route } from "next";

/** The public site's main pages, in menu order. Used by the header, the phone menu and the 404 page. */
export const PUBLIC_NAV: { href: Route; label: string }[] = [
  { href: "/", label: "Home" },
  { href: "/c/ghmo/events" as Route, label: "Events" },
  { href: "/donate", label: "Gumba Project" },
  { href: "/minutes", label: "Minutes" },
  { href: "/multimedia", label: "Media" }
];

/** True when `href` is the current page or a page inside it. */
export function isActivePath(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}
