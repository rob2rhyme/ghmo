"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { SearchInput } from "@/src/components/ui/search-input";
import { Select } from "@/src/components/ui/select";
import { COMMUNITY_SLUG } from "@/src/lib/community.constants";
import { DEFAULT_TIMEZONE } from "@/src/lib/events.shared";
import { formatDateTime } from "@/src/lib/format";
import { dayKeyIn, sameDayMeetings } from "@/src/lib/minutesMeeting";

/** A meeting that has started, as the minutes page lists it (plan §26). */
export type MeetingOption = { id: string; title?: string; startsAtMs: number; timezone?: string; location?: string };

const label = (meeting: MeetingOption) => `${meeting.title || "Untitled event"} · ${formatDateTime(meeting.startsAtMs)}`;

/**
 * The meeting list: newest first, searchable once it is long, and meetings that already have minutes are shown but
 * can't be picked (D66).
 */
export function MeetingSelect({
  meetings,
  value,
  onChange,
  takenIds,
  disabled,
  id
}: {
  meetings: MeetingOption[];
  value: string;
  onChange: (id: string) => void;
  takenIds: Set<string>;
  disabled?: boolean;
  id?: string;
}) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const shown = needle ? meetings.filter(m => m.id === value || label(m).toLowerCase().includes(needle)) : meetings;
  return (
    <div className="flex flex-col gap-2">
      {meetings.length > 6 ? <SearchInput aria-label="Find a meeting" placeholder="Search by title or date" value={query} onChange={setQuery} disabled={disabled} /> : null}
      <Select id={id} value={value} onChange={e => onChange(e.target.value)} disabled={disabled}>
        <option value="">Choose a past meeting</option>
        {shown.map(meeting => {
          const taken = takenIds.has(meeting.id) && meeting.id !== value;
          return (
            <option key={meeting.id} value={meeting.id} disabled={taken}>
              {label(meeting)}
              {taken ? " · has minutes" : ""}
            </option>
          );
        })}
      </Select>
      {needle && shown.length === 0 ? <p className="text-sm text-muted-foreground">No meeting matches. Record it as a new meeting instead.</p> : null}
    </div>
  );
}

const todayKey = () => dayKeyIn(Date.now(), DEFAULT_TIMEZONE);

/** A start time from the events API: milliseconds, an ISO string, or a stored timestamp ({ _seconds } or { seconds }). */
function startMillis(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  const stamp = value as { _seconds?: number; seconds?: number } | null;
  const seconds = stamp?._seconds ?? stamp?.seconds;
  return typeof seconds === "number" ? seconds * 1000 : NaN;
}

/**
 * "Record a meeting that isn't listed" (D64): title, day, time and an optional place. It is saved as a **draft** event,
 * so it never shows on the public site, then picked for these minutes. A meeting already on that day is offered first.
 */
export function RecordMeetingDialog({
  meetings,
  takenIds,
  onClose,
  onUseExisting,
  onCreated
}: {
  meetings: MeetingOption[];
  takenIds: Set<string>;
  onClose: () => void;
  onUseExisting: (id: string) => void;
  onCreated: (meeting: MeetingOption) => void;
}) {
  const [title, setTitle] = useState("");
  const [day, setDay] = useState(todayKey);
  const [time, setTime] = useState("19:00");
  const [place, setPlace] = useState("");
  const [busy, setBusy] = useState(false);
  const sameDay = useMemo(() => sameDayMeetings(meetings, day, DEFAULT_TIMEZONE).filter(m => !takenIds.has(m.id)), [meetings, day, takenIds]);
  const future = Boolean(day && time) && `${day}T${time}` > `${todayKey()}T${new Date().toLocaleTimeString("en-GB", { timeZone: DEFAULT_TIMEZONE, hour: "2-digit", minute: "2-digit" })}`;
  const ready = title.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{2}:\d{2}$/.test(time) && !future;

  const save = async () => {
    setBusy(true);
    try {
      const res = await fetch(`/api/admin/organizations/${COMMUNITY_SLUG}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          body: `${title.trim()}. Recorded from the minutes page.`,
          status: "draft",
          timezone: DEFAULT_TIMEZONE,
          startsAt: `${day}T${time}`,
          ...(place.trim() ? { location: place.trim() } : {})
        })
      });
      const data = (await res.json().catch(() => ({}))) as { event?: { id: string; title?: string; startsAt?: unknown; location?: string }; error?: string };
      if (!res.ok || !data.event) throw new Error(data.error === "INVALID_DATE" ? "That date or time isn't valid." : data.error || "Couldn't save the meeting. Try again.");
      const startsAtMs = startMillis(data.event.startsAt);
      onCreated({ id: data.event.id, title: data.event.title, startsAtMs, location: data.event.location, timezone: DEFAULT_TIMEZONE });
      toast.success("Meeting recorded. It stays a draft, so it isn't shown on the public site.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't save the meeting. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <form
          className="grid gap-4"
          onSubmit={event => {
            event.preventDefault();
            if (ready) void save();
          }}
        >
          <DialogHeader>
            <DialogTitle>Record a meeting that isn&apos;t listed</DialogTitle>
            <DialogDescription>For a board call or a meeting nobody added beforehand. It is saved as a draft event, so it never appears on the public site.</DialogDescription>
          </DialogHeader>
          <Field label="Meeting title">
            <Input value={title} maxLength={120} placeholder="For example: Board call" onChange={e => setTitle(e.target.value)} required />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Date" error={future ? "Minutes are for a meeting that has already happened." : undefined}>
              <Input type="date" value={day} max={todayKey()} onChange={e => setDay(e.target.value)} required />
            </Field>
            <Field label="Start time">
              <Input type="time" value={time} onChange={e => setTime(e.target.value)} required />
            </Field>
          </div>
          <Field label="Place (optional)">
            <Input value={place} maxLength={200} placeholder="For example: Phone call, or the hall" onChange={e => setPlace(e.target.value)} />
          </Field>
          {sameDay.length > 0 ? (
            <div className="grid gap-2 rounded-lg border p-3 text-sm" data-testid="same-day">
              <p className="font-medium">Already on that day:</p>
              {sameDay.map(meeting => (
                <div key={meeting.id} className="flex flex-wrap items-center justify-between gap-2">
                  <span>{label(meeting)}</span>
                  <Button type="button" size="row" variant="outline" onClick={() => onUseExisting(meeting.id)}>
                    Use this meeting
                  </Button>
                </div>
              ))}
            </div>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!ready}>
              Record meeting
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** "Change meeting" on draft minutes (D67): pick another past meeting without minutes; the server moves them. */
export function ChangeMeetingDialog({
  minutesId,
  currentEventId,
  meetings,
  takenIds,
  onClose,
  onMoved
}: {
  minutesId: string;
  currentEventId: string;
  meetings: MeetingOption[];
  takenIds: Set<string>;
  onClose: () => void;
  onMoved: (minutes: unknown) => Promise<void> | void;
}) {
  const [target, setTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const choices = meetings.filter(m => m.id !== currentEventId);

  const move = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/minutes/move", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: minutesId, eventId: target }) });
      const data = (await res.json().catch(() => ({}))) as { minutes?: unknown; error?: string };
      if (!res.ok || !data.minutes) throw new Error(data.error || "Couldn't move the minutes. Try again.");
      await onMoved(data.minutes);
      toast.success("Minutes moved to the other meeting.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Couldn't move the minutes. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change meeting</DialogTitle>
          <DialogDescription>Move these draft minutes to another meeting. Its title and date replace the current ones; what you wrote stays.</DialogDescription>
        </DialogHeader>
        <Field label="Move to">
          <MeetingSelect meetings={choices} value={target} onChange={setTarget} takenIds={takenIds} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" loading={busy} disabled={!target} onClick={() => void move()}>
            Move minutes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
