//app/(auth)/admin/login/page.tsx

import { redirect } from "next/navigation";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { serverEnv } from "@/src/lib/env.server";
import { getAuthContextFromRequest } from "@/src/lib/auth";
import AdminLoginClient from "./AdminLoginClient";

type AdminLoginPageProps = {
  searchParams: {
    next?: string;
  };
};

export default async function AdminLoginPage({
  searchParams,
}: AdminLoginPageProps) {
  const nextRoute = searchParams.next;
  const ctx = await getAuthContextFromRequest();
  try {
    await requireActiveAdmin(ctx ?? undefined, COMMUNITY_SLUG);
    redirect(nextRoute || "/admin");
  } catch (error) {
    if (error instanceof AdminAccessError) {
      // fall through to login UI
    } else {
      throw error;
    }
  }

  return (
    <AdminLoginClient
      orgSlug={COMMUNITY_SLUG}
      featureEmailLogin={serverEnv.FEATURE_EMAIL_ADMIN_LOGIN}
      featurePinLogin={serverEnv.FEATURE_PIN_LOGIN}
    />
  );
}
