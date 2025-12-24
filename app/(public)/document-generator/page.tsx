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
  const templates = templatesSnapshot.empty
    ? [
        {
          id: "default",
          name: "Default Letter",
          letterhead: { title: `${community.name} Letterhead` },
          fields: ["Recipient Name", "Address", "Subject", "Body"]
        }
      ]
    : templatesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));

  return <DocumentGeneratorClient communityId={community.id} communitySlug={community.slug} templates={templates} />;
}
