"use client";

import { useEffect, useState } from "react";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { unpackMinutes } from "@/src/lib/minutesRecords";
import type { MeetingMinutesRecord } from "@/src/lib/minutes";

/** Minutes records from the admin API with their encrypted content decrypted on this device. */
export function useUnpackedMinutes(records: MeetingMinutesRecord[]): MeetingMinutesRecord[] {
  const { unpackPrivate } = useE2ee();
  const [unpacked, setUnpacked] = useState<MeetingMinutesRecord[]>([]);
  useEffect(() => {
    let cancelled = false;
    void Promise.all(records.map(record => unpackMinutes(unpackPrivate, record))).then(next => {
      if (!cancelled) setUnpacked(next);
    });
    return () => {
      cancelled = true;
    };
  }, [records, unpackPrivate]);
  return unpacked;
}
