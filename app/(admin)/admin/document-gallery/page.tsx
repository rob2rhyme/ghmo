//app/(admin)/admin/document-gallery/page.tsx
import Link from "next/link";
import { redirect } from "next/navigation";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { listDocuments } from "@/src/features/docgen/firestore/docRepo";
import { resolveActorLabel } from "@/src/lib/actor";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              Document gallery
            </p>
            <h1 className="text-2xl font-semibold text-slate-900">
              Saved letters & certificates
            </h1>
          </div>
          <Link
            href="/admin/document-generator"
            className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-primary hover:text-slate-900"
          >
            Build new document
          </Link>
        </div>
        <p className="mt-2 text-sm text-slate-500">
          Each record stores the template, inputs, and creator so you can
          reopen, re-export, or iterate.
        </p>
      </div>
      <section className="space-y-3">
        {documents.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5 text-sm text-slate-600">
            No documents saved yet. Use the Document Generator to create a new
            letter or certificate and save it to the gallery.
          </div>
        ) : (
          <div className="space-y-3">
            {documents.map((doc) => (
              <div
                key={doc.id}
                className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-semibold text-slate-900">
                      {doc.templateTitle}
                    </p>
                    <p className="text-xs uppercase tracking-wide text-slate-500">
                      {doc.category || "General"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Saved by {resolveActorLabel({ name: doc.createdByName, roles: doc.createdByRoles })}
                    </p>
                  </div>
                  <p className="text-xs text-slate-400">
                    {doc.createdAt
                      ? DATE_FORMATTER.format(doc.createdAt)
                      : "Timestamp unknown"}
                  </p>
                </div>
                <div className="mt-4 flex flex-wrap gap-2 text-xs">
                  <Link
                    href={`/admin/document-generator?docId=${doc.id}`}
                    className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition hover:border-primary"
                  >
                    Open
                  </Link>
                  <Link
                    href={`/admin/document-generator?docId=${doc.id}&focus=export&format=pdf`}
                    className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition hover:border-primary"
                  >
                    Export PDF
                  </Link>
                  <Link
                    href={`/admin/document-generator?docId=${doc.id}&focus=export&format=jpeg`}
                    className="rounded-full border border-slate-200 px-3 py-1 font-semibold text-slate-700 transition hover:border-primary"
                  >
                    Export JPEG
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
