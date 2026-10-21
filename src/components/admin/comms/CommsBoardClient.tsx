"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  collection,
  doc,
  setDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "firebase/firestore";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { firestore, firebaseInitError } from "@/src/lib/firebaseClient";
import { resolveActorName } from "@/src/lib/actor";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { THREADS_PATH, threadLoc, unpackThread, type ThreadView } from "@/src/lib/commsRecords";
import type {
  CommsActorSnapshot,
  CommsThreadPriority,
  CommsThreadStatus
} from "@/src/lib/comms";

type CommsBoardClientProps = {
  actor: CommsActorSnapshot;
};

type StatusFilter = "all" | CommsThreadStatus;

const STATUS_LABELS: Record<CommsThreadStatus, string> = {
  open: "Open",
  closing: "Closing",
  closed: "Closed"
};

const PRIORITY_LABELS: Record<CommsThreadPriority, string> = {
  low: "Low",
  normal: "Normal",
  high: "High"
};

export default function CommsBoardClient({ actor }: CommsBoardClientProps) {
  const { enabled: encrypted, unpackPrivate, packPrivate } = useE2ee();
  const [threads, setThreads] = useState<ThreadView[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [queryText, setQueryText] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState<CommsThreadPriority>("normal");
  const [pinned, setPinned] = useState(false);
  const [createStatus, setCreateStatus] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [seedStatus, setSeedStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!firestore) {
      setLoadError(firebaseInitError || "Firebase is not configured.");
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    let cancelled = false;
    const threadQuery = query(
      collection(firestore, "organizations", "ghmo", "commsThreads"),
      orderBy("lastActivityAt", "desc")
    );
    const unsubscribe = onSnapshot(
      threadQuery,
      snapshot => {
        const raw = snapshot.docs.map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        void Promise.all(raw.map(item => unpackThread(unpackPrivate, item.id, item.data)))
          .then(nextThreads => {
            if (cancelled) return;
            setThreads(nextThreads);
            setLoading(false);
          })
          .catch(error => {
            if (cancelled) return;
            setLoadError(error?.message || "Unable to load threads");
            setLoading(false);
          });
      },
      error => {
        setLoadError(error.message || "Unable to load threads");
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [unpackPrivate]);

  const normalizedQuery = queryText.trim().toLowerCase();

  const filteredThreads = useMemo(() => {
    let results = threads;
    if (statusFilter !== "all") {
      results = results.filter(thread => (thread.status || "open") === statusFilter);
    }
    if (normalizedQuery) {
      results = results.filter(thread => {
        const haystack = `${thread.title} ${thread.body}`.toLowerCase();
        return haystack.includes(normalizedQuery);
      });
    }
    return results;
  }, [threads, statusFilter, normalizedQuery]);

  const handleCreateThread = async () => {
    if (!firestore) return;
    const trimmedTitle = title.trim();
    const trimmedBody = body.trim();
    if (!trimmedTitle || !trimmedBody) {
      setCreateStatus("Title and details are required.");
      return;
    }
    if (isSubmitting) return;
    setIsSubmitting(true);
    setCreateStatus(null);
    try {
      const docRef = doc(collection(firestore, THREADS_PATH));
      const privateFields = await packPrivate(threadLoc(docRef.id), { title: trimmedTitle, body: trimmedBody });
      await setDoc(docRef, {
        ...privateFields,
        createdAt: serverTimestamp(),
        createdBy: actor,
        status: "open",
        lastActivityAt: serverTimestamp(),
        commentCount: 0,
        priority,
        pinned
      });
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comms_thread_created",
          resource: {
            type: "comms_thread",
            id: docRef.id
          }
        })
      });
      setTitle("");
      setBody("");
      setPriority("normal");
      setPinned(false);
      setCreateStatus("Thread created.");
    } catch (error: any) {
      setCreateStatus(error.message || "Unable to create thread.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSeedThreads = async () => {
    setSeedStatus(null);
    try {
      const res = await fetch("/api/admin/comms/seed", { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Unable to seed threads");
      }
      const data = await res.json().catch(() => ({}));
      setSeedStatus(data.message || "Sample threads created.");
    } catch (error: any) {
      setSeedStatus(error.message || "Unable to seed threads.");
    }
  };

  return (
    <div className="space-y-6">
      <AdminSectionCard
        title="Plans & Issues"
        description="For decisions, proposals, and issues. Close threads with a clear conclusion."
      >
        <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Thread title
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
                placeholder="e.g., Approve community outreach plan"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Details
              <textarea
                value={body}
                onChange={event => setBody(event.target.value)}
                rows={5}
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
                placeholder="Summarize the plan, proposal, or issue."
              />
            </label>
          </div>
          <div className="space-y-4 rounded-xl border border-border bg-background px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Thread settings
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Highlight urgency or pin important items to the top of attention.
              </p>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Priority
              <select
                value={priority}
                onChange={event => setPriority(event.target.value as CommsThreadPriority)}
                className="mt-2 w-full rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground"
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              <input
                type="checkbox"
                checked={pinned}
                onChange={event => setPinned(event.target.checked)}
                className="h-4 w-4 rounded-sm border-input text-primary focus:ring-primary"
              />
              Pin this thread for extra visibility
            </label>
            <button
              type="button"
              onClick={handleCreateThread}
              disabled={isSubmitting}
              className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating..." : "Create thread"}
            </button>
            {createStatus ? <p className="text-sm text-muted-foreground">{createStatus}</p> : null}
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="Threads"
        description="Track active proposals, discussion, and outcomes across the admin team."
        actions={
          threads.length === 0 && !encrypted ? (
            <button
              type="button"
              onClick={handleSeedThreads}
              className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              Create sample threads
            </button>
          ) : null
        }
      >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-wrap gap-2">
            {(["all", "open", "closing", "closed"] as StatusFilter[]).map(status => (
              <button
                key={status}
                type="button"
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                  statusFilter === status
                    ? "bg-slate-900 text-white"
                    : "border border-border text-muted-foreground hover:border-primary hover:text-foreground"
                }`}
              >
                {status === "all" ? "All" : STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <input
            value={queryText}
            onChange={event => setQueryText(event.target.value)}
            className="min-w-[220px] flex-1 rounded-full border border-border px-4 py-2 text-sm text-foreground/80 focus:border-primary focus:outline-hidden"
            placeholder="Search title or details"
          />
        </div>

        {seedStatus ? <p className="mt-3 text-sm text-muted-foreground">{seedStatus}</p> : null}

        {loading ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">Loading threads...</p>
          </div>
        ) : loadError ? (
          <div className="mt-6 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
            <p className="text-sm text-destructive">{loadError}</p>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center">
            <p className="text-sm text-muted-foreground">
              {threads.length === 0 ? "No threads yet." : "No threads match your filters."}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {filteredThreads.map(thread => (
              <Link
                key={thread.id}
                href={`/admin/comms/${thread.id}`}
                className="rounded-2xl border border-border bg-background px-4 py-4 transition hover:border-primary/50 hover:bg-card"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-foreground">{thread.title}</h3>
                      {(thread.pinned || thread.priority) && (
                        <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                          {thread.pinned ? "Pinned" : null}
                          {thread.pinned && thread.priority ? " • " : null}
                          {thread.priority ? PRIORITY_LABELS[thread.priority] : null}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {formatTimestamp(thread.createdAt)} • {resolveActorName(thread.createdBy)}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase">
                    <span
                      className={`rounded-full border px-2 py-0.5 ${
                        (thread.status || "open") === "open"
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : (thread.status || "open") === "closing"
                            ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-border bg-muted text-muted-foreground"
                      }`}
                    >
                      {STATUS_LABELS[thread.status || "open"]}
                    </span>
                    <span className="rounded-full border border-border bg-card px-2 py-0.5 text-muted-foreground">
                      {thread.commentCount ?? 0} comments
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{thread.body}</p>
              </Link>
            ))}
          </div>
        )}
      </AdminSectionCard>
    </div>
  );
}

function formatTimestamp(value?: { toDate?: () => Date } | null) {
  if (!value || typeof value?.toDate !== "function") return "Timestamp unavailable";
  return value.toDate().toLocaleString();
}
