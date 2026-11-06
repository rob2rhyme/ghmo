"use client";

import type { Route } from "next";
import { useMemo, useState } from "react";
import { Download, NotebookPen } from "lucide-react";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { MeetingMinutesRecord, meetingTypes, MinutesStatus } from "@/src/lib/minutes";
import { useUnpackedMinutes } from "@/src/components/admin/minutes/useUnpackedMinutes";
import { resolveActorLabel } from "@/src/lib/actor";
import { attendanceCsv } from "@/src/lib/attendanceCsv";
import { formatDateTime } from "@/src/lib/format";
import { statusBadge } from "@/src/lib/statusBadges";

const statusOptions: MinutesStatus[] = ["draft", "submitted", "approved"];

type MinutesSearchClientProps = {
  initialMinutes: MeetingMinutesRecord[];
  initialQuery?: string;
};

export default function MinutesSearchClient({ initialMinutes: rawMinutes, initialQuery = "" }: MinutesSearchClientProps) {
  const initialMinutes = useUnpackedMinutes(rawMinutes);
  const [query, setQuery] = useState(initialQuery);
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

  // Exports exactly what the filters show, generated here from the decrypted minutes.
  const exportAttendance = () => {
    const url = URL.createObjectURL(new Blob([attendanceCsv(filteredMinutes)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `attendance-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const count = filteredMinutes.length;

  return (
    <div className="flex flex-col gap-6">
      <AdminSectionCard title="Find minutes" description="Search the text, or narrow by type, status and date.">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Field label="Search" className="md:col-span-2">
            <Input type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Event title, agenda, decisions, attendees…" />
          </Field>
          <Field label="Meeting type">
            <Select value={meetingTypeFilter} onChange={e => setMeetingTypeFilter(e.target.value)}>
              <option value="">All types</option>
              {meetingTypes.map(type => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Status">
            <Select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">All statuses</option>
              {statusOptions.map(status => (
                <option key={status} value={status}>
                  {statusBadge("minutes", status).label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From date">
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
          </Field>
          <Field label="Through date">
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} />
          </Field>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="Records"
        description={
          <span role="status">
            {count} {count === 1 ? "result" : "results"}, newest meeting first.
            {rawMinutes.length >= 100 ? " Only the newest 100 meetings are searched here." : ""}
          </span>
        }
        actions={
          <Button type="button" variant="outline" onClick={exportAttendance} disabled={count === 0}>
            <Download aria-hidden="true" />
            Download attendance (CSV)
          </Button>
        }
      >
        {count === 0 ? (
          <EmptyState
            icon={<NotebookPen aria-hidden="true" />}
            title={initialMinutes.length ? "No minutes match" : "No minutes yet"}
            description={initialMinutes.length ? "Try another word or clear a filter." : "Write the first minutes after a meeting. They show up here once saved."}
            className="py-8"
          />
        ) : (
          <AdminList bare label="Minutes records">
            {filteredMinutes.map(entry => {
              const badge = statusBadge("minutes", entry.status);
              const attendance = formatAttendanceSummary(entry.attendance);
              return (
                <AdminListRow
                  key={entry.id}
                  href={`/admin/minutes?mode=new&minutesId=${entry.id}` as Route}
                  title={entry.eventTitle}
                  badges={<Badge variant={badge.variant}>{badge.label}</Badge>}
                  meta={`${entry.meetingType} · ${formatDateLabel(entry.eventDate ?? undefined)}`}
                >
                  <div className="mt-2 flex flex-col gap-1 text-sm text-muted-foreground">
                    {entry._e2ee === "failed" ? <p className="font-medium text-destructive">Can&apos;t be opened on this device.</p> : null}
                    {entry.agenda.length ? (
                      <p className="break-words">
                        Agenda: {entry.agenda.slice(0, 3).join(", ")}
                        {entry.agenda.length > 3 ? "…" : ""}
                      </p>
                    ) : null}
                    {entry.decisions.length ? <p className="break-words">Decisions: {entry.decisions.join(", ")}</p> : null}
                    {entry.actionItems.length ? <p className="break-words">Action items: {entry.actionItems.map(item => item.task).join(", ")}</p> : null}
                    {attendance ? <p className="break-words">{attendance}</p> : null}
                    <p>
                      Recorded by {resolveActorLabel(entry.recordedBy)} · {formatDateLabel(entry.createdAt)}
                    </p>
                    {entry.approvalNotes ? <p className="break-words">Approval notes: {entry.approvalNotes}</p> : null}
                  </div>
                </AdminListRow>
              );
            })}
          </AdminList>
        )}
      </AdminSectionCard>
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
  return (value && formatDateTime(value)) || "Date unavailable";
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
  return parts.length ? parts.join(" · ") : null;
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
