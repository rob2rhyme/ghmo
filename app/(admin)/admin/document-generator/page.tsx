import Link from "next/link";
import { COMMUNITY_SLUG, getCommunity } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import { redirect } from "next/navigation";
import DocumentGeneratorClient, { DocumentGeneratorTemplate } from "@/src/modules/docgen/DocumentGeneratorClient";
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const DOCGEN_ORG_SLUG = COMMUNITY_SLUG;
const DOCGEN_TEMPLATES_API_PATH = `/api/organizations/${DOCGEN_ORG_SLUG}/docgen/templates`;
const DOCGEN_FIRESTORE_PATH = `organizations/${DOCGEN_ORG_SLUG}/docgen`;

type TemplateFetchError = {
  status: number;
  detail: string;
};

function DocumentGeneratorErrorState({ status, detail }: TemplateFetchError) {
  return (
    <section className="space-y-3 rounded-lg border border-rose-200 bg-rose-50 p-6 text-sm text-rose-800">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold text-rose-700">Unable to load templates</h1>
        <p>
          The server responded with {status ? `status ${status}` : "an unexpected error"} while calling{" "}
          <code className="rounded bg-white px-1 text-xs font-mono text-rose-700">{`GET ${DOCGEN_TEMPLATES_API_PATH}`}</code>.
        </p>
        {detail ? <p className="text-xs text-rose-600">Detail: {detail}</p> : null}
      </div>
        <Link
          href="/admin/document-generator"
          className="inline-flex items-center rounded-md border border-rose-200 bg-white px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm hover:bg-rose-50"
        >
        Retry loading templates
      </Link>
    </section>
  );
}

function DocumentGeneratorEmptyState({ firestorePath }: { firestorePath: string }) {
  return (
    <section className="space-y-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">No templates yet</h1>
        <p className="text-sm text-slate-600">
          Seed at least one document under <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">{firestorePath}</code> with
          fields such as `name`, optional `letterhead`, and optional `fields: string[]`.
        </p>
      </div>
      <pre className="rounded bg-slate-900/5 p-3 text-xs text-slate-700">
{`{
  name: "Default Letter",
  letterhead: { title: "GHMO Letterhead", subtitle: "Donation confirmations" },
  fields: ["Recipient Name", "Address", "Subject", "Body"]
}`}
      </pre>
    </section>
  );
}

export default async function DocumentGeneratorPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect(`/admin/login?next=/admin/document-generator`);
    }
    throw error;
  }

  const community = await getCommunity();

  let templates: DocumentGeneratorTemplate[] | null = null;
  let templateError: TemplateFetchError | null = null;

  try {
    const templatesRes = await internalFetch(DOCGEN_TEMPLATES_API_PATH);
    if (!templatesRes.ok) {
      const detail = (await templatesRes.text().catch(() => "")).trim();
      if (process.env.NODE_ENV === "development") {
        console.error("Document Generator templates fetch failed", {
          path: DOCGEN_TEMPLATES_API_PATH,
          status: templatesRes.status,
          detail
        });
      }
      templateError = { status: templatesRes.status, detail: detail || "No additional details" };
    } else {
      const payload = (await templatesRes.json().catch(() => ({}))) as { templates?: DocumentGeneratorTemplate[] };
      templates = payload.templates
        ? payload.templates.map(template => ({
            id: template.id,
            name: template.name || "Untitled Template",
            letterhead: template.letterhead,
            fields: Array.isArray(template.fields) ? template.fields : undefined
          }))
        : [];
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    if (process.env.NODE_ENV === "development") {
      console.error("Document Generator templates fetch failed", {
        path: DOCGEN_TEMPLATES_API_PATH,
        detail
      });
    }
    templateError = { status: 0, detail };
  }

  const hasTemplates = (templates?.length ?? 0) > 0;

  let content;
  if (templateError) {
    content = <DocumentGeneratorErrorState status={templateError.status} detail={templateError.detail} />;
  } else if (!hasTemplates) {
    content = <DocumentGeneratorEmptyState firestorePath={DOCGEN_FIRESTORE_PATH} />;
  } else {
    content = (
      <DocumentGeneratorClient
        communityId={community.id}
        communitySlug={community.slug}
        templates={templates!}
      />
    );
  }

  return <div className="mx-auto max-w-5xl space-y-6">{content}</div>;
}
