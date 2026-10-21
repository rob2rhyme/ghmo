import type { ReactNode } from "react";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/src/components/admin/shell/AdminShell";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { safeRedirectPath } from "@/src/lib/security/redirect";

/**
 * Single gate for every admin page. It runs before anything is streamed, so a
 * missing, disabled or magic-link-only session always gets a real redirect to
 * /admin/login (which then offers passkey sign-in or setup). Pages and API routes
 * still check access themselves; this is the first line, not the only one.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (!(error instanceof AdminAccessError)) throw error;
    const current = safeRedirectPath((await headers()).get("x-pathname"), "/admin");
    redirect(`/admin/login?next=${encodeURIComponent(current)}` as Route);
  }

  // The browser Firestore connection is set up only by the pages that use it
  // (Admin Chat, Plans & Issues), so other pages never wait on it.
  return <AdminShell>{children}</AdminShell>;
}
