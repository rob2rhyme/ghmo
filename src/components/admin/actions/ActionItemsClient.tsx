"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { toast } from "sonner";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
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

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {(["open", "done", "all"] as Filter[]).map(value => (
          <Button key={value} size="sm" variant={filter === value ? "default" : "outline"} onClick={() => setFilter(value)}>
            {value === "open" ? `Open (${openCount})` : value === "done" ? "Done / dropped" : "All"}
          </Button>
        ))}
        {overdueCount ? <Badge variant="destructive">{overdueCount} overdue</Badge> : null}
      </div>
      {visible.length === 0 ? (
        <EmptyState title="Nothing here" description="Action items appear once minutes with tasks are approved." />
      ) : (
        <ul className="space-y-2">
          {visible.map(item => (
            <li key={item.key} className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3">
              <div>
                <p className="font-medium text-foreground">{item.task}</p>
                <p className="text-xs text-muted-foreground">
                  {item.eventTitle}
                  {item.assignedTo ? ` · ${item.assignedTo}` : ""}
                  {item.dueDate ? ` · due ${new Date(item.dueDate).toLocaleDateString()}` : ""}
                </p>
                {item.note ? <p className="mt-1 text-xs text-muted-foreground">{item.note}</p> : null}
              </div>
              <div className="flex items-center gap-2">
                {item.overdue ? <Badge variant="destructive">Overdue</Badge> : null}
                {item.status !== "open" ? <Badge variant="secondary">{item.status === "done" ? "Done" : "Dropped"}</Badge> : null}
                {item.status === "open" ? (
                  <>
                    <Button size="sm" loading={busy === item.key} onClick={() => setStatus(item, "done")}>
                      Mark done
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === item.key} onClick={() => setStatus(item, "dropped")}>
                      Drop
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="outline" loading={busy === item.key} onClick={() => setStatus(item, "open")}>
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
