"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import Link from "next/link";
import { ListChecks } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Segmented } from "@/src/components/ui/segmented";
import { formatShortDate } from "@/src/lib/format";
import { firestore } from "@/src/lib/firebaseClient";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
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
  const [filter, setFilter] = useState<Filter>("open");
  const [busy, setBusy] = useState<string | null>(null);

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
          const next = new Map<string, StatusRecord>();
          for (const [key, value] of entries) if (value) next.set(key, value);
          setStatuses(next);
        });
      },
      error => toast.error(error.message || "Could not load action item statuses")
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [unpackPrivate]);

  useEffect(() => {
    let cancelled = false;
    void buildItems(minutes, statuses).then(next => {
      if (!cancelled) setItems(next);
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
      toast.error(error instanceof Error ? error.message : "Could not update");
    } finally {
      setBusy(null);
    }
  };

  const openCount = items.filter(item => item.status === "open").length;
  const overdueCount = items.filter(item => item.overdue).length;

  const doneCount = items.length - openCount;

  return (
    <div className="flex flex-col gap-4">
      {items.length > 0 ? (
        <Segmented
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            {
              value: "open",
              label: (
                <>
                  Open
                  {overdueCount ? (
                    <span className="rounded-full bg-destructive/10 px-1.5 text-xs font-semibold text-destructive">{overdueCount} overdue</span>
                  ) : null}
                </>
              ),
              count: openCount
            },
            // "Done / dropped" is the name the browser tests click.
            { value: "done", label: "Done / dropped", count: doneCount },
            { value: "all", label: "All", count: items.length }
          ]}
        />
      ) : null}
      {visible.length === 0 ? (
        items.length === 0 ? (
          <EmptyState
            icon={<ListChecks aria-hidden="true" />}
            title="No action items yet"
            description="Tasks appear here once minutes that list action items are approved."
            action={
              <Button asChild variant="outline">
                <Link href="/admin/minutes">Go to Meeting Minutes</Link>
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
        <ul className="flex flex-col gap-2">
          {visible.map(item => (
            <li key={item.key} className="flex flex-col gap-3 rounded-xl border border-border bg-card px-4 py-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <p className="font-medium break-words text-foreground">{item.task}</p>
                <p className="text-sm text-muted-foreground">
                  {item.eventTitle}
                  {item.assignedTo ? ` · ${item.assignedTo}` : ""}
                  {item.dueDate ? ` · due ${formatShortDate(item.dueDate)}` : ""}
                </p>
                {item.note ? <p className="mt-1 text-sm text-muted-foreground">{item.note}</p> : null}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-2">
                {item.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                {item.status !== "open" ? <Badge variant="secondary">{item.status === "done" ? "Done" : "Not needed"}</Badge> : null}
                {item.status === "open" ? (
                  <>
                    <Button loading={busy === item.key} onClick={() => setStatus(item, "done")}>
                      Mark done
                    </Button>
                    <Button variant="outline" disabled={busy === item.key} onClick={() => setStatus(item, "dropped")}>
                      Not needed
                    </Button>
                  </>
                ) : (
                  <Button variant="outline" loading={busy === item.key} onClick={() => setStatus(item, "open")}>
                    Reopen
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
