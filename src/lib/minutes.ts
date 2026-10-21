export type MeetingType = "Board" | "General" | "Special" | "Committee";

export type MeetingActionItem = {
  task: string;
  assignedTo?: string;
  dueDate?: number | null;
};

export type MeetingSignatures = {
  chairName?: string;
  secretaryName?: string;
};

export type MinutesStatus = "draft" | "submitted" | "approved";

export type MeetingAttendance = {
  present: string[];
  absent?: string[];
  guests?: string[];
};

export type MeetingMinutesRecord = {
  id: string;
  eventId: string;
  eventTitle: string;
  eventDate?: number | null;
  meetingType: MeetingType;
  chairedBy?: string;
  recordedBy: string;
  agenda: string[];
  discussionSummary?: string;
  decisions: string[];
  actionItems: MeetingActionItem[];
  attendance?: MeetingAttendance;
  signatures?: MeetingSignatures;
  status: MinutesStatus;
  submittedAt?: number;
  submittedByUid?: string;
  approvedAt?: number;
  approvedByUid?: string;
  approvalNotes?: string;
  createdAt: number;
  updatedAt?: number;
  /** Count of approved versions (see minutes workflow). */
  version?: number;
  /** Set by the admin API: the content is stored encrypted. */
  encrypted?: boolean;
  /** Set by the client after decrypting; "failed" means this device can't read it. */
  _e2ee?: "encrypted" | "legacy" | "failed";
};

export type MeetingMinutesFormInput = {
  eventId: string;
  meetingType: MeetingType;
  chairedBy?: string;
  agenda: string[];
  discussionSummary?: string;
  decisions: string[];
  actionItems: {
    task: string;
    assignedTo?: string;
    dueDate?: number | string | null;
  }[];
  attendance?: MeetingAttendance;
  signatures?: MeetingSignatures;
};

export type MeetingMinutesUpdatePayload = Partial<Omit<MeetingMinutesFormInput, "eventId">> & {
  id: string;
  approvalNotes?: string;
  action?: "submit" | "approve" | "returnToDraft";
};

export const meetingTypes: MeetingType[] = ["Board", "General", "Special", "Committee"];

export const minutesStatusLabels: Record<MinutesStatus, string> = {
  draft: "Draft",
  submitted: "Submitted",
  approved: "Approved"
};

export const minutesStatusPillClasses: Record<MinutesStatus, string> = {
  draft: "border-slate-200 bg-slate-100 text-slate-800",
  submitted: "border-amber-200 bg-amber-100 text-amber-700",
  approved: "border-emerald-200 bg-emerald-100 text-emerald-700"
};
