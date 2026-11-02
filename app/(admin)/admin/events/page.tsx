//app/(admin)/admin/events/page.tsx
import { AdminAccessError, requireActiveAdmin } from "@/src/lib/admin";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { internalFetch } from "@/src/lib/internalFetch";
import Link from "next/link";
import { CalendarDays, Pencil, Plus } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { formatDateTime, type DateInput } from "@/src/lib/format";
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
      startsAt?: DateInput;
      timezone?: string;
      status?: string;
      featured?: boolean;
      announcementDocTemplate?: string | null;
    }[];
  };

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Events"
        description="Meetings and community gatherings. Published events show on the public events page."
        actions={
          <Button asChild>
            <Link href="/admin/events/new">
              <Plus aria-hidden="true" />
              New event
            </Link>
          </Button>
        }
      />

      {events.length === 0 ? (
        <EmptyState
          icon={<CalendarDays aria-hidden="true" />}
          title="No events yet"
          description="Add your first meeting or gathering. It stays a draft until you publish it."
          action={
            <Button asChild>
              <Link href="/admin/events/new">
                <Plus aria-hidden="true" />
                New event
              </Link>
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
          <div
            aria-hidden="true"
            className={`hidden border-b border-border bg-muted/40 px-4 py-2.5 text-sm font-medium text-muted-foreground lg:grid ${ROW_COLUMNS}`}
          >
            <span>Event</span>
            <span>Starts</span>
            <span>Status</span>
            <span>Homepage</span>
            <span className="text-right">Edit</span>
          </div>
          <ul className="divide-y divide-border">
            {events.map(evt => {
              const status = statusView(evt.status);
              const when = eventDate(evt.startsAt, evt.timezone);
              return (
                <li key={evt.id}>
                  <Link
                    href={`/admin/events/${evt.id}/edit`}
                    className={`group flex flex-col gap-2 px-4 py-4 transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset lg:grid lg:items-center lg:gap-4 lg:py-3 ${ROW_COLUMNS}`}
                  >
                    <span className="flex min-w-0 items-start justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block font-semibold break-words text-foreground">{evt.title || "Untitled event"}</span>
                        {evt.summary ? <span className="mt-0.5 line-clamp-2 block text-sm text-muted-foreground">{evt.summary}</span> : null}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-primary lg:hidden">
                        <Pencil aria-hidden="true" className="size-4" />
                        Edit
                      </span>
                    </span>
                    <span className="text-sm text-muted-foreground lg:text-foreground">{when || "No date set"}</span>
                    <span className="flex flex-wrap items-center gap-2 lg:contents">
                      <span>
                        <Badge variant={status.variant}>{status.label}</Badge>
                      </span>
                      <span className={evt.featured ? "" : "hidden lg:block"}>
                        {evt.featured ? <Badge variant="outline">Featured</Badge> : <span className="text-sm text-muted-foreground">No</span>}
                      </span>
                    </span>
                    <span className="hidden items-center justify-end gap-1 text-sm font-semibold text-primary group-hover:underline lg:flex">
                      <Pencil aria-hidden="true" className="size-4" />
                      Edit
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

const ROW_COLUMNS = "lg:grid-cols-[minmax(0,1fr)_14rem_7rem_7rem_4rem]";

function statusView(status?: string): { label: string; variant: "success" | "secondary" | "outline" } {
  if (status === "published") return { label: "Published", variant: "success" };
  if (!status || status === "draft") return { label: "Draft", variant: "secondary" };
  return { label: status.charAt(0).toUpperCase() + status.slice(1), variant: "outline" };
}

/** "Sat, Dec 12, 2026 · 7:00 PM" in the event's own time zone (falls back to the server's if it is unknown). */
function eventDate(value: DateInput, timeZone?: string): string {
  try {
    return formatDateTime(value, { timeZone });
  } catch {
    return formatDateTime(value);
  }
}
