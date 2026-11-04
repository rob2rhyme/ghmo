import type { Metadata } from "next";
import { MemberLoginForm } from "./MemberLoginForm";

export const metadata: Metadata = { title: "Member sign in · GHMO", robots: { index: false, follow: false } };

type MemberLoginPageProps = {
  searchParams: Promise<{ next?: string | string[] }>;
};

/**
 * Member sign-in. `next` is read here on the server and handed to the form, so the card is part of the first
 * HTML: no useSearchParams and no Suspense boundary that would stream the card in after the footer (R4 P1).
 * The secure root layout already renders per request (CSP nonce), so reading searchParams costs nothing extra.
 */
export default async function MemberLoginPage({ searchParams }: MemberLoginPageProps) {
  const { next } = await searchParams;
  return <MemberLoginForm next={typeof next === "string" ? next : null} />;
}
