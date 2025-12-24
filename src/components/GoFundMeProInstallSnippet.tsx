import Script from "next/script";

type Props = {
  enabled?: boolean;
  installSnippet?: string;
};

export function GoFundMeProInstallSnippet({ enabled, installSnippet }: Props) {
  if (!enabled || !installSnippet) return null;
  return <Script id="gofundme-pro-install-snippet" strategy="afterInteractive" dangerouslySetInnerHTML={{ __html: installSnippet }} />;
}
