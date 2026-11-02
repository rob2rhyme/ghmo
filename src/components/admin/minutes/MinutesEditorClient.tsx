"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { jsPDF } from "jspdf";
import * as htmlToImage from "html-to-image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Download, Plus, X } from "lucide-react";
import {
  meetingTypes,
  MeetingAttendance,
  MeetingMinutesFormInput,
  MeetingMinutesRecord,
  MeetingSignatures,
  MinutesStatus,
  minutesStatusLabels
} from "@/src/lib/minutes";
import MinutesPreview, { MinutesPreviewData } from "@/src/features/minutes/components/MinutesPreview";
import { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from "@/src/features/docgen/components/LetterheadPage";
import { COMMUNITY_SLUG } from "@/src/lib/community.constants";
import { resolveActorName } from "@/src/lib/actor";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Segmented } from "@/src/components/ui/segmented";
import { Select } from "@/src/components/ui/select";
import { Textarea } from "@/src/components/ui/textarea";
import { formatDateTime } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { approvalLoc, minutesLoc, unpackMinutes } from "@/src/lib/minutesRecords";
import { hashContent } from "@/src/lib/minutesContent";
import { useEncryptedDraft } from "@/src/lib/e2ee/client/useEncryptedDraft";
import { DraftBanner } from "@/src/components/admin/encryption/DraftBanner";
import { useUnpackedMinutes } from "./useUnpackedMinutes";

type AdminActor = {
  uid: string;
  email?: string;
  name?: string;
  roles?: string[];
};

type AdminEvent = {
  id: string;
  title?: string;
  /** Milliseconds from the API (ISO strings are accepted too). */
  startsAt?: number | string | null;
  timezone?: string;
  location?: string;
};

type PastEvent = AdminEvent & {
  startsAtMs: number;
};

type PreviewActionItem = NonNullable<MinutesPreviewData["actionItems"]>[number];

type MinutesEditorClientProps = {
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
const isNonNull = <T,>(value: T | null | undefined): value is T => value !== null && value !== undefined;

/** A random Firestore-style document id; chosen here so the ciphertext can be bound to it. */
function newMinutesId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), byte => alphabet[byte % alphabet.length]).join("");
}

export default function MinutesEditorClient({ minutes: rawMinutes, adminActor }: MinutesEditorClientProps) {
  const { enabled: encrypted, packPrivate, unpackPrivate } = useE2ee();
  const decryptedMinutes = useUnpackedMinutes(rawMinutes);
  const [events, setEvents] = useState<AdminEvent[]>([]);
  const [eventsLoading, setEventsLoading] = useState(true);
  const [eventsError, setEventsError] = useState<string | null>(null);

  // Records saved in this session replace the loaded copy until the page is reloaded.
  const [savedEntries, setSavedEntries] = useState<MeetingMinutesRecord[]>([]);
  const minutesEntries = useMemo(() => {
    const loadedIds = new Set(decryptedMinutes.map(entry => entry.id));
    return [
      ...savedEntries.filter(entry => !loadedIds.has(entry.id)),
      ...decryptedMinutes.map(entry => savedEntries.find(saved => saved.id === entry.id) ?? entry)
    ];
  }, [decryptedMinutes, savedEntries]);
  const [formState, setFormState] = useState<MeetingMinutesFormInput>(() => createEmptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  // The form as last loaded or cleared: a draft is only worth keeping once it differs and has some text.
  const [baseline, setBaseline] = useState(() => JSON.stringify(createEmptyForm()));
  const [minutesSaveStatus, setMinutesSaveStatus] = useState<string | null>(null);
  const [isSavingMinutes, setIsSavingMinutes] = useState(false);
  const minutesPreviewRef = useRef<HTMLDivElement | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [isExportingMinutes, setIsExportingMinutes] = useState(false);
  const [minutesExportStatus, setMinutesExportStatus] = useState<string | null>(null);
  const [approvalNotesInput, setApprovalNotesInput] = useState("");
  const [reopenReason, setReopenReason] = useState("");
  const [versions, setVersions] = useState<{ version: number; approvedAt?: number; contentHash: string }[]>([]);
  const [statusActionStatus, setStatusActionStatus] = useState<string | null>(null);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const hasText =
    Boolean(formState.discussionSummary?.trim() || formState.chairedBy?.trim()) ||
    formState.agenda.some(item => item.trim()) ||
    formState.decisions.some(item => item.trim()) ||
    formState.actionItems.some(item => item.task.trim());
  const draft = useEncryptedDraft({
    uid: adminActor.uid,
    name: `minutes:${editingId ?? "new"}`,
    value: formState,
    hasContent: hasText && JSON.stringify(formState) !== baseline
  });
  const [attendanceExpanded, setAttendanceExpanded] = useState(false);
  const [signaturesExpanded, setSignaturesExpanded] = useState(false);
  const [previewZoomMode, setPreviewZoomMode] = useState<PreviewZoomMode>("fit");

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
    const minutesId = searchParams.get("minutesId");
    if (!minutesId || editingId === minutesId) return;
    const entry = minutesEntries.find(record => record.id === minutesId);
    if (entry) loadMinutesIntoForm(entry);
  }, [minutesEntries, searchParams, editingId]);

  const cancelMinutesEdit = () => {
    setEditingId(null);
    setFormState(createEmptyForm());
    setBaseline(JSON.stringify(createEmptyForm()));
    setMinutesSaveStatus(null);
  };

  const loadMinutesIntoForm = (entry: MeetingMinutesRecord) => {
    const next: MeetingMinutesFormInput = {
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
    };
    setFormState(next);
    setBaseline(JSON.stringify(next));
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
    try {
      if (editingEntry?._e2ee === "failed") throw new Error("These minutes can't be decrypted on this device, so they can't be edited here.");
      const id = editingId ?? newMinutesId();
      const { eventId, meetingType, ...content } = payload;
      // With encryption on this is {enc}; before that it is the plain fields, as always.
      const privateFields = await packPrivate(minutesLoc(id), content);
      const body = editingId ? { id, meetingType, ...privateFields } : { id, eventId, meetingType, ...privateFields };
      const res = await fetch("/api/admin/minutes", {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      const saved = await unpackMinutes(unpackPrivate, data.minutes);
      setSavedEntries(prev => [saved, ...prev.filter(entry => entry.id !== saved.id)]);
      setMinutesSaveStatus(editingId ? "Updated meeting minutes" : "Meeting minutes saved");
      draft.clear();
      setFormState(createEmptyForm());
      setBaseline(JSON.stringify(createEmptyForm()));
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
      const notes = action === "approve" ? approvalNotesInput.trim() : "";
      const extra: Record<string, unknown> = {};
      if (action === "approve" && encrypted && editingEntry?.encrypted) {
        if (editingEntry._e2ee === "failed") throw new Error("These minutes can't be decrypted on this device.");
        // Approving publishes the saved content as a plaintext copy for the public pages.
        const { chairedBy, agenda, discussionSummary, decisions, actionItems, attendance, signatures } = editingEntry;
        extra.published = { chairedBy, agenda, discussionSummary, decisions, actionItems, attendance, signatures };
        if (notes) extra.approvalEnc = (await packPrivate(approvalLoc(editingId), { approvalNotes: notes })).enc;
      } else if (notes) {
        extra.approvalNotes = notes;
      }
      if (action === "submit" && editingEntry?.encrypted) {
        // The approver's copy must hash to exactly this, so the minutes can't change during approval.
        if (editingEntry._e2ee === "failed") throw new Error("These minutes can't be decrypted on this device.");
        extra.contentHash = await hashContent(editingEntry as unknown as Record<string, unknown>);
      }
      if (action === "returnToDraft" && editingStatus === "approved") extra.reason = reopenReason.trim();
      const res = await fetch("/api/admin/minutes", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: editingId, action, ...extra })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to update status");
      const updated = await unpackMinutes(unpackPrivate, data.minutes);
      setSavedEntries(prev => [updated, ...prev.filter(entry => entry.id !== updated.id)]);
      loadMinutesIntoForm(updated);
      setReopenReason("");
      setStatusActionStatus(
        action === "approve"
          ? "Minutes approved."
          : action === "returnToDraft"
            ? "Marked as draft."
            : "Submitted for approval."
      );
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
        const startMs = typeof evt.startsAt === "number" ? evt.startsAt : evt.startsAt ? Date.parse(evt.startsAt) : NaN;
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
  const displayEventDate = displayEventDateMs ? formatDateTime(displayEventDateMs) : null;
  const adminRecordedBy = resolveActorName(adminActor);
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

  const editingVersion = editingEntry?.version;
  useEffect(() => {
    if (!editingId || !editingVersion) return;
    let cancelled = false;
    void fetch(`/api/admin/minutes?versionsFor=${editingId}`, { cache: "no-store" })
      .then(res => (res.ok ? res.json() : { versions: [] }))
      .then(data => {
        if (!cancelled) setVersions(data.versions ?? []);
      });
    return () => {
      cancelled = true;
    };
  }, [editingId, editingVersion]);

  const attendanceState = ensureAttendanceState(formState.attendance);
  const exportBlockedReason = !formState.eventId
    ? "Choose a meeting first to download these minutes."
    : !previewReady
      ? "Getting the preview ready…"
      : null;
  const saveHint = isApproved
    ? "Approved minutes are locked. Return them to draft to change them."
    : "Saved as a draft. Nothing is public until another admin approves it.";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-6">
        {draft.pending ? (
          <DraftBanner
            savedAt={draft.pending.savedAt}
            onRestore={() => {
              const restored = draft.restore();
              if (restored) setFormState(restored);
            }}
            onDiscard={draft.discard}
          />
        ) : null}

        <AdminSectionCard>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold text-foreground">
                {editingId ? `Editing: ${displayEventTitle || "minutes"}` : displayEventTitle ? `New minutes: ${displayEventTitle}` : "New minutes"}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {editingId ? "Change what you need, then save. Submitting and approving are at the bottom." : "Pick the meeting, fill in what you can, and save. You can come back and finish later."}
              </p>
              {editingEntry ? (
                <Badge variant={STATUS_BADGE[editingStatus]} className="mt-3">
                  {minutesStatusLabels[editingStatus]}
                </Badge>
              ) : null}
            </div>
            {editingId ? (
              <Button type="button" variant="outline" onClick={cancelMinutesEdit}>
                Cancel edit
              </Button>
            ) : null}
          </div>
        </AdminSectionCard>

        <fieldset disabled={isApproved} className="flex min-w-0 flex-col gap-6">
          <AdminSectionCard title="Which meeting?" description="Minutes belong to a meeting that has already happened.">
            <div className="grid gap-4">
              <Field
                label="Meeting"
                description={
                  eventsLoading ? (
                    "Loading past meetings…"
                  ) : eventsError ? undefined : pastEvents.length === 0 ? (
                    <>
                      Minutes are added after a meeting has happened. No past meetings yet:{" "}
                      <Link href="/admin/events" className="font-medium text-primary underline-offset-4 hover:underline">
                        see Events
                      </Link>
                      .
                    </>
                  ) : undefined
                }
                error={eventsError ?? undefined}
              >
                <Select
                  value={formState.eventId}
                  onChange={e => setFormState(prev => ({ ...prev, eventId: e.target.value }))}
                  disabled={Boolean(editingId)}
                >
                  <option value="">Choose a past meeting</option>
                  {pastEvents.map(evt => (
                    <option key={evt.id} value={evt.id}>
                      {evt.title || "Untitled event"} · {formatDateTime(evt.startsAtMs)}
                    </option>
                  ))}
                </Select>
              </Field>
              {displayEventTitle ? (
                <div className="rounded-xl border border-border bg-muted/40 px-4 py-3 text-sm">
                  <p className="font-semibold text-foreground">{displayEventTitle}</p>
                  <p className="text-muted-foreground">{displayEventDate ?? "Date unavailable"}</p>
                </div>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Type of meeting">
                  <Select
                    value={formState.meetingType}
                    onChange={e =>
                      setFormState(prev => ({
                        ...prev,
                        meetingType: e.target.value as MeetingMinutesFormInput["meetingType"]
                      }))
                    }
                  >
                    {meetingTypes.map(type => (
                      <option key={type} value={type}>
                        {type}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Chaired by (optional)">
                  <Input
                    value={formState.chairedBy}
                    onChange={e => setFormState(prev => ({ ...prev, chairedBy: e.target.value }))}
                    placeholder="Name of the chair"
                  />
                </Field>
                <Field label="Recorded by" description="Filled in from your account." className="sm:col-span-2">
                  <Input value={adminRecordedBy} readOnly className="bg-muted/40 text-muted-foreground" />
                </Field>
              </div>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Agenda" description="The topics, in the order they came up.">
            <div className="flex flex-col gap-3">
              {formState.agenda.map((item, index) => (
                <RemovableRow key={`agenda-${index}`} removeLabel={`Remove agenda item ${index + 1}`} onRemove={() => removeTextListEntry("agenda", index)}>
                  <Input
                    aria-label={`Agenda item ${index + 1}`}
                    value={item}
                    onChange={e => updateTextList("agenda", index, e.target.value)}
                    placeholder="Agenda item"
                  />
                </RemovableRow>
              ))}
              <AddButton onClick={() => appendTextList("agenda")}>Add agenda item</AddButton>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="What was discussed" description="A short summary of the conversation.">
            <Textarea
              aria-label="Discussion summary"
              value={formState.discussionSummary}
              onChange={e => setFormState(prev => ({ ...prev, discussionSummary: e.target.value }))}
              rows={5}
              placeholder="Summarize the discussion"
            />
          </AdminSectionCard>

          <AdminSectionCard title="Decisions made" description="One line per motion or decision.">
            <div className="flex flex-col gap-3">
              {formState.decisions.map((item, index) => (
                <RemovableRow key={`decision-${index}`} removeLabel={`Remove decision ${index + 1}`} onRemove={() => removeTextListEntry("decisions", index)}>
                  <Input
                    aria-label={`Decision ${index + 1}`}
                    value={item}
                    onChange={e => updateTextList("decisions", index, e.target.value)}
                    placeholder="Decision"
                  />
                </RemovableRow>
              ))}
              <AddButton onClick={() => appendTextList("decisions")}>Add decision</AddButton>
            </div>
          </AdminSectionCard>

          <AdminSectionCard title="Action items" description="Tasks that came out of the meeting, who does them and by when.">
            <div className="flex flex-col gap-3">
              {formState.actionItems.map((item, index) => (
                <div key={`action-${index}`} className="flex flex-col gap-3 rounded-xl border border-border bg-muted/30 p-3 sm:p-4">
                  <RemovableRow removeLabel={`Remove action item ${index + 1}`} onRemove={() => removeActionItem(index)}>
                    <Input
                      aria-label={`Action item ${index + 1}: task`}
                      value={item.task}
                      onChange={e => updateActionItem(index, "task", e.target.value)}
                      placeholder="Task"
                    />
                  </RemovableRow>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Who will do it (optional)">
                      <Input value={item.assignedTo} onChange={e => updateActionItem(index, "assignedTo", e.target.value)} placeholder="Name" />
                    </Field>
                    <Field label="Due date (optional)">
                      <Input type="date" value={item.dueDate || ""} onChange={e => updateActionItem(index, "dueDate", e.target.value)} />
                    </Field>
                  </div>
                </div>
              ))}
              <AddButton onClick={appendActionItem}>Add action item</AddButton>
            </div>
          </AdminSectionCard>

          <AdminSectionCard
            title="Who attended"
            description="Optional. Names of people present, absent and any guests."
            actions={
              <Button type="button" variant="outline" aria-expanded={attendanceExpanded} onClick={() => setAttendanceExpanded(prev => !prev)}>
                {attendanceExpanded ? "Hide attendance" : "Add attendance"}
              </Button>
            }
          >
            {attendanceExpanded ? (
              <div className="grid gap-5">
                {(["present", "absent", "guests"] as AttendanceSection[]).map(section => {
                  const rows = attendanceState[section] ?? [""];
                  const sectionLabel = section === "present" ? "Present" : section === "absent" ? "Absent" : "Guests";
                  return (
                    <div key={section} className="flex flex-col gap-2">
                      <h3 className="text-sm font-medium text-foreground">{sectionLabel}</h3>
                      {rows.map((person, index) => (
                        <RemovableRow
                          key={`${section}-${index}`}
                          removeLabel={`Remove ${sectionLabel.toLowerCase()} name ${index + 1}`}
                          onRemove={() => removeAttendanceItem(section, index)}
                        >
                          <Input
                            aria-label={`${sectionLabel}: name ${index + 1}`}
                            value={person}
                            onChange={e => updateAttendanceItem(section, index, e.target.value)}
                            placeholder="Name or role"
                          />
                        </RemovableRow>
                      ))}
                      <AddButton onClick={() => appendAttendanceItem(section)}>Add name</AddButton>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not added.</p>
            )}
          </AdminSectionCard>

          <AdminSectionCard
            title="Signatures"
            description="Optional. Names printed on the signature lines."
            actions={
              <Button type="button" variant="outline" aria-expanded={signaturesExpanded} onClick={() => setSignaturesExpanded(prev => !prev)}>
                {signaturesExpanded ? "Hide signatures" : "Add signatures"}
              </Button>
            }
          >
            {signaturesExpanded ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Chair">
                  <Input value={formState.signatures?.chairName || ""} onChange={e => updateSignatureField("chairName", e.target.value)} placeholder="Chair name" />
                </Field>
                <Field label="Secretary">
                  <Input
                    value={formState.signatures?.secretaryName || ""}
                    onChange={e => updateSignatureField("secretaryName", e.target.value)}
                    placeholder="Secretary name"
                  />
                </Field>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">Not added.</p>
            )}
          </AdminSectionCard>

          <div className="sticky bottom-0 z-20 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border bg-card/95 px-4 py-3 shadow-lg backdrop-blur-sm">
            <p
              role="status"
              className={cn("min-w-0 flex-1 basis-48 text-sm", minutesSaveStatus?.startsWith("Error") ? "font-medium text-destructive" : "text-muted-foreground")}
            >
              {minutesSaveStatus ?? saveHint}
            </p>
            <Button type="button" size="lg" onClick={handleMinutesSubmit} loading={isSavingMinutes} disabled={isApproved}>
              {editingId ? "Save changes" : "Save minutes"}
            </Button>
          </div>
        </fieldset>

        {editingEntry ? (
          <AdminSectionCard title="Submit or approve" description="Another admin approves the minutes. Approving publishes them on the public minutes page.">
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant={canSubmitForApproval ? "default" : "outline"}
                  onClick={() => handleMinutesStatusAction("submit")}
                  disabled={!canSubmitForApproval || isUpdatingStatus}
                >
                  Submit for approval
                </Button>
                <Button
                  type="button"
                  variant={canApproveMinutes ? "default" : "outline"}
                  onClick={() => handleMinutesStatusAction("approve")}
                  disabled={!canApproveMinutes || isUpdatingStatus}
                >
                  Approve
                </Button>
                <Button type="button" variant="outline" onClick={() => handleMinutesStatusAction("returnToDraft")} disabled={!canReturnToDraft || isUpdatingStatus}>
                  Return to draft
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">{statusHelperText[editingStatus]}</p>
              {editingStatus === "submitted" && editingEntry?.submittedByUid === adminActor.uid ? (
                <p className="text-sm text-muted-foreground">You submitted these minutes, so another admin must approve them.</p>
              ) : null}
              <Field label="Approval notes (optional)">
                <Textarea
                  value={approvalNotesInput}
                  onChange={e => setApprovalNotesInput(e.target.value)}
                  rows={3}
                  placeholder="Optional context for approvers"
                />
              </Field>
              {editingStatus === "approved" ? (
                <Field label="Reason for reopening" description="Reopening takes the minutes off the public page until they are approved again.">
                  <Textarea
                    value={reopenReason}
                    onChange={e => setReopenReason(e.target.value)}
                    rows={2}
                    placeholder="Required. Recorded in the audit log; reopening unpublishes the minutes."
                  />
                </Field>
              ) : null}
              {versions.length ? (
                <div>
                  <h3 className="text-sm font-medium text-foreground">Approved versions</h3>
                  <ul className="mt-1 flex flex-col gap-1 text-sm text-muted-foreground">
                    {versions.map(v => (
                      <li key={v.version} className="break-words">
                        Version {v.version} · {v.approvedAt ? formatDateTime(v.approvedAt) : "date unknown"} · fingerprint {v.contentHash.slice(0, 12)}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {statusActionStatus ? (
                <p role="status" className={cn("text-sm", statusActionStatus.startsWith("Error") ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {statusActionStatus}
                </p>
              ) : null}
            </div>
          </AdminSectionCard>
        ) : null}
      </div>

      <aside aria-label="Preview" className="min-w-0 xl:sticky xl:top-20">
        <AdminSectionCard
          title="Preview"
          description="Exactly what the download will look like."
          className="flex flex-col xl:max-h-[calc(100dvh-6rem)]"
          actions={
            <Segmented
              label="Zoom"
              size="sm"
              value={previewZoomMode}
              onChange={setPreviewZoomMode}
              options={[
                { value: "fit", label: "Fit" },
                { value: "100", label: "100%" }
              ]}
            />
          }
        >
          <MinutesPreview
            ref={minutesPreviewRef}
            minutes={previewMinutesData}
            onBackgroundLoad={() => setPreviewReady(true)}
            zoomMode={previewZoomMode}
            className="min-h-0 xl:flex-1"
          />
          <div className="mt-4 flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => handleMinutesExport("pdf")} disabled={Boolean(exportBlockedReason) || isExportingMinutes}>
                <Download aria-hidden="true" />
                Download PDF
              </Button>
              <Button type="button" variant="outline" onClick={() => handleMinutesExport("jpeg")} disabled={Boolean(exportBlockedReason) || isExportingMinutes}>
                Download image (JPEG)
              </Button>
            </div>
            {minutesExportStatus || exportBlockedReason ? (
              <p role="status" className={cn("text-sm", minutesExportStatus?.startsWith("Error") ? "font-medium text-destructive" : "text-muted-foreground")}>
                {minutesExportStatus ?? exportBlockedReason}
              </p>
            ) : null}
          </div>
        </AdminSectionCard>
      </aside>
    </div>
  );
}

const STATUS_BADGE: Record<MinutesStatus, "secondary" | "warning" | "success"> = {
  draft: "secondary",
  submitted: "warning",
  approved: "success"
};

/** A text field with a 44 px labelled remove button beside it. */
function RemovableRow({ children, removeLabel, onRemove }: { children: ReactNode; removeLabel: string; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="min-w-0 flex-1">{children}</div>
      <Button type="button" variant="ghost" size="icon" className="size-11 text-muted-foreground hover:text-destructive" aria-label={removeLabel} title={removeLabel} onClick={onRemove}>
        <X aria-hidden="true" />
      </Button>
    </div>
  );
}

function AddButton({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <Button type="button" variant="outline" className="self-start" onClick={onClick}>
      <Plus aria-hidden="true" />
      {children}
    </Button>
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
