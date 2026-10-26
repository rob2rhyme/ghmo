import type { ReactNode } from "react";
import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import AdminShell from "@/src/components/admin/shell/AdminShell";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { roleLabel } from "@/src/lib/adminView";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { safeRedirectPath } from "@/src/lib/security/redirect";

/**
 * Single gate for every admin page. It runs before anything is streamed, so a
 * missing, disabled or magic-link-only session always gets a real redirect to
 * /admin/login (which then offers passkey sign-in or setup). Pages and API routes
 * still check access themselves; this is the first line, not the only one.
 */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  let user = { name: "Admin", email: undefined as string | undefined, roleLabel: "Admin" };
  try {
    const { actor, admin } = await requireActiveAdmin(undefined, COMMUNITY_SLUG);
    user = { name: actor.name || admin.email || "Admin", email: actor.email, roleLabel: roleLabel(actor.roles) };
  } catch (error) {
    if (!(error instanceof AdminAccessError)) throw error;
    const current = safeRedirectPath((await headers()).get("x-pathname"), "/admin");
    redirect(`/admin/login?next=${encodeURIComponent(current)}` as Route);
  }

  // The browser Firestore connection is set up only by the pages that use it
  // (Admin Chat, Plans & Issues), so other pages never wait on it.
  return <AdminShell user={user}>{children}</AdminShell>;
}
