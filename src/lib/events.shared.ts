//src/lib/events.shared.ts
export type EventStatus = "draft" | "published";

export type EventRecord = {
  id: string;
  title: string;
  summary?: string;
  body: string;
  status: EventStatus;
  startsAt?: any;
  endsAt?: any;
  timezone?: string;
  location?: string;
  featured?: boolean;
  announcementDocTemplate?: string;
  announcementPdfSource?: {
    generator: "document-generator";
    docType: "eventAnnouncement";
    payloadVersion: number;
  };
  createdAt?: any;
  updatedAt?: any;
  createdByUid?: string;
};

export const DEFAULT_TIMEZONE = "America/New_York";
