//app/(admin)/admin/document-generator/page.tsx
import { redirect } from "next/navigation";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import SavedDocBuilder from "@/src/features/docgen/components/SavedDocBuilder";
import { TEMPLATE_META } from "@/src/features/docgen/templates";
import { getDocument } from "@/src/features/docgen/firestore/docRepo";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type DocumentGeneratorPageProps = {
  searchParams?: Promise<{
    docId?: string;
  }>;
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

  const { docId } = (await searchParams) ?? {};
  const savedDocument = docId ? await getDocument(docId) : null;
  const docMissing = Boolean(docId && !savedDocument);
  const templateId = savedDocument?.templateId ?? TEMPLATE_META[0]?.id;

  return (
    <div className="space-y-6 md:space-y-8">
      {docMissing ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm text-destructive">
          Document <span className="font-semibold">{docId}</span> was not found.
          Showing a fresh builder below.
        </div>
      ) : null}
      <EncryptionGate what="Document Generator">
        <SavedDocBuilder
          templatesMeta={TEMPLATE_META}
          initialTemplateId={templateId}
          initialInputs={savedDocument?.inputs}
          initialDocId={savedDocument?.id}
          enc={savedDocument?.enc}
        />
      </EncryptionGate>
    </div>
  );
}
