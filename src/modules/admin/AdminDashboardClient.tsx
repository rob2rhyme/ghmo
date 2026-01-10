"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { jsPDF } from "jspdf";
import * as htmlToImage from "html-to-image";
import { COMMUNITY_SLUG } from "@/src/lib/community.constants";
import {
  meetingTypes,
  MeetingAttendance,
  MeetingMinutesFormInput,
  MeetingMinutesRecord,
  MeetingSignatures,
  MinutesStatus,
  minutesStatusLabels,
  minutesStatusPillClasses
} from "@/src/lib/minutes";
import { resolveActorLabel, resolveActorName } from "@/src/lib/actor";
import { useSearchParams } from "next/navigation";
import MinutesPreview, { MinutesPreviewData } from "@/src/features/minutes/components/MinutesPreview";
import { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from "@/src/features/docgen/components/LetterheadPage";

type AdminActor = {
  uid: string;
  email?: string;
  name?: string;
};

type AdminEvent = {
  id: string;
  title?: string;
  startsAt?: string | null;
  timezone?: string;
  location?: string;
};

type PastEvent = AdminEvent & {
  startsAtMs: number;
};

type PreviewActionItem = NonNullable<MinutesPreviewData["actionItems"]>[number];
const isNonNull = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

type AdminDashboardProps = {
  community: any;
  stats: any;
  webhookEvents: any[];
  auditLogs: any[];
  blocks: any[];
  minutes: MeetingMinutesRecord[];
  adminActor: AdminActor;
};

type ExportFormat = "pdf" | "jpeg";
type PreviewZoomMode = "fit" | "100";
const PIXEL_RATIO = 2;
const statusHelperText: Record<MinutesStatus, string> = {
  draft: "Draft minutes can be updated before submission.",
  submitted: "Submitted minutes are awaiting approval.",
  approved: "Approved minutes are locked until you return them to draft."
};
const SHOW_HOME_CONTENT_BLOCKS = false;
const SHOW_WEBHOOK_EVENTS = false;

export default function AdminDashboardClient({
  community,
  stats,
  webhookEvents,
  auditLogs,
  blocks,
  minutes,
  adminActor
}: AdminDashboardProps) {
  const [blockText, setBlockText] = useState(JSON.stringify(blocks, null, 2));
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<string | null>(null);

  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  const [minutesEntries, setMinutesEntries] = useState<MeetingMinutesRecord[]>(minutes ?? []);
  const [formState, setFormState] = useState<MeetingMinutesFormInput>(() => createEmptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [minutesSaveStatus, setMinutesSaveStatus] = useState<string | null>(null);
  const [isSavingMinutes, setIsSavingMinutes] = useState(false);
  const minutesPreviewRef = useRef<HTMLDivElement | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [isExportingMinutes, setIsExportingMinutes] = useState(false);
  const [minutesExportStatus, setMinutesExportStatus] = useState<string | null>(null);
  const [approvalNotesInput, setApprovalNotesInput] = useState("");
  const [statusActionStatus, setStatusActionStatus] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [attendanceExpanded, setAttendanceExpanded] = useState(false);
  const [signaturesExpanded, setSignaturesExpanded] = useState(false);
  const [previewZoomMode, setPreviewZoomMode] = useState<PreviewZoomMode>("fit");

  const saveBlocks = async () => {
    try {
      setSaveStatus("Saving...");
      const parsed = JSON.parse(blockText);
      await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: parsed })
      });
      setSaveStatus("Saved");
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    }
  };

  useEffect(() => {
    let isActive = true;
    const loadEvents = async () => {
      setEventsError(null);
      setEventsLoading(true);
      try {
        const res = await fetch(`/api/admin/organizations/${COMMUNITY_SLUG}/events?status=all`);
        if (!res.ok) throw new Error("Failed to load events");
        const data = await res.json();
        if (!isActive) return;
        setEvents(Array.isArray(data.events) ? data.events : []);
      } catch (err: any) {
        if (isActive) setEventsError(err.message || "Unable to load events");
      } finally {
        if (isActive) setEventsLoading(false);
      }
    };
    void loadEvents();
    return () => {
      isActive = false;
    };
  }, []);

  const searchParams = useSearchParams();
  useEffect(() => {
    const eventParam = searchParams.get("eventId");
    if (eventParam && !editingId) {
      setFormState(prev => ({ ...prev, eventId: prev.eventId || eventParam }));
    }
  }, [editingId, searchParams]);

  useEffect(() => {
    setMinutesEntries(minutes ?? []);
  }, [minutes]);

  const cancelMinutesEdit = () => {
    setEditingId(null);
    setFormState(createEmptyForm());
    setMinutesSaveStatus(null);
  };

  const loadMinutesIntoForm = (entry: MeetingMinutesRecord) => {
    setFormState({
      eventId: entry.eventId,
      meetingType: entry.meetingType,
      chairedBy: entry.chairedBy || "",
      agenda: entry.agenda.length ? entry.agenda : [""],
      discussionSummary: entry.discussionSummary || "",
      decisions: entry.decisions.length ? entry.decisions : [""],
      actionItems:
        entry.actionItems.length > 0
          ? entry.actionItems.map(item => ({
              task: item.task,
              assignedTo: item.assignedTo || "",
              dueDate: item.dueDate ? new Date(item.dueDate).toISOString().slice(0, 10) : ""
            }))
          : [{ task: "", assignedTo: "", dueDate: "" }],
      attendance: normalizeAttendance(entry.attendance),
      signatures: {
        chairName: entry.signatures?.chairName || "",
        secretaryName: entry.signatures?.secretaryName || ""
      }
    });
    setEditingId(entry.id);
    setMinutesSaveStatus(null);
    setApprovalNotesInput(entry.approvalNotes || "");
  };

  const updateTextList = (field: "agenda" | "decisions", index: number, value: string) => {
    setFormState(prev => {
      const next = [...prev[field]];
      next[index] = value;
      return { ...prev, [field]: next };
    });
  };

  const appendTextList = (field: "agenda" | "decisions") => {
    setFormState(prev => ({ ...prev, [field]: [...prev[field], ""] }));
  };

  const removeTextListEntry = (field: "agenda" | "decisions", index: number) => {
    setFormState(prev => {
      const next = prev[field].filter((_, idx) => idx !== index);
      return { ...prev, [field]: next.length > 0 ? next : [""] };
    });
  };

  type AttendanceSection = keyof MeetingAttendance;

  const updateAttendanceItem = (section: AttendanceSection, index: number, value: string) => {
    setFormState(prev => {
      const attendance = ensureAttendanceState(prev.attendance);
      const sectionList = attendance[section] ?? [""];
      const next = [...sectionList];
      next[index] = value;
      return { ...prev, attendance: { ...attendance, [section]: next } };
    });
  };

  const appendAttendanceItem = (section: AttendanceSection) => {
    setFormState(prev => {
      const attendance = ensureAttendanceState(prev.attendance);
      const sectionList = attendance[section] ?? [""];
      return { ...prev, attendance: { ...attendance, [section]: [...sectionList, ""] } };
    });
  };

  const removeAttendanceItem = (section: AttendanceSection, index: number) => {
    setFormState(prev => {
      const attendance = ensureAttendanceState(prev.attendance);
      const sectionList = attendance[section] ?? [""];
      const next = sectionList.filter((_, idx) => idx !== index);
      return { ...prev, attendance: { ...attendance, [section]: next.length > 0 ? next : [""] } };
    });
  };

  const updateActionItem = (index: number, key: "task" | "assignedTo" | "dueDate", value: string) => {
    setFormState(prev => {
      const next = [...prev.actionItems];
      const current = { ...next[index], [key]: value };
      next[index] = current;
      return { ...prev, actionItems: next };
    });
  };

  const appendActionItem = () => {
    setFormState(prev => ({ ...prev, actionItems: [...prev.actionItems, { task: "", assignedTo: "", dueDate: "" }] }));
  };

  const removeActionItem = (index: number) => {
    setFormState(prev => {
      const next = prev.actionItems.filter((_, idx) => idx !== index);
      return { ...prev, actionItems: next.length > 0 ? next : [{ task: "", assignedTo: "", dueDate: "" }] };
    });
  };

  const updateSignatureField = (field: "chairName" | "secretaryName", value: string) => {
    setFormState(prev => ({
      ...prev,
      signatures: {
        ...(prev.signatures || { chairName: "", secretaryName: "" }),
        [field]: value
      }
    }));
  };

  const handleMinutesSubmit = async () => {
    if (isSavingMinutes) return;
    if (isApproved) {
      setMinutesSaveStatus("Approved minutes are locked. Return to draft to update.");
      return;
    }
    if (!formState.eventId) {
      setMinutesSaveStatus("Select an event before saving minutes.");
      return;
    }

    setIsSavingMinutes(true);
    setMinutesSaveStatus("Saving minutes...");
    const trimmedAgenda = formState.agenda.map(item => item.trim()).filter(Boolean);
    const trimmedDecisions = formState.decisions.map(item => item.trim()).filter(Boolean);
    const cleanedActionItems = formState.actionItems
      .map(item => ({
        task: item.task.trim(),
        assignedTo: item.assignedTo?.trim() || undefined,
        dueDate: item.dueDate || undefined
      }))
      .filter(item => item.task);
    const attendancePayload = buildAttendancePayload(formState.attendance);
    const payload: MeetingMinutesFormInput = {
      eventId: formState.eventId,
      meetingType: formState.meetingType,
      chairedBy: formState.chairedBy?.trim() || undefined,
      agenda: trimmedAgenda,
      discussionSummary: formState.discussionSummary?.trim() || undefined,
      decisions: trimmedDecisions,
      actionItems: cleanedActionItems,
      ...(attendancePayload ? { attendance: attendancePayload } : {})
    };
    const signaturesPayload: MeetingSignatures = {};
    const chairName = formState.signatures?.chairName?.trim();
    const secretaryName = formState.signatures?.secretaryName?.trim();
    if (chairName) signaturesPayload.chairName = chairName;
    if (secretaryName) signaturesPayload.secretaryName = secretaryName;
    if (Object.keys(signaturesPayload).length) {
      payload.signatures = signaturesPayload;
    }
    const method = editingId ? "PATCH" : "POST";
    const body = editingId ? { id: editingId, ...payload } : payload;
    try {
      const res = await fetch("/api/admin/minutes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      const saved = data.minutes;
      setMinutesEntries(prev =>
        editingId ? prev.map(entry => (entry.id === editingId ? saved : entry)) : [saved, ...prev]
      );
      setMinutesSaveStatus(editingId ? "Updated meeting minutes" : "Meeting minutes saved");
      setFormState(createEmptyForm());
      setEditingId(null);
    } catch (err: any) {
      setMinutesSaveStatus(`Error: ${err.message || "Unable to save minutes"}`);
    } finally {
      setIsSavingMinutes(false);
    }
  };

  const handleMinutesExport = async (format: ExportFormat) => {
    if (isExportingMinutes) return;
    if (!formState.eventId) {
      setMinutesExportStatus("Select an event before exporting.");
      return;
    }
    if (!minutesPreviewRef.current || !previewReady) {
      setMinutesExportStatus("Preview is still loading.");
      return;
    }

    setIsExportingMinutes(true);
    setMinutesExportStatus("Generating export...");
    const exportWidth = LETTER_WIDTH_PX * PIXEL_RATIO;
    const exportHeight = LETTER_HEIGHT_PX * PIXEL_RATIO;
    try {
      const dataUrl = await htmlToImage.toPng(minutesPreviewRef.current, {
        width: exportWidth,
        height: exportHeight,
        pixelRatio: PIXEL_RATIO,
        backgroundColor: "#ffffff"
      });
      const safeTitle = (displayEventTitle || "meeting-minutes")
        .toLowerCase()
        .replace(/\s+/g, "-")
        .replace(/[^a-z0-9-]/g, "")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "");
      const baseName = safeTitle || "meeting-minutes";
      if (format === "jpeg") {
        downloadDataUrl(`${baseName}.jpg`, dataUrl);
        setMinutesExportStatus("JPEG ready to download.");
      } else {
        const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "letter" });
        const pageWidth = doc.internal.pageSize.getWidth();
        const pageHeight = doc.internal.pageSize.getHeight();
        doc.addImage(dataUrl, "PNG", 0, 0, pageWidth, pageHeight);
        doc.save(`${baseName}.pdf`);
        setMinutesExportStatus("PDF downloaded.");
      }
      } catch (err: any) {
        console.error("Minutes export failed", err);
        setMinutesExportStatus(err?.message ? `Error: ${err.message}` : "Failed to export minutes.");
      } finally {
        setIsExportingMinutes(false);
      }
  };

  const handleMinutesStatusAction = async (action: "submit" | "approve" | "returnToDraft") => {
    if (isUpdatingStatus) return;
    if (!editingId) {
      setStatusActionStatus("Save minutes before changing status.");
      return;
    }
    setIsUpdatingStatus(true);
    setStatusActionStatus("Updating status...");
    try {
      const res = await fetch("/api/admin/minutes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: editingId,
          action,
          approvalNotes: action === "approve" ? approvalNotesInput.trim() || undefined : undefined
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      const updated = data.minutes;
      setMinutesEntries(prev =>
        prev.map(entry => (entry.id === updated.id ? updated : entry))
      );
      loadMinutesIntoForm(updated);
      setStatusActionStatus(action === "approve" ? "Minutes approved." : action === "returnToDraft" ? "Marked as draft." : "Submitted for approval.");
    } catch (err: any) {
      setStatusActionStatus(`Error: ${err.message || "Unable to change status."}`);
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const pastEvents = useMemo(() => {
    const now = Date.now();
    return events
      .map(evt => {
        const startMs = evt.startsAt ? Date.parse(evt.startsAt) : NaN;
        if (isNaN(startMs) || !isFinite(startMs)) return null;
        return { ...evt, startsAtMs: startMs };
      })
      .filter((evt): evt is PastEvent => Boolean(evt && evt.startsAtMs <= now))
      .sort((a, b) => b.startsAtMs - a.startsAtMs);
  }, [events]);

  const selectedEvent = useMemo(
    () => pastEvents.find(evt => evt.id === formState.eventId) ?? null,
    [pastEvents, formState.eventId]
  );
  const editingEntry = editingId ? minutesEntries.find(entry => entry.id === editingId) ?? null : null;
  const editingStatus: MinutesStatus = (editingEntry?.status as MinutesStatus) ?? "draft";
  const isApproved = editingStatus === "approved";
  const canSubmitForApproval = Boolean(editingEntry && editingStatus === "draft");
  const canApproveMinutes = Boolean(editingEntry && editingStatus === "submitted");
  const canReturnToDraft = Boolean(editingEntry && editingStatus !== "draft");
  const displayEventTitle = selectedEvent?.title || editingEntry?.eventTitle;
  const displayEventDateMs = selectedEvent?.startsAtMs ?? editingEntry?.eventDate ?? null;
  const displayEventDate = displayEventDateMs ? new Date(displayEventDateMs).toLocaleString() : null;
  const adminRecordedBy = resolveActorName(adminActor);
  const sortedMinutesEntries = useMemo(
    () => [...minutesEntries].sort((a, b) => (b.eventDate || 0) - (a.eventDate || 0)),
    [minutesEntries]
  );
  const previewMinutesData = useMemo<MinutesPreviewData>(() => {
    const agenda = formState.agenda.map(item => item.trim()).filter(Boolean);
    const decisions = formState.decisions.map(item => item.trim()).filter(Boolean);
    const attendance = buildAttendancePayload(formState.attendance);
    const actionItems = formState.actionItems
      .map<PreviewActionItem | null>(item => {
        const task = item.task.trim();
        if (!task) return null;
        return {
          task,
          assignedTo: item.assignedTo?.trim() || undefined,
          dueDate: item.dueDate ? item.dueDate : undefined
        };
      })
      .filter(isNonNull);

    return {
      eventTitle: displayEventTitle || undefined,
      eventDate: displayEventDateMs ?? undefined,
      meetingType: formState.meetingType,
      agenda,
      discussionSummary: formState.discussionSummary?.trim() || undefined,
      decisions,
      actionItems,
      attendance,
      recordedBy: resolveActorName(editingEntry?.recordedBy ?? adminRecordedBy),
      signatures: formState.signatures,
      approvalNotes: approvalNotesInput.trim() || undefined
    };
  }, [formState, displayEventTitle, displayEventDateMs, adminRecordedBy, editingEntry, approvalNotesInput]);
  useEffect(() => {
    if (!editingEntry) {
      setApprovalNotesInput("");
      setStatusActionStatus(null);
      return;
    }
    setApprovalNotesInput(editingEntry.approvalNotes || "");
    setStatusActionStatus(null);
  }, [editingEntry]);
  useEffect(() => {
    setPreviewReady(false);
  }, [previewMinutesData]);

  const attendanceState = ensureAttendanceState(formState.attendance);

  const triggerReconcile = async () => {
    try {
      setReconcileStatus("Reconciling...");
      const res = await fetch("/api/gfmpro/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: community.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setReconcileStatus("Reconcile triggered");
    } catch (err: any) {
      setReconcileStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-slate-600">{community.name}</p>
          </div>
          <div className="flex gap-2">
            <a
              href="/admin/events"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-primary/50"
            >
              Events
            </a>
            <button
              onClick={triggerReconcile}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Manual Reconcile
            </button>
          </div>
        </div>
        {reconcileStatus ? <p className="mt-2 text-sm text-slate-600">{reconcileStatus}</p> : null}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Raised" value={`$${(stats.totalRaised || 0).toLocaleString()}`} />
          <StatCard label="Goal" value={`$${(stats.goal || 0).toLocaleString()}`} />
          <StatCard label="Donors" value={stats.donorCount || 0} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_440px]">
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">
                  {editingId ? "Update Meeting Minutes" : "Add Meeting Minutes"}
                </p>
                <h2 className="mt-1 text-2xl font-semibold text-slate-900">
                  {selectedEvent?.title || displayEventTitle || "Create minutes"}
                </h2>
                <p className="mt-2 text-sm text-slate-500">
                  Link structured minutes to a past event. Admin-only governance tool.
                </p>
                {editingEntry ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${minutesStatusPillClasses[editingStatus]}`}
                    >
                      {minutesStatusLabels[editingStatus]}
                    </span>
                    <p className="text-xs text-slate-500">{statusHelperText[editingStatus]}</p>
                  </div>
                ) : null}
              </div>
              {editingId ? (
                <button
                  onClick={cancelMinutesEdit}
                  className="whitespace-nowrap rounded-full border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:border-primary hover:text-slate-900"
                  type="button"
                >
                  Cancel edit
                </button>
              ) : null}
            </div>
          </div>

          <fieldset disabled={isApproved} className="space-y-5">
            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span aria-hidden>📋</span>
                  <span>Event & Meeting metadata</span>
                </div>
                <span className="text-xs text-slate-400">Required</span>
              </div>
              <div className="space-y-4 px-5 py-5">
                <div className="space-y-2">
                  <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Event</label>
                  <select
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                    value={formState.eventId}
                    onChange={e => setFormState(prev => ({ ...prev, eventId: e.target.value }))}
                    disabled={Boolean(editingId)}
                  >
                    <option value="">Select a past event</option>
                    {pastEvents.map(evt => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title || "Untitled event"} — {new Date(evt.startsAtMs).toLocaleString()}
                      </option>
                    ))}
                  </select>
                  {eventsLoading ? (
                    <p className="text-xs text-slate-500">Loading past events...</p>
                  ) : eventsError ? (
                    <p className="text-xs text-red-500">{eventsError}</p>
                  ) : pastEvents.length === 0 ? (
                    <p className="text-xs text-slate-500">No past events available yet.</p>
                  ) : null}
                </div>
                {displayEventTitle ? (
                  <div className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">{displayEventTitle}</p>
                    <p>{displayEventDate ?? "Date unavailable"}</p>
                  </div>
                ) : null}
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Meeting Type</label>
                    <select
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                      value={formState.meetingType}
                      onChange={e =>
                        setFormState(prev => ({ ...prev, meetingType: e.target.value as MeetingMinutesFormInput["meetingType"] }))
                      }
                    >
                      {meetingTypes.map(type => (
                        <option key={type} value={type}>
                          {type}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Chaired by</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                      value={formState.chairedBy}
                      onChange={e => setFormState(prev => ({ ...prev, chairedBy: e.target.value }))}
                      placeholder="Optional chair"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recorded by</label>
                    <input
                      className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600 focus:outline-none"
                      value={adminRecordedBy}
                      readOnly
                    />
                  </div>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span aria-hidden>📝</span>
                  <span>Agenda items</span>
                </div>
                <button
                  type="button"
                  onClick={() => appendTextList("agenda")}
                  className="flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  <span aria-hidden>+</span> Add
                </button>
              </div>
              <div className="space-y-3 px-5 py-5">
                <p className="text-xs text-slate-500">Capture the flow of the meeting for reference.</p>
                {formState.agenda.map((item, index) => (
                  <div
                    key={`agenda-${index}`}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <input
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                      value={item}
                      onChange={e => updateTextList("agenda", index, e.target.value)}
                      placeholder="Agenda item"
                    />
                    <button
                      type="button"
                      onClick={() => removeTextListEntry("agenda", index)}
                      className="rounded-full p-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span aria-hidden>💬</span>
                  <span>Discussion summary</span>
                </div>
                <span className="text-xs text-slate-400">Required</span>
              </div>
              <div className="px-5 py-5">
                <textarea
                  className="w-full rounded-2xl border border-slate-200 px-3 py-3 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                  value={formState.discussionSummary}
                  onChange={e => setFormState(prev => ({ ...prev, discussionSummary: e.target.value }))}
                  rows={4}
                  placeholder="Summarize the discussion"
                />
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span aria-hidden>✅</span>
                  <span>Decisions / motions</span>
                </div>
                <button
                  type="button"
                  onClick={() => appendTextList("decisions")}
                  className="flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  <span aria-hidden>+</span> Add
                </button>
              </div>
              <div className="space-y-3 px-5 py-5">
                <p className="text-xs text-slate-500">Capture each motion or decision for historical context.</p>
                {formState.decisions.map((item, index) => (
                  <div
                    key={`decision-${index}`}
                    className="flex items-start gap-3 rounded-2xl border border-slate-100 bg-slate-50 p-3"
                  >
                    <input
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                      value={item}
                      onChange={e => updateTextList("decisions", index, e.target.value)}
                      placeholder="Decision"
                    />
                    <button
                      type="button"
                      onClick={() => removeTextListEntry("decisions", index)}
                      className="rounded-full p-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <span aria-hidden>🧭</span>
                  <span>Action items</span>
                </div>
                <button
                  type="button"
                  onClick={appendActionItem}
                  className="flex items-center gap-1 text-xs font-semibold text-primary"
                >
                  <span aria-hidden>+</span> Add action
                </button>
              </div>
              <div className="space-y-3 px-5 py-5">
                <p className="text-xs text-slate-500">Assign follow ups with owners and due dates.</p>
                {formState.actionItems.map((item, index) => (
                  <div key={`action-${index}`} className="space-y-3 rounded-2xl border border-slate-100 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <input
                        className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                        value={item.task}
                        onChange={e => updateActionItem(index, "task", e.target.value)}
                        placeholder="Task"
                      />
                      <button
                        type="button"
                        onClick={() => removeActionItem(index)}
                        className="rounded-full p-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                      >
                        ×
                      </button>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <input
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                        value={item.assignedTo}
                        onChange={e => updateActionItem(index, "assignedTo", e.target.value)}
                        placeholder="Assigned to (optional)"
                      />
                      <input
                        type="date"
                        className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                        value={item.dueDate || ""}
                        onChange={e => updateActionItem(index, "dueDate", e.target.value)}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setAttendanceExpanded(prev => !prev)}
                className="flex w-full items-center justify-between px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>👥</span>
                  <span>Attendance</span>
                  <span className="text-[10px] font-normal">Optional</span>
                </span>
                <span className="text-xs text-slate-400">{attendanceExpanded ? "Hide" : "Show"}</span>
              </button>
              {attendanceExpanded ? (
                <div className="border-t border-slate-100 px-5 py-5">
                  <div className="space-y-4">
                    {(["present", "absent", "guests"] as AttendanceSection[]).map(section => {
                      const rows = attendanceState[section] ?? [""];
                      return (
                        <div key={section} className="space-y-2">
                          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <span>
                              {section === "present" ? "Present" : section === "absent" ? "Absent" : "Guests"}
                            </span>
                            <button
                              type="button"
                              onClick={() => appendAttendanceItem(section)}
                              className="flex items-center gap-1 text-xs font-semibold text-primary"
                            >
                              <span aria-hidden>+</span>
                              Add
                            </button>
                          </div>
                          <div className="space-y-2">
                            {rows.map((person, index) => (
                              <div
                                key={`${section}-${index}`}
                                className="flex items-center gap-3 rounded-full border border-slate-200 bg-white/80 px-3 py-2"
                              >
                                <input
                                  className="flex-1 bg-transparent text-sm focus:outline-none"
                                  value={person}
                                  onChange={e => updateAttendanceItem(section, index, e.target.value)}
                                  placeholder="Name or role"
                                />
                                <button
                                  type="button"
                                  onClick={() => removeAttendanceItem(section, index)}
                                  className="rounded-full p-1 text-xs font-semibold text-slate-500 transition hover:text-slate-700"
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </section>

            <section className="rounded-2xl border border-slate-200 bg-white shadow-sm">
              <button
                type="button"
                onClick={() => setSignaturesExpanded(prev => !prev)}
                className="flex w-full items-center justify-between px-5 py-4 text-xs font-semibold uppercase tracking-wide text-slate-500"
              >
                <span className="flex items-center gap-2">
                  <span aria-hidden>✍️</span>
                  <span>Signatures</span>
                  <span className="text-[10px] font-normal">Optional</span>
                </span>
                <span className="text-xs text-slate-400">{signaturesExpanded ? "Hide" : "Show"}</span>
              </button>
              {signaturesExpanded ? (
                <div className="border-t border-slate-100 px-5 py-5">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <input
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                      value={formState.signatures?.chairName || ""}
                      onChange={e => updateSignatureField("chairName", e.target.value)}
                      placeholder="Chair name"
                    />
                    <input
                      className="rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                      value={formState.signatures?.secretaryName || ""}
                      onChange={e => updateSignatureField("secretaryName", e.target.value)}
                      placeholder="Secretary name"
                    />
                  </div>
                </div>
              ) : null}
            </section>

            <div className="flex justify-end">
              <button
                onClick={handleMinutesSubmit}
                disabled={isSavingMinutes || isApproved}
                className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-white shadow-lg transition hover:bg-primary/90 disabled:bg-primary/70"
                type="button"
              >
                {editingId ? "Update Minutes" : "Save Minutes"}
              </button>
            </div>
            {minutesSaveStatus ? <p className="text-xs text-slate-600">{minutesSaveStatus}</p> : null}
          </fieldset>

          {editingEntry ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Status actions</p>
                  <p className="text-sm text-slate-600">
                    Submit, approve, or unlock minutes based on their workflow state.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleMinutesStatusAction("submit")}
                    disabled={!canSubmitForApproval || isUpdatingStatus}
                    className="rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Submit for approval
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMinutesStatusAction("approve")}
                    disabled={!canApproveMinutes || isUpdatingStatus}
                    className="rounded-full bg-emerald-600 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleMinutesStatusAction("returnToDraft")}
                    disabled={!canReturnToDraft || isUpdatingStatus}
                    className="rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-primary hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    Return to draft
                  </button>
                </div>
              </div>
              <div className="space-y-1 mt-3">
                <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Approval notes</label>
                <textarea
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring focus:ring-primary/20"
                  value={approvalNotesInput}
                  onChange={e => setApprovalNotesInput(e.target.value)}
                  rows={3}
                  placeholder="Optional context for approvers"
                />
              </div>
              {statusActionStatus ? <p className="mt-2 text-xs text-slate-500">{statusActionStatus}</p> : null}
            </div>
          ) : null}
        </div>

        <div className="space-y-5">
          <div className="sticky top-6 space-y-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 shadow-sm">
              <div className="flex flex-col gap-3 border-b border-slate-100 pb-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    <span aria-hidden>🧾</span>
                    <span>Live preview</span>
                  </div>
                  <p className="text-xs text-slate-400">Preview matches export</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Zoom</span>
                  <button
                    type="button"
                    onClick={() => setPreviewZoomMode("fit")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                      previewZoomMode === "fit"
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 text-slate-500 hover:border-primary hover:text-slate-900"
                    }`}
                  >
                    Fit
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoomMode("100")}
                    className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide transition ${
                      previewZoomMode === "100"
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 text-slate-500 hover:border-primary hover:text-slate-900"
                    }`}
                  >
                    100%
                  </button>
                </div>
              </div>
              <div className="mt-4">
                <MinutesPreview
                  ref={minutesPreviewRef}
                  minutes={previewMinutesData}
                  onBackgroundLoad={() => setPreviewReady(true)}
                  zoomMode={previewZoomMode}
                  className="min-h-[520px] sm:min-h-[620px] lg:min-h-[720px] w-full"
                />
              </div>
              {minutesExportStatus ? <p className="mt-3 text-xs text-slate-500">{minutesExportStatus}</p> : null}
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => handleMinutesExport("pdf")}
                  disabled={!formState.eventId || isExportingMinutes || !previewReady}
                  className="flex-1 rounded-full bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Download Minutes PDF
                </button>
                <button
                  type="button"
                  onClick={() => handleMinutesExport("jpeg")}
                  disabled={!formState.eventId || isExportingMinutes || !previewReady}
                  className="flex-1 rounded-full border border-slate-200 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 transition hover:border-primary hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Download Minutes JPEG
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3 border-t pt-3">
        <h3 className="text-sm font-semibold text-slate-900">Recorded meeting minutes</h3>
        {sortedMinutesEntries.length === 0 ? (
          <p className="text-xs text-slate-500">No minutes recorded yet.</p>
        ) : (
          sortedMinutesEntries.map(entry => {
            const attendanceSummary = formatAttendanceSummary(entry.attendance);
            return (
              <div key={entry.id} className="rounded-2xl border border-slate-200 bg-white/90 p-4 text-sm shadow-sm">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-slate-900">{entry.eventTitle}</p>
                    <p className="text-xs text-slate-500">
                      {entry.meetingType} •{" "}
                      {entry.eventDate ? new Date(entry.eventDate).toLocaleString() : "Date unavailable"}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => loadMinutesIntoForm(entry)}
                    className="text-xs font-semibold text-primary hover:underline"
                  >
                    Edit
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <span
                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold uppercase ${minutesStatusPillClasses[entry.status]}`}
                  >
                    {minutesStatusLabels[entry.status]}
                  </span>
                </div>
                <div className="mt-2 space-y-1 text-xs text-slate-500">
                  {entry.submittedAt ? (
                    <p>
                      Submitted by {resolveActorLabel({ roles: ["admin"] })} • {formatTimestamp(entry.submittedAt)}
                    </p>
                  ) : entry.status === "draft" ? (
                    <p>Draft minutes can be updated before submission.</p>
                  ) : null}
                  {entry.approvedAt ? (
                    <p>
                      Approved by {resolveActorLabel({ roles: ["admin"] })} • {formatTimestamp(entry.approvedAt)}
                    </p>
                  ) : null}
                </div>
                {entry.decisions.length ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Decisions</p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
                      {entry.decisions.map((decision, idx) => (
                        <li key={`${entry.id}-decision-${idx}`}>{decision}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {entry.actionItems.length ? (
                  <div className="mt-3">
                    <p className="text-xs font-semibold uppercase text-slate-500">Action items</p>
                    <ul className="list-disc space-y-1 pl-5 text-xs text-slate-700">
                      {entry.actionItems.map((action, idx) => (
                        <li key={`${entry.id}-action-${idx}`}>
                          {action.task}
                          {action.assignedTo ? ` — ${action.assignedTo}` : ""}
                          {action.dueDate ? ` (due ${new Date(action.dueDate).toLocaleDateString()})` : ""}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {attendanceSummary ? (
                  <p className="mt-2 text-xs text-slate-600">{attendanceSummary}</p>
                ) : null}
                {entry.signatures ? (
                  <div className="mt-2 space-y-1 text-xs text-slate-600">
                    {entry.signatures.chairName ? (
                      <p>
                        <span className="font-semibold text-slate-700">Chair:</span> {entry.signatures.chairName}
                      </p>
                    ) : null}
                    {entry.signatures.secretaryName ? (
                      <p>
                        <span className="font-semibold text-slate-700">Secretary:</span> {entry.signatures.secretaryName}
                      </p>
                    ) : null}
                  </div>
                ) : null}
                <p className="mt-2 text-xs text-slate-500">
                  Recorded by {resolveActorLabel(entry.recordedBy)} •{" "}
                  {entry.createdAt ? formatTimestamp(entry.createdAt) : "—"}
                </p>
                {entry.approvalNotes ? (
                  <p className="mt-1 text-xs text-slate-500">Approval notes: {entry.approvalNotes}</p>
                ) : null}
              </div>
            );
          })
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {SHOW_WEBHOOK_EVENTS && (
          <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Webhook Events</h2>
            <ul className="mt-3 space-y-2 text-sm">
              {webhookEvents.length === 0 ? <li className="text-slate-500">No webhook events yet.</li> : null}
              {webhookEvents.map(evt => (
                <li key={evt.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold">{evt.type || "event"}</span>
                    <span className="text-xs text-slate-500">{evt.receivedAt ? new Date(evt.receivedAt.toDate?.() || evt.receivedAt).toLocaleString() : ""}</span>
                  </div>
                  <p className="text-xs text-slate-600 break-words">{evt.event_id}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Audit Logs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {auditLogs.length === 0 ? <li className="text-slate-500">No audit logs yet.</li> : null}
            {auditLogs.map(log => (
              <li key={log.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{log.summary || log.type}</span>
                  <span className="text-xs text-slate-500">
                    {log.createdAtMs ? new Date(log.createdAtMs).toLocaleString() : ""}
                  </span>
                </div>
                <p className="text-xs text-slate-600">Actor: {resolveActorLabel(log.actor ?? { role: log.role })}</p>
                {log.metadata && (log.metadata.eventId || log.metadata.timelineId || log.metadata.action) ? (
                  <p className="text-xs text-slate-500">
                    {log.metadata.eventId ? `Event: ${log.metadata.eventId} ` : ""}
                    {log.metadata.timelineId ? `Timeline: ${log.metadata.timelineId} ` : ""}
                    {log.metadata.action ? `Action: ${log.metadata.action}` : ""}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase text-slate-600">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function downloadDataUrl(filename: string, dataUrl: string) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function createEmptyForm(): MeetingMinutesFormInput {
  return {
    eventId: "",
    meetingType: meetingTypes[0],
    chairedBy: "",
    agenda: [""],
    discussionSummary: "",
    decisions: [""],
    actionItems: [{ task: "", assignedTo: "", dueDate: "" }],
    attendance: { present: [""], absent: [""], guests: [""] },
    signatures: { chairName: "", secretaryName: "" }
  };
}

function normalizeAttendance(value?: MeetingMinutesRecord["attendance"] | string[]): MeetingAttendance {
  if (!value) {
    return ensureAttendanceState();
  }
  if (Array.isArray(value)) {
    return {
      present: value.length ? value : [""],
      absent: [""],
      guests: [""]
    };
  }
  return {
    present: ensureAttendanceList(value.present),
    absent: ensureAttendanceList(value.absent),
    guests: ensureAttendanceList(value.guests)
  };
}

function ensureAttendanceState(attendance?: MeetingAttendance): MeetingAttendance {
  return attendance ?? { present: [""], absent: [""], guests: [""] };
}

function ensureAttendanceList(list?: string[]): string[] {
  return list && list.length ? list : [""];
}

function buildAttendancePayload(attendance?: MeetingAttendance): MeetingAttendance | undefined {
  if (!attendance) return undefined;
  const present = (attendance.present || []).map(item => item.trim()).filter(Boolean);
  const absent = (attendance.absent || []).map(item => item.trim()).filter(Boolean);
  const guests = (attendance.guests || []).map(item => item.trim()).filter(Boolean);
  if (!present.length && !absent.length && !guests.length) return undefined;
  const result: MeetingAttendance = { present };
  if (absent.length) result.absent = absent;
  if (guests.length) result.guests = guests;
  return result;
}

function formatTimestamp(value?: number) {
  return value ? new Date(value).toLocaleString() : "Date unavailable";
}

function formatAttendanceSummary(attendance?: MeetingAttendance): string | null {
  if (!attendance) return null;
  const parts: string[] = [];
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
