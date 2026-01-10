//app/(admin)/admin/document-generator/page.tsx
import { redirect } from "next/navigation";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import DocBuilder from "@/src/features/docgen/components/DocBuilder";
import { TEMPLATE_META } from "@/src/features/docgen/templates";
import { getDocument } from "@/src/features/docgen/firestore/docRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DocumentGeneratorPageProps = {
  searchParams?: {
    docId?: string;
  };
};

export default async function DocumentGeneratorPage({
  searchParams,
}: DocumentGeneratorPageProps) {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/document-generator`);
    }
    throw error;
  }

  const docId = searchParams?.docId;
  const savedDocument = docId ? await getDocument(docId) : null;
  const docMissing = Boolean(docId && !savedDocument);
  const templateId = savedDocument?.templateId ?? TEMPLATE_META[0]?.id;

  return (
    <div className="space-y-6 md:space-y-8">
      {docMissing ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-700">
          Document <span className="font-semibold">{docId}</span> was not found.
          Showing a fresh builder below.
        </div>
      ) : null}
      <DocBuilder
        templatesMeta={TEMPLATE_META}
        initialTemplateId={templateId}
        initialInputs={savedDocument?.inputs}
        initialDocId={savedDocument?.id}
      />
    </div>
  );
}
