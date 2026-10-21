//app/(admin)/admin/events/page.tsx
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function AdminEventsPage() {
  try {
    await requireActiveAdmin(undefined, COMMUNITY_SLUG);
  } catch (error) {
    if (error instanceof AdminAccessError) {
      redirect("/admin/login");
    }
    redirect("/admin/login");
  }

  const res = await internalFetch(
    `/api/organizations/${COMMUNITY_SLUG}/admin/events`
  );
  if (!res.ok) throw new Error("Failed to load events");
  const { events } = (await res.json()) as {
    events: {
      id: string;
      title?: string;
      summary?: string;
      startsAt?: { toDate?: () => Date } | Date | number | null;
      status?: string;
      featured?: boolean;
      announcementDocTemplate?: string | null;
    }[];
  };

  return (
    <div className="space-y-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Events</h1>
          <p className="text-sm text-muted-foreground">Manage organization events</p>
        </div>
        <Link
          href="/admin/events/new"
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          New Event
        </Link>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
        <div className="grid grid-cols-7 bg-background px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
          <div className="col-span-2">Title</div>
          <div>Start</div>
          <div>Status</div>
          <div>Featured</div>
          <div>Template</div>
          <div className="text-right">Actions</div>
        </div>
        <div className="divide-y divide-border">
          {events.length === 0 ? (
            <div className="px-4 py-3 text-sm text-muted-foreground">
              No events yet.
            </div>
          ) : (
            events.map((evt) => (
              <div
                key={evt.id}
                className="grid grid-cols-7 items-center px-4 py-3 text-sm"
              >
                <div className="col-span-2">
                  <div className="font-semibold text-foreground">
                    {evt.title}
                  </div>
                  {evt.summary ? (
                    <div className="text-xs text-muted-foreground line-clamp-2">
                      {evt.summary}
                    </div>
                  ) : null}
                </div>
                <div className="text-xs text-foreground/80">
                  {(() => {
                    if (!evt.startsAt) return "—";
                    if (
                      typeof evt.startsAt === "object" &&
                      "toDate" in evt.startsAt &&
                      typeof evt.startsAt.toDate === "function"
                    ) {
                      return new Date(evt.startsAt.toDate()).toLocaleString();
                    }
                    return new Date(
                      evt.startsAt as Date | number
                    ).toLocaleString();
                  })()}
                </div>
                <div className="text-xs font-semibold capitalize">
                  {evt.status}
                </div>
                <div className="text-xs">{evt.featured ? "Yes" : "No"}</div>
                <div className="text-xs">
                  {evt.announcementDocTemplate || "—"}
                </div>
                <div className="text-right">
                  <Link
                    href={`/admin/events/${evt.id}/edit`}
                    className="text-sm font-semibold text-primary hover:underline"
                  >
                    Edit
                  </Link>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
