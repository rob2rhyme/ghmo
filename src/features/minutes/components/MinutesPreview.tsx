"use client";

import { forwardRef, useEffect, useRef, useState, useMemo } from "react";
import LetterheadPage, { LETTER_HEIGHT_PX, LETTER_WIDTH_PX } from "@/src/features/docgen/components/LetterheadPage";
import { MeetingAttendance } from "@/src/lib/minutes";
import { escapeHtml, formatDate } from "@/src/features/docgen/render/renderTemplateHtml";

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

type MinutesPreviewProps = {
  minutes: MinutesPreviewData;
  onBackgroundLoad?: () => void;
  className?: string;
  zoomMode?: MinutesPreviewZoomMode;
};

const VIEWER_PADDING = 64;

const MinutesPreview = forwardRef<HTMLDivElement, MinutesPreviewProps>(
  ({ minutes, onBackgroundLoad, className, zoomMode = "fit" }, ref) => {
    const previewHtml = useMemo(() => buildMinutesHtml(minutes), [minutes]);
    const viewerRef = useRef<HTMLDivElement | null>(null);
    const [scale, setScale] = useState(1);
    const [containerWidth, setContainerWidth] = useState(0);

    useEffect(() => {
      if (!viewerRef.current) return undefined;

      function handleResize(width: number) {
        setContainerWidth(width);
      }

      if (typeof ResizeObserver !== "undefined") {
        const observer = new ResizeObserver(entries => {
          for (const entry of entries) {
            handleResize(entry.contentRect.width);
          }
        });
        observer.observe(viewerRef.current);
        handleResize(viewerRef.current.getBoundingClientRect().width);
        return () => observer.disconnect();
      }

      const onWindowResize = () => {
        const rect = viewerRef.current?.getBoundingClientRect();
        if (rect) handleResize(rect.width);
      };
      window.addEventListener("resize", onWindowResize);
      onWindowResize();
      return () => window.removeEventListener("resize", onWindowResize);
    }, []);

    useEffect(() => {
      if (zoomMode === "100") {
        setScale(1);
        return;
      }
      const normalized = Math.max(0, containerWidth - VIEWER_PADDING);
      const computedScale = normalized > 0 ? Math.min(1, normalized / LETTER_WIDTH_PX) : 1;
      setScale(computedScale);
    }, [containerWidth, zoomMode]);

    const rootClassName = ["w-full overflow-auto", className].filter(Boolean).join(" ");

    return (
      <div ref={viewerRef} className={rootClassName} style={{ minHeight: LETTER_HEIGHT_PX * 0.6 }}>
        <div className="flex min-h-full items-start justify-center">
          <div className="relative w-full max-w-[360px] px-4 py-4 sm:max-w-[420px] lg:max-w-[520px]">
            <div className="relative mx-auto rounded-2xl border border-slate-200 bg-white p-3 shadow-xl shadow-slate-900/10">
              <div className="flex justify-center">
                <div
                  style={{
                    width: LETTER_WIDTH_PX,
                    height: LETTER_HEIGHT_PX,
                    transform: `scale(${scale})`,
                    transformOrigin: "top center"
                  }}
                >
                  <LetterheadPage ref={ref} contentHtml={previewHtml} onBackgroundLoad={onBackgroundLoad} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
);

MinutesPreview.displayName = "MinutesPreview";

function buildMinutesHtml(data: MinutesPreviewData) {
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
