"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { EMPTY_EVENT_FORM, EventForm, validateEventForm, type EventFormValues } from "@/src/components/admin/events/EventForm";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";

export default function NewEventPage() {
  const router = useRouter();
  const [form, setForm] = useState<EventFormValues>(EMPTY_EVENT_FORM);
  const [errors, setErrors] = useState<Partial<Record<keyof EventFormValues, string>>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const handleSubmit = async () => {
    const found = validateEventForm(form);
    setErrors(found);
    if (Object.keys(found).length) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/organizations/ghmo/events", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form)
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "The event could not be saved.");
      // Land on the edit page so the event's tasks can be added straight away.
      toast.success("Event saved. Add its tasks below.");
      const id = data?.event?.id as string | undefined;
      router.replace(id ? (`/admin/events/${encodeURIComponent(id)}/edit` as Route) : "/admin/events");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The event could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex max-w-3xl flex-col gap-6">
      <AdminPageHeader
        back={{ href: "/admin/events", label: "Events" }}
        title="New event"
        description="Add the details, then publish it when you want it on the public Events page."
      />
      <EventForm form={form} update={update} errors={errors} />
      {error ? (
        <Alert variant="destructive">
          <AlertDescription className="text-foreground">{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button size="lg" className="max-sm:flex-1" onClick={handleSubmit} loading={saving}>
          {saving ? "Saving…" : "Save event"}
        </Button>
        <Button size="lg" variant="outline" onClick={() => router.back()} disabled={saving}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
