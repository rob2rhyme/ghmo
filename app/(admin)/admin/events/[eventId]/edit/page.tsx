"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, CalendarX2, Trash2 } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { EMPTY_EVENT_FORM, EventForm, toInputDate, validateEventForm, type EventFormValues } from "@/src/components/admin/events/EventForm";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";

type LoadState = { kind: "loading" } | { kind: "ready" } | { kind: "missing" } | { kind: "failed"; message: string };

export default function EditEventPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const router = useRouter();
  const [form, setForm] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [load, setLoad] = useState<LoadState>({ kind: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    (async () => {
      setLoad({ kind: "loading" });
      try {
        const res = await fetch(`/api/admin/organizations/ghmo/events/${encodeURIComponent(eventId)}`, { cache: "no-store" });
        if (res.status === 404) {
          if (active) setLoad({ kind: "missing" });
          return;
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.event) throw new Error(data.error || `The server answered ${res.status}.`);
        const evt = data.event;
        if (!active) return;
        setForm({
          title: evt.title || "",
          summary: evt.summary || "",
          body: evt.body || "",
          status: evt.status || "draft",
          startsAt: toInputDate(evt.startsAt),
          endsAt: toInputDate(evt.endsAt),
          location: evt.location || "",
          timezone: evt.timezone || EMPTY_EVENT_FORM.timezone,
          featured: !!evt.featured,
          announcementDocTemplate: evt.announcementDocTemplate || ""
        });
        setLoad({ kind: "ready" });
      } catch (err) {
        if (active) setLoad({ kind: "failed", message: err instanceof Error ? err.message : "Unknown error." });
      }
    })();
    return () => {
      active = false;
    };
  }, [eventId, attempt]);

  const update = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    const found = validateEventForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/ghmo/events/${encodeURIComponent(eventId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The changes could not be saved.");
      router.replace("/admin/events");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The changes could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/organizations/ghmo/events/${encodeURIComponent(eventId)}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The event could not be deleted.");
      router.replace("/admin/events");
    } catch (err) {
      setConfirmDelete(false);
      setError(err instanceof Error ? err.message : "The event could not be deleted.");
    } finally {
      setDeleting(false);
    }
  };

  const back = (
    <Button asChild variant="ghost" className="-ml-3 w-fit text-muted-foreground">
      <Link href="/admin/events">
        <ArrowLeft aria-hidden="true" />
        Events
      </Link>
    </Button>
  );

  if (load.kind === "loading") {
    return (
      <div role="status" className="mx-auto flex max-w-3xl flex-col gap-4">
        <span className="sr-only">Loading the event…</span>
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-64 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  if (load.kind === "missing" || load.kind === "failed") {
    return (
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        {back}
        <EmptyState
          icon={<CalendarX2 />}
          title={load.kind === "missing" ? "This event doesn't exist" : "This event couldn't be loaded"}
          description={
            load.kind === "missing"
              ? "It may have been deleted. Nothing was changed."
              : `Nothing was changed. ${load.message} Check your connection and try again.`
          }
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {load.kind === "failed" ? <Button onClick={() => setAttempt(n => n + 1)}>Try again</Button> : null}
              <Button asChild variant="outline">
                <Link href="/admin/events">Back to events</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      {back}
      <AdminPageHeader title="Edit event" description={form.title || undefined} />
      <EventForm form={form} update={update} errors={errors} />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap items-center gap-3">
        <Button onClick={handleSave} loading={saving} disabled={deleting}>
          {saving ? "Saving…" : "Save changes"}
        </Button>
        <Button variant="outline" onClick={() => router.back()} disabled={saving || deleting}>
          Cancel
        </Button>
        <Button variant="ghost" className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setConfirmDelete(true)} disabled={saving}>
          <Trash2 aria-hidden="true" />
          Delete event
        </Button>
      </div>
      <ConfirmDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title="Delete this event?"
        description={`"${form.title || "This event"}" will be removed from the site for everyone. This can't be undone.`}
        confirmLabel="Delete event"
        destructive
        busy={deleting}
        onConfirm={handleDelete}
      />
    </div>
  );
}
