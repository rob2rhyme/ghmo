//app/(auth)/admin/login/page.tsx

import { redirect } from "next/navigation";
import type { Route } from "next";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { getServerEnv } from "@/src/lib/env.server";
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
  const adminRoute = (nextRoute?.startsWith("/") ? nextRoute : "/admin") as Route;
  const ctx = await getAuthContextFromRequest();
  try {
    await requireActiveAdmin(ctx ?? undefined, COMMUNITY_SLUG);
    redirect(adminRoute);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      // fall through to login UI
    } else {
      throw error;
    }
  }

  const env = getServerEnv();
  return (
    <AdminLoginClient
      orgSlug={COMMUNITY_SLUG}
      featureEmailLogin={env.FEATURE_EMAIL_ADMIN_LOGIN}
      featurePinLogin={env.FEATURE_PIN_LOGIN}
    />
  );
}
