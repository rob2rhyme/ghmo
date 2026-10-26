//app/(admin)/admin/events/[eventId]/edit/page.tsx
"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { useRouter, useParams } from "next/navigation";

const defaultForm = {
  title: "",
  summary: "",
  body: "",
  status: "draft",
  startsAt: "",
  endsAt: "",
  location: "",
  timezone: "America/New_York",
  featured: false,
  announcementDocTemplate: "",
};

export default function EditEventPage() {
  const params = useParams();
  const eventId = params?.eventId as string;
  const router = useRouter();
  const [form, setForm] = useState(defaultForm);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/admin/organizations/ghmo/events`);
        const data = await res.json();
        const evt = (data.events || []).find((e: any) => e.id === eventId);
        if (evt) {
          setForm({
            title: evt.title || "",
            summary: evt.summary || "",
            body: evt.body || "",
            status: evt.status || "draft",
            startsAt: evt.startsAt ? toInputDate(evt.startsAt) : "",
            endsAt: evt.endsAt ? toInputDate(evt.endsAt) : "",
            location: evt.location || "",
            timezone: evt.timezone || "America/New_York",
            featured: !!evt.featured,
            announcementDocTemplate: evt.announcementDocTemplate || "",
          });
        }
      } finally {
        setLoading(false);
      }
    };
    if (eventId) void load();
  }, [eventId]);

  const update = (key: string, value: any) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/organizations/ghmo/events/${eventId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(form),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update");
      router.replace("/admin/events");
    } catch (err: any) {
      setError(err.message || "Failed to update");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/organizations/ghmo/events/${eventId}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to delete");
      router.replace("/admin/events");
    } catch (err: any) {
      setError(err.message || "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  if (loading)
    return <div className="text-sm text-muted-foreground">Loading...</div>;

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Edit Event</h1>
        <button
          onClick={handleDelete}
          className="text-sm font-semibold text-destructive hover:underline"
        >
          Delete
        </button>
      </div>
      <EventForm form={form} update={update} />
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="flex gap-3">
        <button
          onClick={handleSave}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-border px-4 py-2 text-sm font-semibold text-foreground/80"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EventForm({
  form,
  update,
}: {
  form: typeof defaultForm;
  update: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-border bg-card p-5 shadow-xs">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-foreground">
          Title
          <input
            value={form.title}
            onChange={(e) => update("title", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-foreground">
          Status
          <select
            value={form.status}
            onChange={(e) => update("status", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>
      <label className="space-y-1 text-sm font-semibold text-foreground">
        Summary
        <textarea
          value={form.summary}
          onChange={(e) => update("summary", e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </label>
      <label className="space-y-1 text-sm font-semibold text-foreground">
        Body
        <textarea
          value={form.body}
          onChange={(e) => update("body", e.target.value)}
          className="h-40 w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-foreground">
          Starts At
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(e) => update("startsAt", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-foreground">
          Ends At
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(e) => update("endsAt", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-foreground">
          Timezone
          <input
            value={form.timezone}
            onChange={(e) => update("timezone", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-foreground">
          Location
          <input
            value={form.location}
            onChange={(e) => update("location", e.target.value)}
            className="w-full rounded-md border border-border px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={form.featured}
          onChange={(e) => update("featured", e.target.checked)}
        />
        <span className="text-sm text-foreground/80">Featured</span>
      </div>
      <label className="space-y-1 text-sm font-semibold text-foreground">
        Announcement Template
        <input
          value={form.announcementDocTemplate}
          onChange={(e) => update("announcementDocTemplate", e.target.value)}
          className="w-full rounded-md border border-border px-3 py-2 text-sm"
        />
      </label>
    </div>
  );
}

function toInputDate(value: any) {
  const d = new Date(value.toDate?.() || value);
  const pad = (n: number) => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}
