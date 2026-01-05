"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  MeetingMinutesRecord,
  meetingTypes,
  MinutesStatus,
  minutesStatusLabels,
  minutesStatusPillClasses
} from "@/src/lib/minutes";

const statusOptions: MinutesStatus[] = ["draft", "submitted", "approved"];

type MinutesSearchClientProps = {
  initialMinutes: MeetingMinutesRecord[];
};

export default function MinutesSearchClient({ initialMinutes }: MinutesSearchClientProps) {
  const [query, setQuery] = useState("");
  const [meetingTypeFilter, setMeetingTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const filteredMinutes = useMemo(() => {
    const lowerQuery = query.trim().toLowerCase();
    const startMs = parseDate(startDate, true);
    const endMs = parseDate(endDate, false);
    return initialMinutes
      .filter(record => {
        if (meetingTypeFilter && record.meetingType !== meetingTypeFilter) return false;
        if (statusFilter && record.status !== statusFilter) return false;
        const eventMs = record.eventDate ?? null;
        if (startMs !== null && (eventMs === null || eventMs < startMs)) return false;
        if (endMs !== null && (eventMs === null || eventMs > endMs)) return false;
        if (!lowerQuery) return true;
        return buildSearchText(record).includes(lowerQuery);
      })
      .sort((a, b) => Number(b.eventDate || 0) - Number(a.eventDate || 0));
  }, [initialMinutes, query, meetingTypeFilter, statusFilter, startDate, endDate]);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div className="md:col-span-2">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Search</label>
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Event title, agenda, decisions, attendees..."
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting type</label>
            <select
              value={meetingTypeFilter}
              onChange={e => setMeetingTypeFilter(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All types</option>
              {meetingTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status</label>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="">All statuses</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {minutesStatusLabels[status]}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">From date</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Through date</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-sm text-slate-600">{filteredMinutes.length} result{filteredMinutes.length === 1 ? "" : "s"}</p>
          <Link href="/admin?tab=minutes" className="text-sm font-semibold text-primary">
            Go to minutes editor
          </Link>
        </div>
        <div className="divide-y divide-slate-100">
          {filteredMinutes.length === 0 ? (
            <p className="py-6 text-center text-sm text-slate-500">No minutes match the criteria.</p>
          ) : (
            filteredMinutes.map(entry => (
              <div key={entry.id} className="space-y-3 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{entry.eventTitle}</p>
                    <p className="text-xs text-slate-500">
                    {entry.meetingType} • {formatDateLabel(entry.eventDate ?? undefined)}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${minutesStatusPillClasses[entry.status]}`}
                  >
                    {minutesStatusLabels[entry.status]}
                  </span>
                </div>
                {entry.agenda.length ? (
                  <p className="text-xs text-slate-500">
                    Agenda: {entry.agenda.slice(0, 3).join(", ")}
                    {entry.agenda.length > 3 ? "…" : ""}
                  </p>
                ) : null}
                {entry.decisions.length ? (
                  <p className="text-xs text-slate-500">
                    Decisions: {entry.decisions.join(", ")}
                  </p>
                ) : null}
                {entry.actionItems.length ? (
                  <p className="text-xs text-slate-500">
                    Action items: {entry.actionItems.map(item => item.task).join(", ")}
                  </p>
                ) : null}
                {formatAttendanceSummary(entry.attendance) ? (
                  <p className="text-xs text-slate-500">{formatAttendanceSummary(entry.attendance)}</p>
                ) : null}
                <p className="text-xs text-slate-500">
                  Recorded by {entry.recordedBy} • {formatDateLabel(entry.createdAt)}
                </p>
                {entry.approvalNotes ? (
                  <p className="text-xs text-slate-500">Approval notes: {entry.approvalNotes}</p>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

function buildSearchText(record: MeetingMinutesRecord) {
  const attendance = flattenAttendance(record.attendance);
  const actionTasks = record.actionItems.map(item => item.task);
  return [
    record.eventTitle,
    ...record.agenda,
    ...record.decisions,
    ...actionTasks,
    ...attendance
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function flattenAttendance(attendance?: MeetingMinutesRecord["attendance"]) {
  if (!attendance) return [];
  return [...(attendance.present ?? []), ...(attendance.absent ?? []), ...(attendance.guests ?? [])];
}

function formatDateLabel(value?: number) {
  if (!value) return "Date unavailable";
  return new Date(value).toLocaleString();
}

function formatAttendanceSummary(attendance?: MeetingMinutesRecord["attendance"]) {
  if (!attendance) return null;
  const parts = [];
  if (attendance.present && attendance.present.length) {
    parts.push(`Present: ${attendance.present.join(", ")}`);
  }
  if (attendance.absent && attendance.absent.length) {
    parts.push(`Absent: ${attendance.absent.join(", ")}`);
  }
  if (attendance.guests && attendance.guests.length) {
    parts.push(`Guests: ${attendance.guests.join(", ")}`);
  }
  return parts.length ? parts.join(" • ") : null;
}

function parseDate(value: string, startOfDay: boolean) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  if (startOfDay) {
    parsed.setHours(0, 0, 0, 0);
  } else {
    parsed.setHours(23, 59, 59, 999);
  }
  return parsed.getTime();
}
