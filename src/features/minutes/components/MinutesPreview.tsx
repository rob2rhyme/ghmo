"use client";

import { forwardRef, useEffect, useRef, useState, useMemo } from "react";
import { LETTER_WIDTH_PX } from "@/src/features/docgen/components/LetterheadPage";
import PagedLetter, { type PagedLetterHandle } from "@/src/features/docgen/components/PagedLetter";
import { MeetingAttendance } from "@/src/lib/minutes";
import { escapeHtml, formatDate } from "@/src/features/docgen/render/renderTemplateHtml";
import { cn } from "@/src/lib/utils";

export type MinutesPreviewData = {
  eventTitle?: string;
  eventDate?: number | string | Date | null;
  meetingType?: string;
  agenda: string[];
  discussionSummary?: string;
  decisions: string[];
  actionItems: { task: string; assignedTo?: string; dueDate?: string | number | Date | null }[];
  attendance?: MeetingAttendance;
  approvalNotes?: string;
  recordedBy?: string;
  signatures?: {
    chairName?: string;
    secretaryName?: string;
  };
};

type MinutesPreviewZoomMode = "fit" | "100";

export type MinutesPreviewHandle = PagedLetterHandle;

type MinutesPreviewProps = {
  minutes: MinutesPreviewData;
  onBackgroundLoad?: () => void;
  /** Called when the minutes need more (or fewer) letter pages. */
  onPageCountChange?: (count: number) => void;
  className?: string;
  zoomMode?: MinutesPreviewZoomMode;
};

/** Before the viewer is measured, show a small page rather than a full-size one. */
const UNMEASURED_SCALE = 0.4;

/**
 * The letter pages, shrunk to fit their column. Each page keeps its real 816 × 1056 px layout (so the
 * export is exact) and is scaled inside a box sized to the scaled page, so it takes no more room than
 * it shows and never pushes the layout sideways. Long minutes continue on more pages, breaking between
 * paragraphs and list items; the ref gives every page for the download.
 */
const MinutesPreview = forwardRef<MinutesPreviewHandle, MinutesPreviewProps>(
  ({ minutes, onBackgroundLoad, onPageCountChange, className, zoomMode = "fit" }, ref) => {
    const previewHtml = useMemo(() => buildMinutesHtml(minutes), [minutes]);
    const viewerRef = useRef<HTMLDivElement | null>(null);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
      const viewer = viewerRef.current;
      if (!viewer) return undefined;
      // contentRect excludes the viewer's padding, which is what the page has to fit into.
      const measure = () => setContainerWidth(viewer.clientWidth - parseFloat(getComputedStyle(viewer).paddingLeft) * 2);

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(entries => {
          for (const entry of entries) setContainerWidth(entry.contentRect.width);
        });
        observer.observe(viewer);
        measure();
        return () => observer.disconnect();
      }

      window.addEventListener("resize", measure);
      measure();
      return () => window.removeEventListener("resize", measure);
    }, []);

    const scale =
      zoomMode === "100" ? 1 : containerWidth > 0 ? Math.min(1, containerWidth / LETTER_WIDTH_PX) : UNMEASURED_SCALE;

    return (
      <div
        ref={viewerRef}
        // Scrollable, so keyboard users can focus it and scroll with the arrow keys (WCAG 2.1.1).
        tabIndex={0}
        role="region"
        aria-label="Minutes preview"
        className={cn(
          "w-full min-w-0 rounded-xl border border-border bg-muted/50 p-3 outline-none focus-visible:ring-2 focus-visible:ring-ring",
          zoomMode === "100" ? "overflow-auto" : "overflow-x-hidden overflow-y-auto",
          className
        )}
      >
        <PagedLetter
          ref={ref}
          html={previewHtml}
          scale={scale}
          onBackgroundLoad={onBackgroundLoad}
          onPageCountChange={onPageCountChange}
          className="mx-auto w-fit"
        />
      </div>
    );
  }
);

MinutesPreview.displayName = "MinutesPreview";

export function buildMinutesHtml(data: MinutesPreviewData) {
  const formattedDate = formatIfDate(data.eventDate);
  const agendaHtml = renderList("Agenda", data.agenda);
  const decisionsHtml = renderList("Decisions", data.decisions);
  const actionItemsHtml = data.actionItems && data.actionItems.length ? renderActionItems(data.actionItems) : "";
  const attendanceHtml = renderAttendanceSections(data.attendance);
  const approvalNotesHtml = renderApprovalNotes(data.approvalNotes);
  const discussionSummary = data.discussionSummary ? `<p>${escapeHtml(data.discussionSummary)}</p>` : "";
  const recordedBy = data.recordedBy ? `<p class="ghmo-letter-footer">Recorded by ${escapeHtml(data.recordedBy)}</p>` : "";
  const meetingType = data.meetingType ? escapeHtml(data.meetingType) : "Meeting";
  const signaturesHtml = renderSignatures(data.signatures);

  return `
    <div class="ghmo-letter-body">
      <p class="ghmo-letter-headline">${escapeHtml(data.eventTitle || "Meeting Minutes")}</p>
      <p class="ghmo-letter-meta">
        ${meetingType}${formattedDate ? ` • ${formattedDate}` : ""}
      </p>
      ${discussionSummary}
      ${agendaHtml}
      ${decisionsHtml}
      ${actionItemsHtml}
      ${attendanceHtml}
      ${signaturesHtml}
      ${approvalNotesHtml}
      ${recordedBy}
    </div>
  `;
}

function renderList(label: string, items?: string[]) {
  if (!items || items.length === 0) return "";
  const sanitized = items.map(item => `<li>${escapeHtml(item)}</li>`).join("");
  return `
    <div class="mt-3">
      <p class="ghmo-letter-meta">${label}</p>
      <ul class="list-disc pl-5">${sanitized}</ul>
    </div>
  `;
}

function renderActionItems(items: MinutesPreviewData["actionItems"]) {
  const rows = (items || [])
    .map(item => {
      const due = item.dueDate ? ` (due ${formatIfDate(item.dueDate)})` : "";
      const assigned = item.assignedTo ? ` — ${escapeHtml(item.assignedTo)}` : "";
      return `<li>${escapeHtml(item.task)}${assigned}${due}</li>`;
    })
    .join("");
  if (!rows) return "";
  return `
    <div class="mt-3">
      <p class="ghmo-letter-meta">Action items</p>
      <ul class="list-disc pl-5">${rows}</ul>
    </div>
  `;
}

function renderSignatures(signatures?: MinutesPreviewData["signatures"]) {
  const chair = signatures?.chairName ? escapeHtml(signatures.chairName) : "&nbsp;";
  const secretary = signatures?.secretaryName ? escapeHtml(signatures.secretaryName) : "&nbsp;";
  return `
    <div class="mt-6 text-sm text-slate-600">
      <div class="mb-2">
        <span class="font-semibold">Chair:</span> ${chair}
      </div>
      <div>
        <span class="font-semibold">Secretary:</span> ${secretary}
      </div>
    </div>
  `;
}

function renderAttendanceSections(attendance?: MeetingAttendance) {
  if (!attendance) return "";
  const sections: string[] = [];
  if (attendance.present && attendance.present.length) {
    sections.push(renderList("Present", attendance.present));
  }
  if (attendance.absent && attendance.absent.length) {
    sections.push(renderList("Absent", attendance.absent));
  }
  if (attendance.guests && attendance.guests.length) {
    sections.push(renderList("Guests", attendance.guests));
  }
  return sections.join("");
}

function renderApprovalNotes(notes?: string) {
  if (!notes) return "";
  return `
    <div class="mt-3 text-sm text-slate-700">
      <p class="font-semibold">Approval notes</p>
      <p>${escapeHtml(notes)}</p>
    </div>
  `;
}

function formatIfDate(value?: number | string | Date | null) {
  if (value === undefined || value === null) return "";
  if (typeof value === "number") {
    return formatDate(new Date(value).toISOString());
  }
  if (value instanceof Date) {
    return formatDate(value.toISOString());
  }
  return formatDate(value);
}

export default MinutesPreview;
