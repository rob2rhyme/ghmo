"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp
} from "firebase/firestore";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { firestore, firebaseInitError } from "@/src/lib/firebaseClient";
import { resolveActorName } from "@/src/lib/actor";
import type {
  CommsActorSnapshot,
  CommsThread,
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
  const [threads, setThreads] = useState<CommsThread[]>([]);
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
    const threadQuery = query(
      collection(firestore, "organizations", "ghmo", "commsThreads"),
      orderBy("lastActivityAt", "desc")
    );
    const unsubscribe = onSnapshot(
      threadQuery,
      snapshot => {
        const nextThreads = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<CommsThread, "id">)
        }));
        setThreads(nextThreads);
        setLoading(false);
      },
      error => {
        setLoadError(error.message || "Unable to load threads");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

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
      const docRef = await addDoc(collection(firestore, "organizations", "ghmo", "commsThreads"), {
        title: trimmedTitle,
        body: trimmedBody,
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
            id: docRef.id,
            summary: trimmedTitle
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
        <div className="grid gap-4 lg:grid-cols-[1.2fr,1fr]">
          <div className="space-y-3">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Thread title
              <input
                value={title}
                onChange={event => setTitle(event.target.value)}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none"
                placeholder="e.g., Approve community outreach plan"
              />
            </label>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Details
              <textarea
                value={body}
                onChange={event => setBody(event.target.value)}
                rows={5}
                className="mt-2 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 focus:border-primary focus:outline-none"
                placeholder="Summarize the plan, proposal, or issue."
              />
            </label>
          </div>
          <div className="space-y-4 rounded-xl border border-slate-100 bg-slate-50 px-4 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Thread settings
              </p>
              <p className="mt-1 text-sm text-slate-600">
                Highlight urgency or pin important items to the top of attention.
              </p>
            </div>
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Priority
              <select
                value={priority}
                onChange={event => setPriority(event.target.value as CommsThreadPriority)}
                className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
              >
                {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={pinned}
                onChange={event => setPinned(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              Pin this thread for extra visibility
            </label>
            <button
              type="button"
              onClick={handleCreateThread}
              disabled={isSubmitting}
              className="w-full rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isSubmitting ? "Creating..." : "Create thread"}
            </button>
            {createStatus ? <p className="text-sm text-slate-500">{createStatus}</p> : null}
          </div>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="Threads"
        description="Track active proposals, discussion, and outcomes across the admin team."
        actions={
          threads.length === 0 ? (
            <button
              type="button"
              onClick={handleSeedThreads}
              className="rounded-full border border-slate-200 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-slate-600 transition hover:border-primary hover:text-slate-900"
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
                    : "border border-slate-200 text-slate-500 hover:border-primary hover:text-slate-900"
                }`}
              >
                {status === "all" ? "All" : STATUS_LABELS[status]}
              </button>
            ))}
          </div>
          <input
            value={queryText}
            onChange={event => setQueryText(event.target.value)}
            className="min-w-[220px] flex-1 rounded-full border border-slate-200 px-4 py-2 text-sm text-slate-700 focus:border-primary focus:outline-none"
            placeholder="Search title or details"
          />
        </div>

        {seedStatus ? <p className="mt-3 text-sm text-slate-500">{seedStatus}</p> : null}

        {loading ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm text-slate-500">Loading threads...</p>
          </div>
        ) : loadError ? (
          <div className="mt-6 rounded-xl border border-dashed border-rose-200 bg-rose-50 px-4 py-6 text-center">
            <p className="text-sm text-rose-600">{loadError}</p>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center">
            <p className="text-sm text-slate-500">
              {threads.length === 0 ? "No threads yet." : "No threads match your filters."}
            </p>
          </div>
        ) : (
          <div className="mt-6 grid gap-3">
            {filteredThreads.map(thread => (
              <Link
                key={thread.id}
                href={`/admin/comms/${thread.id}`}
                className="rounded-2xl border border-slate-100 bg-slate-50 px-4 py-4 transition hover:border-primary/50 hover:bg-white"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-base font-semibold text-slate-900">{thread.title}</h3>
                      {(thread.pinned || thread.priority) && (
                        <span className="rounded-full border border-slate-200 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                          {thread.pinned ? "Pinned" : null}
                          {thread.pinned && thread.priority ? " • " : null}
                          {thread.priority ? PRIORITY_LABELS[thread.priority] : null}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
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
                          : "border-slate-200 bg-slate-100 text-slate-600"
                      }`}
                    >
                      {STATUS_LABELS[thread.status || "open"]}
                    </span>
                    <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-slate-600">
                      {thread.commentCount ?? 0} comments
                    </span>
                  </div>
                </div>
                <p className="mt-2 text-sm text-slate-600">{thread.body}</p>
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
