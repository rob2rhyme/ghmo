"use client";

import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { DEFAULT_TIMEZONE } from "@/src/lib/events.shared";
import { toDate, type DateInput } from "@/src/lib/format";
import { dateToWallTime, isValidTimeZone } from "@/src/lib/zonedTime";

export type EventFormValues = {
  title: string;
  summary: string;
  body: string;
  status: string;
  startsAt: string;
  endsAt: string;
  location: string;
  timezone: string;
  featured: boolean;
  /** Kept from older events; nothing reads it and the form no longer shows it. */
  announcementDocTemplate: string;
};

export const EMPTY_EVENT_FORM: EventFormValues = {
  title: "",
  summary: "",
  body: "",
  status: "draft",
  startsAt: "",
  endsAt: "",
  location: "",
  timezone: DEFAULT_TIMEZONE,
  featured: false,
  announcementDocTemplate: ""
};

const TIMEZONES: { value: string; label: string }[] = [
  { value: "America/New_York", label: "Eastern time (Harrisburg)" },
  { value: "America/Chicago", label: "Central time" },
  { value: "America/Denver", label: "Mountain time" },
  { value: "America/Los_Angeles", label: "Pacific time" },
  { value: "Asia/Kathmandu", label: "Nepal time" }
];

/**
 * A stored date (millis, ISO string or Timestamp-like) as the wall-clock value for <input type="datetime-local">,
 * read in the event's own time zone, so the form shows 7:00 PM for a 7 PM Harrisburg event wherever the admin is.
 * The server reads the value back in the same zone (src/lib/zonedTime.ts).
 */
export function toInputDate(value: unknown, timeZone: string = DEFAULT_TIMEZONE): string {
  const d = toDate(value as DateInput);
  if (!d) return "";
  return dateToWallTime(d, isValidTimeZone(timeZone) ? timeZone : DEFAULT_TIMEZONE);
}

type EventFormProps = {
  form: EventFormValues;
  update: <K extends keyof EventFormValues>(key: K, value: EventFormValues[K]) => void;
  errors?: Partial<Record<keyof EventFormValues, string>>;
};

export function EventForm({ form, update, errors = {} }: EventFormProps) {
  const timezoneKnown = TIMEZONES.some(tz => tz.value === form.timezone);
  return (
    <div className="flex flex-col gap-4">
      <AdminSectionCard title="What is happening">
        <Field label="Event name" error={errors.title}>
          <Input value={form.title} onChange={e => update("title", e.target.value)} placeholder="e.g. Dashain celebration" maxLength={120} required />
        </Field>
        <Field label="Short summary" description="One line shown in event lists and on the home page.">
          <Input value={form.summary} onChange={e => update("summary", e.target.value)} placeholder="e.g. Food, music and tika for the whole community." maxLength={500} />
        </Field>
        <Field label="Full details" description="Shown on the event page: program, what to bring, who to contact." error={errors.body}>
          <Textarea value={form.body} onChange={e => update("body", e.target.value)} className="min-h-40" required />
        </Field>
      </AdminSectionCard>

      <AdminSectionCard title="When and where">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Starts" description="In the time zone chosen below." error={errors.startsAt}>
            <Input type="datetime-local" value={form.startsAt} onChange={e => update("startsAt", e.target.value)} />
          </Field>
          <Field label="Ends (optional)" error={errors.endsAt}>
            <Input type="datetime-local" value={form.endsAt} onChange={e => update("endsAt", e.target.value)} />
          </Field>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Time zone">
            <Select value={form.timezone} onChange={e => update("timezone", e.target.value)}>
              {TIMEZONES.map(tz => (
                <option key={tz.value} value={tz.value}>
                  {tz.label}
                </option>
              ))}
              {!timezoneKnown && form.timezone ? <option value={form.timezone}>{form.timezone}</option> : null}
            </Select>
          </Field>
          <Field label="Place">
            <Input value={form.location} onChange={e => update("location", e.target.value)} placeholder="e.g. Community hall, 100 Main St" maxLength={200} />
          </Field>
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="Who can see it">
        <Field label="Status" description="Drafts are visible to admins only. Published events appear on the public Events page.">
          <Select value={form.status} onChange={e => update("status", e.target.value)}>
            <option value="draft">Draft</option>
            <option value="published">Published</option>
          </Select>
        </Field>
        <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-border p-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-4 accent-[var(--color-primary)]"
            checked={form.featured}
            onChange={e => update("featured", e.target.checked)}
          />
          <span>
            <span className="font-medium">Feature on the Events page</span>
            <span className="block text-muted-foreground">Adds a Featured badge to the event on the public Events and home pages.</span>
          </span>
        </label>
      </AdminSectionCard>
    </div>
  );
}

/** Checks the fields the server requires, in plain words, before sending. */
export function validateEventForm(form: EventFormValues): Partial<Record<keyof EventFormValues, string>> {
  const errors: Partial<Record<keyof EventFormValues, string>> = {};
  if (!form.title.trim()) errors.title = "Give the event a name.";
  if (!form.body.trim()) errors.body = "Add the details people need.";
  if (form.startsAt && form.endsAt && new Date(form.endsAt) < new Date(form.startsAt)) errors.endsAt = "The end must be after the start.";
  return errors;
}
