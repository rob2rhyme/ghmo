"use client";

export const dynamic = "force-dynamic";

import { useEffect, useState } from "react";
import { DEFAULT_TIMEZONE, type EventRecord } from "@/src/lib/events.shared";
import {
  MeetingAttendance,
  MeetingMinutesRecord,
  MinutesStatus,
  minutesStatusLabels,
  minutesStatusPillClasses
} from "@/src/lib/minutes";

const adminStatusDescriptions: Record<MinutesStatus, string> = {
  draft: "Draft minutes are visible to admins only.",
  submitted: "Submitted minutes await approval before publication.",
  approved: "Approved minutes are the official record."
};
import Link from "next/link";
import { notFound, useParams, useRouter } from "next/navigation";

export default function EventDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orgSlug = (params?.orgSlug as string) || "ghmo";
  const eventId = params?.eventId as string;
  const [event, setEvent] = useState<EventRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [meetingMinutes, setMeetingMinutes] = useState<MeetingMinutesRecord | null>(null);
  const [minutesLoading, setMinutesLoading] = useState(true);
  const [adminMinutesAccess, setAdminMinutesAccess] = useState(false);
  const [minutesSource, setMinutesSource] = useState<"public" | "admin">("public");

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/organizations/${orgSlug}/events?status=all`, { cache: "no-store" });
        const data = await res.json();
        const found = (data.events || []).find((e: EventRecord) => e.id === eventId) as EventRecord | undefined;
        if (!found || found.status !== "published") {
          router.replace("/login");
          return;
        }
        setEvent(found);
      } finally {
        setLoading(false);
      }
    };
    if (eventId) void load();
  }, [eventId, orgSlug, router]);

  if (!event && !loading) {
    notFound();
  }

  useEffect(() => {
    if (!eventId) return;
    let active = true;
    const loadMinutes = async () => {
      setMinutesLoading(true);
      try {
        const endpoint = adminMinutesAccess
          ? `/api/admin/minutes?eventId=${eventId}`
          : `/api/organizations/${orgSlug}/events/${eventId}/minutes`;
        const res = await fetch(endpoint, { cache: "no-store" });
        const data = await res.json();
        if (!active) return;
        if (!res.ok) {
          setMeetingMinutes(null);
          setMinutesSource(adminMinutesAccess ? "admin" : "public");
          return;
        }
        let record: MeetingMinutesRecord | null = null;
        if (Array.isArray(data.minutes)) {
          record = data.minutes[0] ?? null;
        } else if (data.minutes) {
          record = data.minutes;
        }
        setMinutesSource(adminMinutesAccess ? "admin" : "public");
        setMeetingMinutes(record);
      } catch (err) {
        if (active) {
          setMeetingMinutes(null);
        }
      } finally {
        if (active) setMinutesLoading(false);
      }
    };
    void loadMinutes();
    return () => {
      active = false;
    };
  }, [eventId, orgSlug, adminMinutesAccess]);

  useEffect(() => {
    let active = true;
    const checkAdmin = async () => {
      try {
        const res = await fetch("/api/admin/minutes");
        if (!active) return;
        setAdminMinutesAccess(res.ok);
      } catch {
        if (active) setAdminMinutesAccess(false);
      }
    };
    void checkAdmin();
    return () => {
      active = false;
    };
  }, []);

  if (!event) {
    return <div className="px-4 py-10 text-sm text-slate-600">Loading event...</div>;
  }

  const start = event.startsAt ? new Date(event.startsAt.toDate?.() || event.startsAt) : null;
  const end = event.endsAt ? new Date(event.endsAt.toDate?.() || event.endsAt) : null;
  const isPastEvent = start ? start.getTime() < Date.now() : false;
  const isAdminMinutesView = adminMinutesAccess && minutesSource === "admin";
  const normalizedMeetingAttendance = meetingMinutes
    ? normalizeEventAttendance(meetingMinutes.attendance)
    : undefined;

  return (
    <div className="mx-auto max-w-3xl space-y-4 px-4 py-10">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold">{event.title}</h1>
          {start ? (
            <p className="text-sm text-slate-600">
              {start.toLocaleString("en-US", { timeZone: event.timezone || DEFAULT_TIMEZONE })}
              {end ? ` - ${end.toLocaleString("en-US", { timeZone: event.timezone || DEFAULT_TIMEZONE })}` : ""}
            </p>
          ) : null}
          {event.location ? <p className="text-sm text-slate-600">{event.location}</p> : null}
        </div>
        <Link
          href={`/api/organizations/${params.orgSlug}/events/${event.id}/announcement.pdf`}
          className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
        >
          Download Announcement PDF
        </Link>
      </div>
      {event.summary ? <p className="text-lg text-slate-700">{event.summary}</p> : null}
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <p className="whitespace-pre-wrap text-slate-800">{event.body}</p>
      </div>
      {isPastEvent ? (
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Meeting Minutes</h2>
            {!meetingMinutes && !minutesLoading && adminMinutesAccess ? (
              <Link href={`/admin?tab=minutes&eventId=${event.id}`} className="text-sm font-semibold text-primary">
                Add minutes
              </Link>
            ) : null}
          </div>
          {minutesLoading ? (
            <p className="mt-2 text-sm text-slate-600">Loading minutes...</p>
          ) : meetingMinutes ? (
            <div className="mt-4 space-y-4 text-sm text-slate-700">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${minutesStatusPillClasses[meetingMinutes.status]}`}
                  >
                    {minutesStatusLabels[meetingMinutes.status]}
                  </span>
                </div>
                {isAdminMinutesView ? (
                  <div className="space-y-1 text-xs text-slate-500">
                    <p>{adminStatusDescriptions[meetingMinutes.status]}</p>
                    {meetingMinutes.submittedAt ? (
                      <p>
                        Submitted by {meetingMinutes.submittedByUid || "—"} •{" "}
                        {formatTimestamp(meetingMinutes.submittedAt)}
                      </p>
                    ) : null}
                    {meetingMinutes.approvedAt ? (
                      <p>
                        Approved by {meetingMinutes.approvedByUid || "—"} •{" "}
                        {formatTimestamp(meetingMinutes.approvedAt)}
                      </p>
                    ) : null}
                  </div>
                ) : meetingMinutes.status === "approved" ? (
                  <p className="text-xs text-slate-500">Official minutes for this event.</p>
                ) : null}
              </div>
              {meetingMinutes.agenda.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Agenda</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {meetingMinutes.agenda.map((item, idx) => (
                      <li key={`agenda-${idx}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {meetingMinutes.discussionSummary ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Discussion summary</p>
                  <p className="text-sm text-slate-700">{meetingMinutes.discussionSummary}</p>
                </div>
              ) : null}
              {meetingMinutes.decisions.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Decisions</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {meetingMinutes.decisions.map((decision, idx) => (
                      <li key={`decision-${idx}`}>{decision}</li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {meetingMinutes.actionItems.length ? (
                <div>
                  <p className="text-xs font-semibold uppercase text-slate-500">Action items</p>
                  <ul className="list-disc space-y-1 pl-5">
                    {meetingMinutes.actionItems.map((action, idx) => (
                      <li key={`action-${idx}`}>
                        {action.task}
                        {action.assignedTo ? ` — ${action.assignedTo}` : ""}
                        {action.dueDate ? ` (due ${new Date(action.dueDate).toLocaleDateString()})` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {renderAttendanceBlock(normalizedMeetingAttendance)}
              {meetingMinutes.signatures && (meetingMinutes.signatures.chairName || meetingMinutes.signatures.secretaryName) ? (
                <div className="space-y-1 text-xs text-slate-600">
                  {meetingMinutes.signatures.chairName ? (
                    <p>
                      <span className="font-semibold text-slate-700">Chair:</span>{" "}
                      {meetingMinutes.signatures.chairName}
                    </p>
                  ) : null}
                  {meetingMinutes.signatures.secretaryName ? (
                    <p>
                      <span className="font-semibold text-slate-700">Secretary:</span>{" "}
                      {meetingMinutes.signatures.secretaryName}
                    </p>
                  ) : null}
                </div>
              ) : null}
              {meetingMinutes.approvalNotes ? (
                <p className="text-xs text-slate-500">Approval notes: {meetingMinutes.approvalNotes}</p>
              ) : null}
              <p className="text-xs text-slate-500">
                Recorded by {meetingMinutes.recordedBy} • {formatTimestamp(meetingMinutes.createdAt)}
              </p>
            </div>
          ) : (
            <p className="mt-2 text-sm text-slate-600">No minutes recorded for this event yet.</p>
          )}
        </div>
      ) : null}
    </div>
  );
}

function formatTimestamp(value?: number) {
  return value ? new Date(value).toLocaleString() : "Date unavailable";
}

function normalizeEventAttendance(value?: MeetingMinutesRecord["attendance"] | string[]): MeetingAttendance | undefined {
  if (!value) return undefined;
  if (Array.isArray(value)) {
    const present = value.map(item => item.trim()).filter(Boolean);
    return present.length ? { present } : undefined;
  }
  const present = (value.present || []).map(item => item.trim()).filter(Boolean);
  const absent = (value.absent || []).map(item => item.trim()).filter(Boolean);
  const guests = (value.guests || []).map(item => item.trim()).filter(Boolean);
  if (!present.length && !absent.length && !guests.length) return undefined;
  const result: MeetingAttendance = { present };
  if (absent.length) result.absent = absent;
  if (guests.length) result.guests = guests;
  return result;
}

function renderAttendanceBlock(attendance?: MeetingAttendance) {
  if (!attendance) return null;
  return (
    <div className="space-y-1 text-xs text-slate-500">
      {attendance.present && attendance.present.length ? (
        <p>
          <span className="font-semibold text-slate-700">Present:</span> {attendance.present.join(", ")}
        </p>
      ) : null}
      {attendance.absent && attendance.absent.length ? (
        <p>
          <span className="font-semibold text-slate-700">Absent:</span> {attendance.absent.join(", ")}
        </p>
      ) : null}
      {attendance.guests && attendance.guests.length ? (
        <p>
          <span className="font-semibold text-slate-700">Guests:</span> {attendance.guests.join(", ")}
        </p>
      ) : null}
    </div>
  );
}
