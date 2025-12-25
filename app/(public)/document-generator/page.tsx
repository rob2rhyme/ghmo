import { assertAuthenticated } from "@/src/lib/auth";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { redirect } from "next/navigation";
import DocumentGeneratorClient from "@/src/modules/docgen/DocumentGeneratorClient";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DocumentGeneratorPage() {
  const community = await getCommunity();
  const auth = await assertAuthenticated();
  if (!auth) redirect(`/login?next=/document-generator`);

  const templatesRes = await internalFetch(`/api/organizations/${COMMUNITY_SLUG}/docgen/templates`);
  if (!templatesRes.ok) throw new Error("Failed to load templates");
  const { templates = [] } = (await templatesRes.json()) as {
    templates: { id: string; name?: string; letterhead?: { title?: string; subtitle?: string }; fields?: string[] }[];
  };

  const templatesWithDefault =
    templates.length > 0
      ? templates.map(template => ({
          id: template.id,
          name: template.name || "Untitled Template",
          letterhead: template.letterhead,
          fields: Array.isArray(template.fields) ? template.fields : undefined
        }))
      : [
          {
            id: "default",
            name: "Default Letter",
            letterhead: { title: `${community.name} Letterhead` },
            fields: ["Recipient Name", "Address", "Subject", "Body"]
          }
        ];

  return <DocumentGeneratorClient communityId={community.id} communitySlug={community.slug} templates={templatesWithDefault} />;
}
