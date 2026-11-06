"use client";

import MinutesSearchClient from "@/src/modules/admin/MinutesSearchClient";
import { MeetingMinutesRecord } from "@/src/lib/minutes";

type MinutesRecordsClientProps = {
  initialMinutes: MeetingMinutesRecord[];
  /** A search to start with, from the admin search's "See all matching" (plan §27). */
  initialQuery?: string;
};

export default function MinutesRecordsClient({ initialMinutes, initialQuery = "" }: MinutesRecordsClientProps) {
  return <MinutesSearchClient initialMinutes={initialMinutes} initialQuery={initialQuery} />;
}
