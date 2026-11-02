"use client";

import { notifyActivity } from "@/src/lib/notifyClient";
import { useEffect, useMemo, useRef, useState } from "react";
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
import { MessagesSquare, Plus, Search } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Segmented } from "@/src/components/ui/segmented";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { formatDateTime } from "@/src/lib/format";
import { firestore, firebaseInitError } from "@/src/lib/firebaseClient";
import { resolveActorName } from "@/src/lib/actor";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { useEncryptedDraft } from "@/src/lib/e2ee/client/useEncryptedDraft";
import { DraftBanner } from "@/src/components/admin/encryption/DraftBanner";
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
  const { unpackPrivate, packPrivate } = useE2ee();
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
  const [formOpen, setFormOpen] = useState(false);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  const draft = useEncryptedDraft({
    uid: actor.uid,
    name: "thread:new",
    value: { title, body },
    hasContent: Boolean(title.trim() || body.trim())
  });

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
      notifyActivity("thread");
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
      draft.clear();
      setTitle("");
      setBody("");
      setPriority("normal");
      setPinned(false);
      setFormOpen(false);
      setCreateStatus("Thread created.");
    } catch (error: any) {
      setCreateStatus(error.message || "Unable to create thread.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const statusCounts = useMemo(() => {
    const counts: Record<StatusFilter, number> = { all: threads.length, open: 0, closing: 0, closed: 0 };
    for (const thread of threads) counts[thread.status || "open"] += 1;
    return counts;
  }, [threads]);

  // The form is shown when asked for, when there is nothing to list yet, or when a draft is waiting.
  const showForm = formOpen || (!loading && !loadError && threads.length === 0) || Boolean(draft.pending);
  const canHideForm = threads.length > 0 && !draft.pending;

  const openForm = () => {
    setFormOpen(true);
    setCreateStatus(null);
    requestAnimationFrame(() => {
      titleInputRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      titleInputRef.current?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {draft.pending ? (
        <DraftBanner
          savedAt={draft.pending.savedAt}
          onRestore={() => {
            const restored = draft.restore();
            if (restored) {
              setTitle(restored.title);
              setBody(restored.body);
              setFormOpen(true);
            }
          }}
          onDiscard={draft.discard}
        />
      ) : null}

      <AdminSectionCard
        title="Topics"
        description="Newest activity first. Open a topic to read and reply."
        actions={
          !showForm && !loading ? (
            <Button type="button" onClick={openForm}>
              <Plus aria-hidden="true" />
              Start a new topic
            </Button>
          ) : null
        }
      >
        <div className="flex flex-col gap-4">
          {createStatus && !showForm ? (
            <p role="status" className="text-sm font-medium text-success">
              {createStatus}
            </p>
          ) : null}

          {!loading && !loadError && threads.length > 0 ? (
            <div className="flex flex-wrap items-center gap-3">
              <Segmented
                label="Show"
                value={statusFilter}
                onChange={setStatusFilter}
                options={(["all", "open", "closing", "closed"] as StatusFilter[]).map(status => ({
                  value: status,
                  label: status === "all" ? "All" : STATUS_LABELS[status],
                  count: statusCounts[status]
                }))}
              />
              <div className="relative min-w-0 flex-1 basis-56">
                <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  aria-label="Search topics"
                  value={queryText}
                  onChange={event => setQueryText(event.target.value)}
                  className="pl-9"
                  placeholder="Search title or details"
                />
              </div>
            </div>
          ) : null}

          {loading ? (
            <div role="status" className="flex flex-col gap-3">
              <span className="sr-only">Loading topics…</span>
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 rounded-xl" />
              ))}
            </div>
          ) : loadError ? (
            <Alert variant="destructive">
              <AlertTitle>Couldn&apos;t load topics</AlertTitle>
              <AlertDescription>{loadError}</AlertDescription>
            </Alert>
          ) : threads.length === 0 ? (
            <EmptyState
              icon={<MessagesSquare aria-hidden="true" />}
              title="No topics yet"
              description="Start the first one with the form below: a plan to agree, a proposal, or an issue to sort out."
            />
          ) : filteredThreads.length === 0 ? (
            <EmptyState
              title="No topics match"
              description="Try another word, or show all topics."
              action={
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setQueryText("");
                    setStatusFilter("all");
                  }}
                >
                  Show all topics
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-3">
              {filteredThreads.map(thread => {
                const status = thread.status || "open";
                return (
                  <li key={thread.id}>
                    <Link
                      href={`/admin/comms/${thread.id}`}
                      className="block rounded-xl border border-border bg-card px-4 py-4 transition outline-none hover:border-primary/40 hover:shadow-sm focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                        <div className="min-w-0">
                          <h3 className="text-base font-semibold break-words text-foreground">{thread.title}</h3>
                          <p className="mt-0.5 text-sm text-muted-foreground">
                            {formatTimestamp(thread.createdAt)} · {resolveActorName(thread.createdBy)}
                          </p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge variant={STATUS_BADGE[status]}>{STATUS_LABELS[status]}</Badge>
                          {thread.pinned ? <Badge variant="outline">Pinned</Badge> : null}
                          {thread.priority && thread.priority !== "normal" ? (
                            <Badge variant={thread.priority === "high" ? "warning" : "outline"}>{PRIORITY_LABELS[thread.priority]} priority</Badge>
                          ) : null}
                        </div>
                      </div>
                      <p className="mt-2 line-clamp-2 text-sm break-words text-muted-foreground">{thread.body}</p>
                      <p className="mt-2 text-sm text-muted-foreground">
                        {thread.commentCount ?? 0} {(thread.commentCount ?? 0) === 1 ? "comment" : "comments"}
                      </p>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </AdminSectionCard>

      {showForm ? (
        <AdminSectionCard
          title="Start a new topic"
          description="Say what needs deciding. Other admins can comment, and the topic closes with an agreed conclusion."
          actions={
            canHideForm ? (
              <Button type="button" variant="ghost" onClick={() => setFormOpen(false)}>
                Cancel
              </Button>
            ) : null
          }
        >
          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
            <div className="flex flex-col gap-4">
              <Field label="Title">
                <Input ref={titleInputRef} value={title} onChange={event => setTitle(event.target.value)} placeholder="e.g., Approve community outreach plan" />
              </Field>
              <Field label="Details">
                <Textarea value={body} onChange={event => setBody(event.target.value)} rows={5} placeholder="Summarize the plan, proposal, or issue." />
              </Field>
            </div>
            <div className="flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4">
              <Field label="Priority" description="High priority topics are marked in the list.">
                <Select value={priority} onChange={event => setPriority(event.target.value as CommsThreadPriority)}>
                  {Object.entries(PRIORITY_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <label className="flex min-h-11 items-center gap-3 text-sm text-foreground">
                <input type="checkbox" checked={pinned} onChange={event => setPinned(event.target.checked)} className="size-4 rounded-sm border-input accent-primary" />
                Pin to the top of the list
              </label>
              <Button type="button" size="lg" onClick={handleCreateThread} loading={isSubmitting}>
                {/* "Create thread" is the name the browser tests click. */}
                {isSubmitting ? "Creating…" : "Create thread"}
              </Button>
              {createStatus ? (
                <p role="status" className="text-sm text-muted-foreground">
                  {createStatus}
                </p>
              ) : null}
            </div>
          </div>
        </AdminSectionCard>
      ) : null}
    </div>
  );
}

const STATUS_BADGE: Record<CommsThreadStatus, "success" | "warning" | "secondary"> = {
  open: "success",
  closing: "warning",
  closed: "secondary"
};

function formatTimestamp(value?: { toDate?: () => Date } | null) {
  return formatDateTime(value) || "Date unknown";
}
