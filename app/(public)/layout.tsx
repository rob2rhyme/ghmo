import { ReactNode } from "react";
import { CommunityHeader } from "@/src/components/community/CommunityHeader";
import { getCommunity } from "@/src/lib/community";
import { GoFundMeProInstallSnippet } from "@/src/components/GoFundMeProInstallSnippet";

export default async function PublicLayout({ children }: { children: ReactNode }) {
  const community = await getCommunity();
  const installSnippet = process.env.NEXT_PUBLIC_GOFUNDME_PRO_INSTALL_SNIPPET;

  return (
    <>
      <GoFundMeProInstallSnippet enabled={community.gofundmePro?.enabled} installSnippet={installSnippet} />
      <CommunityHeader name={community.name} />
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </>
  );
}
