"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  announcementDocTemplate: ""
};

export default function NewEventPage() {
  const [form, setForm] = useState(defaultForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async () => {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations/ghmo/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to create event");
      router.replace("/admin/events");
    } catch (err: any) {
      setError(err.message || "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const update = (key: string, value: any) => setForm(prev => ({ ...prev, [key]: value }));

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">New Event</h1>
      </div>
      <EventForm form={form} update={update} />
      {error ? <p className="text-sm text-red-600">{error}</p> : null}
      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 disabled:opacity-60"
        >
          {saving ? "Saving..." : "Save Event"}
        </button>
        <button
          type="button"
          onClick={() => router.back()}
          className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function EventForm({
  form,
  update
}: {
  form: typeof defaultForm;
  update: (key: string, value: any) => void;
}) {
  return (
    <div className="space-y-4 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Title
          <input
            value={form.title}
            onChange={e => update("title", e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Event title"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Status
          <select
            value={form.status}
            onChange={e => update("status", e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </select>
        </label>
      </div>
      <label className="space-y-1 text-sm font-semibold text-slate-800">
        Summary
        <textarea
          value={form.summary}
          onChange={e => update("summary", e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          placeholder="Short description"
        />
      </label>
      <label className="space-y-1 text-sm font-semibold text-slate-800">
        Body
        <textarea
          value={form.body}
          onChange={e => update("body", e.target.value)}
          className="h-40 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          placeholder="Event details"
        />
      </label>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Starts At
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={e => update("startsAt", e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Ends At
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={e => update("endsAt", e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Timezone
          <input
            value={form.timezone}
            onChange={e => update("timezone", e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="America/New_York"
          />
        </label>
        <label className="space-y-1 text-sm font-semibold text-slate-800">
          Location
          <input
            value={form.location}
            onChange={e => update("location", e.target.value)}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            placeholder="Venue or link"
          />
        </label>
      </div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={form.featured} onChange={e => update("featured", e.target.checked)} />
        <span className="text-sm text-slate-700">Featured</span>
      </div>
      <label className="space-y-1 text-sm font-semibold text-slate-800">
        Announcement Template (optional)
        <input
          value={form.announcementDocTemplate}
          onChange={e => update("announcementDocTemplate", e.target.value)}
          className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          placeholder="event_announcement_v1"
        />
      </label>
    </div>
  );
}
