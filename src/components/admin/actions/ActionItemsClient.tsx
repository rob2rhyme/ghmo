"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Segmented } from "@/src/components/ui/segmented";
import { Skeleton } from "@/src/components/ui/skeleton";
import { DUE_DATE, formatShortDate } from "@/src/lib/format";
import { firestore } from "@/src/lib/firebaseFirestore";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { statusBadge } from "@/src/lib/statusBadges";
import {
  ACTION_STATUS_PATH,
  actionStatusLoc,
  buildItems,
  type ActionStatus,
  type StatusRecord,
  type TrackedItem
} from "@/src/lib/actionItems";
import type { MeetingMinutesRecord } from "@/src/lib/minutes";

type Filter = "open" | "done" | "all";

export default function ActionItemsClient({ minutes, uid }: { minutes: MeetingMinutesRecord[]; uid: string }) {
  const { unpackPrivate, packPrivate } = useE2ee();
  const [statuses, setStatuses] = useState<Map<string, StatusRecord>>(new Map());
  const [items, setItems] = useState<TrackedItem[]>([]);
  // False until the list is first built, so "No action items yet" never shows while it is still loading.
  const [loaded, setLoaded] = useState(false);
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    const unsubscribe = onSnapshot(
      collection(firestore, ACTION_STATUS_PATH),
      snapshot => {
        void Promise.all(
          snapshot.docs.map(async d => {
            const unpacked = await unpackPrivate<{ status?: ActionStatus; note?: string }>(d.data(), actionStatusLoc(d.id));
            return [d.id, unpacked._e2ee === "failed" || !unpacked.status ? null : { status: unpacked.status, note: unpacked.note }] as const;
          })
        ).then(entries => {
          if (cancelled) return;
          setLoadError(null);
          const next = new Map<string, StatusRecord>();
          for (const [key, value] of entries) if (value) next.set(key, value);
          setStatuses(next);
        });
      },
      error => setLoadError(error.message || "The connection failed.")
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [unpackPrivate, attempt]);

  useEffect(() => {
    let cancelled = false;
    void buildItems(minutes, statuses).then(next => {
      if (cancelled) return;
      setItems(next);
      setLoaded(true);
    });
    return () => {
      cancelled = true;
    };
  }, [minutes, statuses]);

  const visible = useMemo(() => items.filter(item => (filter === "all" ? true : filter === "open" ? item.status === "open" : item.status !== "open")), [items, filter]);

  const setStatus = async (item: TrackedItem, status: ActionStatus) => {
    if (!firestore) return;
    setBusy(item.key);
    try {
      const fields = await packPrivate(actionStatusLoc(item.key), { status, ...(item.note ? { note: item.note } : {}) });
      await setDoc(doc(firestore, ACTION_STATUS_PATH, item.key), { ...fields, updatedAt: serverTimestamp(), updatedBy: uid });
    } catch (error) {
      toast.error(`Couldn't update the action item. ${error instanceof Error ? error.message : "Try again."}`);
    } finally {
      setBusy(null);
    }
  };

  const openCount = items.filter(item => item.status === "open").length;
  const overdueCount = items.filter(item => item.overdue).length;

  const doneCount = items.length - openCount;

  return (
    <div className="flex flex-col gap-4">
      {loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load which items are done</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-3">
            <span>Every item shows as open until this works. {loadError}</span>
            <Button variant="outline" size="row" onClick={() => setAttempt(n => n + 1)}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : null}
      {items.length > 0 ? (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <Segmented
            label="Show"
            value={filter}
            onChange={setFilter}
            options={[
              { value: "open", label: "Open", count: openCount },
              { value: "done", label: "Done / not needed", count: doneCount },
              { value: "all", label: "All" }
            ]}
          />
          {overdueCount && filter !== "done" ? <Badge variant="destructive">{overdueCount} overdue</Badge> : null}
        </div>
      ) : null}
      {!loaded ? (
        <div role="status">
          <span className="sr-only">Loading action items…</span>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : visible.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={<ListChecks aria-hidden="true" />}
            title="No action items yet"
            description="Tasks appear here once minutes that list action items are approved."
            action={
              <Button asChild variant="outline">
                <Link href="/admin/minutes">Open meeting minutes</Link>
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={<ListChecks aria-hidden="true" />}
            title={filter === "open" ? "Nothing left to do" : "Nothing here yet"}
            description={filter === "open" ? "Every action item is done or not needed." : "Items you mark done or not needed show up here."}
          />
        )
      ) : (
        <AdminList label="Action items">
          {visible.map(item => {
            const badge = item.overdue || item.status !== "open" ? statusBadge("actionItem", item.overdue ? "overdue" : item.status) : null;
            return (
              <AdminListRow
                key={item.key}
                title={<span className="break-words">{item.task}</span>}
                badges={badge ? <Badge variant={badge.variant}>{badge.label}</Badge> : null}
                meta={
                  <>
                    {item.eventTitle}
                    {item.assignedTo ? ` · ${item.assignedTo}` : ""}
                    {item.dueDate ? ` · due ${formatShortDate(item.dueDate, DUE_DATE)}` : ""}
                  </>
                }
                actions={
                  item.status === "open" ? (
                    <>
                      <Button variant="outline" size="row" loading={busy === item.key} onClick={() => setStatus(item, "done")}>
                        Mark done
                      </Button>
                      <Button variant="outline" size="row" disabled={busy === item.key} onClick={() => setStatus(item, "dropped")}>
                        Not needed
                      </Button>
                    </>
                  ) : (
                    <Button variant="outline" size="row" loading={busy === item.key} onClick={() => setStatus(item, "open")}>
                      Reopen
                    </Button>
                  )
                }
              >
                {item.note ? <p className="mt-1 text-sm text-muted-foreground">{item.note}</p> : null}
              </AdminListRow>
            );
          })}
        </AdminList>
      )}
    </div>
  );
}
