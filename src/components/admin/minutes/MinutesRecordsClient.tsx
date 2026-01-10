"use client";

import MinutesSearchClient from "@/src/modules/admin/MinutesSearchClient";
import { MeetingMinutesRecord } from "@/src/lib/minutes";

type MinutesRecordsClientProps = {
  initialMinutes: MeetingMinutesRecord[];
};

export default function MinutesRecordsClient({ initialMinutes }: MinutesRecordsClientProps) {
  return <MinutesSearchClient initialMinutes={initialMinutes} />;
}
