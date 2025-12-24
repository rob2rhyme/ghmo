import { adminDb } from "@/src/lib/firebaseAdmin";
import { assertMember } from "@/src/lib/auth";
import { getCommunity } from "@/src/lib/community";
import { redirect } from "next/navigation";
import DocumentGeneratorClient from "@/src/modules/docgen/DocumentGeneratorClient";

export default async function DocumentGeneratorPage() {
  const community = await getCommunity();
  const auth = await assertMember();
  if (!auth) redirect(`/login?next=/document-generator`);

  const templatesSnapshot = await adminDb.collection(`community/${community.id}/docgen/templates`).limit(20).get();
  type Template = {
    id: string;
    name: string;
    letterhead?: { title?: string; subtitle?: string };
    fields?: string[];
  };
  const templates: Template[] = templatesSnapshot.empty
    ? [
        {
          id: "default",
          name: "Default Letter",
          letterhead: { title: `${community.name} Letterhead` },
          fields: ["Recipient Name", "Address", "Subject", "Body"]
        }
      ]
    : templatesSnapshot.docs.map(doc => {
        const data = doc.data() as Partial<Template>;
        return {
          id: doc.id,
          name: data.name || "Untitled Template",
          letterhead: data.letterhead,
          fields: Array.isArray(data.fields) ? data.fields : undefined
        };
      });

  return <DocumentGeneratorClient communityId={community.id} communitySlug={community.slug} templates={templates} />;
}
