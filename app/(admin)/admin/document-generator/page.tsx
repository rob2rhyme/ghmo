//app/(admin)/admin/document-generator/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, FileX, FolderOpen } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { DEFAULT_TIMEZONE } from "@/src/lib/events.shared";
import { formatShortDate } from "@/src/lib/format";
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

  const savedOn = savedDocument ? formatShortDate(savedDocument.updatedAt ?? savedDocument.createdAt, { timeZone: DEFAULT_TIMEZONE }) : "";

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Document generator"
        description="Make invitations, letters and certificates on GHMO letterhead, then print or save as PDF."
        actions={
          <Button asChild variant="outline">
            <Link href="/admin/document-gallery">
              <FolderOpen aria-hidden="true" />
              Saved documents
            </Link>
          </Button>
        }
      />
      {docMissing ? (
        <Alert variant="destructive">
          <FileX />
          <AlertTitle>Document not found</AlertTitle>
          <AlertDescription>
            That saved document doesn&apos;t exist any more, or the link is wrong. You can start a new one below.
          </AlertDescription>
        </Alert>
      ) : null}
      <EncryptionGate what="your documents">
        <div className="flex flex-col gap-6">
          {savedDocument ? (
            <Alert variant="info">
              <FileText />
              <AlertTitle>Editing: {savedDocument.templateTitle || "saved document"}</AlertTitle>
              <AlertDescription>
                {savedOn ? `Saved ${savedOn}. ` : ""}Saving again updates this copy in the gallery.
              </AlertDescription>
            </Alert>
          ) : null}
          <SavedDocBuilder
            templatesMeta={TEMPLATE_META}
            initialTemplateId={templateId}
            initialInputs={savedDocument?.inputs}
            initialDocId={savedDocument?.id}
            initialTemplateVersion={savedDocument?.templateVersion}
            enc={savedDocument?.enc}
          />
        </div>
      </EncryptionGate>
    </div>
  );
}
