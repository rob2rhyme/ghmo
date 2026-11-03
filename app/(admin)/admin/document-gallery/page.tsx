//app/(admin)/admin/document-gallery/page.tsx
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { Download, FilePlus2, FileText, Image as ImageIcon } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { DEFAULT_TIMEZONE } from "@/src/lib/events.shared";
import { formatDateTime } from "@/src/lib/format";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listDocuments } from "@/src/features/docgen/firestore/docRepo";
import { resolveActorLabel } from "@/src/lib/actor";

/** Tab title: "Document gallery · GHMO admin" (the admin layout adds the suffix). */
export const metadata: Metadata = { title: "Document gallery" };


export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function DocumentGalleryPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/document-gallery`);
    }
    throw error;
  }

  const documents = await listDocuments();

  const makeButton = (
    <Button asChild>
      <Link href="/admin/document-generator">
        <FilePlus2 aria-hidden="true" />
        Make a document
      </Link>
    </Button>
  );

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Document gallery"
        description="Letters and certificates you saved. Open one to edit, print or download."
        actions={documents.length > 0 ? makeButton : undefined}
      />
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No saved documents yet"
          description="When you make a letter or certificate and choose “Save to gallery”, it shows up here so you can open it again later."
          action={makeButton}
        />
      ) : (
        <AdminList label="Documents">
          {documents.map(doc => {
            const savedAt = doc.updatedAt ?? doc.createdAt;
            const openHref = `/admin/document-generator?docId=${doc.id}`;
            return (
              <AdminListRow
                key={doc.id}
                href={openHref as Route}
                title={doc.templateTitle || "Untitled document"}
                badges={<Badge variant="secondary">{doc.category || "General"}</Badge>}
                meta={
                  <>
                    Saved by {resolveActorLabel({ name: doc.createdByName, roles: doc.createdByRoles })}
                    {savedAt ? ` · ${formatDateTime(savedAt, { timeZone: DEFAULT_TIMEZONE })}` : ""}
                  </>
                }
                actions={
                  <>
                    <Button asChild variant="outline" size="row">
                      <Link href={`${openHref}&focus=export&format=pdf` as Route}>
                        <Download aria-hidden="true" />
                        Download PDF
                      </Link>
                    </Button>
                    <Button asChild variant="outline" size="row">
                      <Link href={`${openHref}&focus=export&format=jpeg` as Route}>
                        <ImageIcon aria-hidden="true" />
                        Download image (JPEG)
                      </Link>
                    </Button>
                  </>
                }
              />
            );
          })}
        </AdminList>
      )}
    </div>
  );
}
