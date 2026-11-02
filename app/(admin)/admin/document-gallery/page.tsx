//app/(admin)/admin/document-gallery/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePlus2, FileText } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { DEFAULT_TIMEZONE } from "@/src/lib/events.shared";
import { formatDateTime } from "@/src/lib/format";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listDocuments } from "@/src/features/docgen/firestore/docRepo";
import { resolveActorLabel } from "@/src/lib/actor";

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
    <Button asChild size="lg">
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
        actions={makeButton}
      />
      {documents.length === 0 ? (
        <EmptyState
          icon={<FileText />}
          title="No saved documents yet"
          description="When you make a letter or certificate and choose “Save to gallery”, it shows up here so you can open it again later."
          action={makeButton}
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {documents.map(doc => {
            const savedAt = doc.updatedAt ?? doc.createdAt;
            return (
              <li key={doc.id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4 shadow-xs md:p-5">
                <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <h2 className="text-base font-semibold text-foreground">{doc.templateTitle || "Untitled document"}</h2>
                    <p className="text-sm text-muted-foreground">
                      Saved by {resolveActorLabel({ name: doc.createdByName, roles: doc.createdByRoles })}
                      {savedAt ? ` · ${formatDateTime(savedAt, { timeZone: DEFAULT_TIMEZONE })}` : ""}
                    </p>
                  </div>
                  <Badge variant="secondary">{doc.category || "General"}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" className="h-11 sm:h-10">
                    <Link href={`/admin/document-generator?docId=${doc.id}`}>Open</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 sm:h-10">
                    <Link href={`/admin/document-generator?docId=${doc.id}&focus=export&format=pdf`}>Export PDF</Link>
                  </Button>
                  <Button asChild variant="outline" className="h-11 sm:h-10">
                    <Link href={`/admin/document-generator?docId=${doc.id}&focus=export&format=jpeg`}>Export JPEG</Link>
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
