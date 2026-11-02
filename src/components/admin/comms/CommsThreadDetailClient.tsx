"use client";

import { notifyActivity } from "@/src/lib/notifyClient";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, MessageSquare, Reply, ThumbsUp } from "lucide-react";
import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc
} from "firebase/firestore";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { formatDateTime } from "@/src/lib/format";
import { firestore, firebaseInitError } from "@/src/lib/firebaseClient";
import { resolveActorName } from "@/src/lib/actor";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import {
  commentLoc,
  conclusionLoc,
  unpackComment,
  unpackThread,
  unpackVote,
  voteLoc,
  type CommentView,
  type ThreadView
} from "@/src/lib/commsRecords";
import type { CommsActorSnapshot, CommsConclusionVoteValue } from "@/src/lib/comms";

type CommsThreadDetailClientProps = {
  threadId: string;
  actor: CommsActorSnapshot;
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High"
};

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  closing: "Closing",
  closed: "Closed"
};

export default function CommsThreadDetailClient({ threadId, actor }: CommsThreadDetailClientProps) {
  const { packPrivate, unpackPrivate } = useE2ee();
  const [thread, setThread] = useState<ThreadView | null>(null);
  const [comments, setComments] = useState<CommentView[]>([]);
  const [storedTally, setVoteTally] = useState<{ approve: number; reject: number; mine: CommsConclusionVoteValue | null }>({
    approve: 0,
    reject: 0,
    mine: null
  });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [commentBody, setCommentBody] = useState("");
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [commentStatus, setCommentStatus] = useState<string | null>(null);
  const [isPostingComment, setIsPostingComment] = useState(false);
  const [likedComments, setLikedComments] = useState<Record<string, boolean>>({});
  const [likeCounts, setLikeCounts] = useState<Record<string, number>>({});
  const [likeStatus, setLikeStatus] = useState<string | null>(null);
  const [isLiking, setIsLiking] = useState(false);

  const [conclusionVoteStatus, setConclusionVoteStatus] = useState<string | null>(null);
  const [isVotingConclusion, setIsVotingConclusion] = useState(false);

  const [proposeModalOpen, setProposeModalOpen] = useState(false);
  const [proposedConclusion, setProposedConclusion] = useState("");
  const [proposeStatus, setProposeStatus] = useState<string | null>(null);
  const [isProposing, setIsProposing] = useState(false);

  const [finalizeStatus, setFinalizeStatus] = useState<string | null>(null);
  const [isFinalizing, setIsFinalizing] = useState(false);

  const commentInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (!firestore) {
      setLoadError(firebaseInitError || "Firebase is not configured.");
      setLoading(false);
      return;
    }
    const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
    let cancelled = false;
    const unsubscribe = onSnapshot(
      threadRef,
      snapshot => {
        if (!snapshot.exists()) {
          setLoadError("Thread not found.");
          setThread(null);
          setLoading(false);
          return;
        }
        void unpackThread(unpackPrivate, snapshot.id, snapshot.data() as Record<string, unknown>).then(next => {
          if (cancelled) return;
          setThread(next);
          setLoadError(null);
          setLoading(false);
        });
      },
      error => {
        setLoadError(error.message || "Unable to load thread");
        setLoading(false);
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [threadId, unpackPrivate]);

  useEffect(() => {
    if (!firestore) return;
    let cancelled = false;
    const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
    const commentQuery = query(collection(threadRef, "comments"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      commentQuery,
      snapshot => {
        const raw = snapshot.docs.map(d => ({ id: d.id, data: d.data() as Record<string, unknown> }));
        void Promise.all(raw.map(item => unpackComment(unpackPrivate, threadId, item.id, item.data))).then(next => {
          if (!cancelled) setComments(next);
        });
      },
      error => {
        setCommentStatus(error.message || "Unable to load comments");
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [threadId, unpackPrivate]);

  useEffect(() => {
    if (!firestore || !actor.uid) return;
    setLikedComments({});
    setLikeCounts({});
    const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
    const unsubscribes = comments.map(comment => {
      const likesRef = collection(threadRef, "comments", comment.id, "likes");
      return onSnapshot(
        likesRef,
        snapshot => {
          setLikeCounts(prev => ({ ...prev, [comment.id]: snapshot.size }));
          const iLiked = snapshot.docs.some(docSnap => docSnap.id === actor.uid);
          setLikedComments(prev => ({ ...prev, [comment.id]: iLiked }));
        },
        error => {
          setLikeStatus(error.message || "Unable to load likes");
        }
      );
    });
    return () => {
      unsubscribes.forEach(unsub => unsub());
    };
  }, [comments, threadId, actor.uid]);

  const threadStatus = thread?.status;
  useEffect(() => {
    if (!firestore || !actor.uid || threadStatus !== "closing") {
      return;
    }
    let cancelled = false;
    const votesRef = collection(firestore, "organizations", "ghmo", "commsThreads", threadId, "conclusionVotes");
    const unsubscribe = onSnapshot(
      votesRef,
      snapshot => {
        const raw = snapshot.docs.map(d => ({ uid: d.id, data: d.data() as Record<string, unknown> }));
        void Promise.all(
          raw.map(async item => ({ uid: item.uid, value: await unpackVote(unpackPrivate, threadId, item.uid, item.data) }))
        ).then(votes => {
          if (cancelled) return;
          setVoteTally({
            approve: votes.filter(v => v.value === "approve").length,
            reject: votes.filter(v => v.value === "reject").length,
            mine: votes.find(v => v.uid === actor.uid)?.value ?? null
          });
        });
      },
      error => {
        setConclusionVoteStatus(error.message || "Unable to load votes");
      }
    );
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [threadId, actor.uid, threadStatus, unpackPrivate]);
  const voteTally = threadStatus === "closing" ? storedTally : { approve: 0, reject: 0, mine: null };
  const conclusionVote = voteTally.mine;

  const status = thread?.status || "open";
  const isOpen = status === "open";
  const isClosing = status === "closing";
  const isClosed = status === "closed";

  const handleToggleLike = async (commentId: string) => {
    if (!firestore || !thread || !isOpen || isLiking) return;
    setIsLiking(true);
    setLikeStatus(null);
    try {
      const likeRef = doc(
        firestore,
        "organizations",
        "ghmo",
        "commsThreads",
        threadId,
        "comments",
        commentId,
        "likes",
        actor.uid
      );
      if (likedComments[commentId]) {
        await deleteDoc(likeRef);
      } else {
        await setDoc(
          likeRef,
          {
            createdAt: serverTimestamp(),
            createdBy: { uid: actor.uid, name: actor.name }
          },
          { merge: false }
        );
      }
    } catch (error: any) {
      setLikeStatus(error.message || "Unable to update like");
    } finally {
      setIsLiking(false);
    }
  };

  const handleConclusionVote = async (nextVote: "approve" | "reject") => {
    if (!firestore || !thread || !isClosing || isVotingConclusion) return;
    if (conclusionVote === nextVote) return;
    setIsVotingConclusion(true);
    setConclusionVoteStatus(null);
    try {
      const voteRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId, "conclusionVotes", actor.uid);
      const privateFields = await packPrivate(voteLoc(threadId, actor.uid), { value: nextVote });
      // Replaces the whole document: a changed vote never leaves an old field behind.
      await setDoc(voteRef, { ...privateFields, createdAt: serverTimestamp(), createdBy: actor });
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comms_conclusion_vote",
          resource: {
            type: "comms_thread",
            id: threadId
          }
        })
      });
    } catch (error: any) {
      setConclusionVoteStatus(error.message || "Unable to submit vote");
    } finally {
      setIsVotingConclusion(false);
    }
  };

  const handlePostComment = async () => {
    if (!firestore || !thread || !isOpen) return;
    const trimmed = commentBody.trim();
    if (!trimmed) {
      setCommentStatus("Comment cannot be empty.");
      return;
    }
    if (isPostingComment) return;
    setIsPostingComment(true);
    setCommentStatus(null);
    try {
      const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
      const commentRef = doc(collection(threadRef, "comments"));
      const privateFields = await packPrivate(commentLoc(threadId, commentRef.id), { body: trimmed });
      await runTransaction(firestore, async transaction => {
        const threadSnap = await transaction.get(threadRef);
        if (!threadSnap.exists()) throw new Error("Thread unavailable");
        const threadData = threadSnap.data() as { status?: string; commentCount?: number };
        if ((threadData.status || "open") !== "open") {
          throw new Error("Thread is closed");
        }
        transaction.set(commentRef, {
          ...privateFields,
          createdAt: serverTimestamp(),
          createdBy: actor,
          ...(replyToId ? { parentId: replyToId } : {})
        });
        transaction.update(threadRef, {
          commentCount: (threadData.commentCount || 0) + 1,
          lastActivityAt: serverTimestamp()
        });
      });
      notifyActivity("thread");
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comms_comment_created",
          resource: {
            type: "comms_thread",
            id: threadId
          }
        })
      });
      setCommentBody("");
      setReplyToId(null);
      commentInputRef.current?.focus();
    } catch (error: any) {
      setCommentStatus(error.message || "Unable to post comment");
    } finally {
      setIsPostingComment(false);
    }
  };

  const handleProposeConclusion = async () => {
    if (!firestore || !thread || !isOpen) return;
    const trimmed = proposedConclusion.trim();
    if (trimmed.length < 6) {
      setProposeStatus("Conclusion must be at least 6 characters.");
      return;
    }
    if (isProposing) return;
    setIsProposing(true);
    setProposeStatus(null);
    try {
      const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
      const privateFields = await packPrivate(conclusionLoc(threadId), { text: trimmed });
      await runTransaction(firestore, async transaction => {
        const threadSnap = await transaction.get(threadRef);
        if (!threadSnap.exists()) throw new Error("Thread unavailable");
        const threadData = threadSnap.data() as { status?: string };
        if ((threadData.status || "open") !== "open") {
          throw new Error("Thread is not open");
        }
        transaction.update(threadRef, {
          status: "closing",
          conclusion: {
            ...privateFields,
            proposedAt: serverTimestamp(),
            proposedBy: actor
          },
          lastActivityAt: serverTimestamp()
        });
      });
      notifyActivity("thread");
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comms_conclusion_proposed",
          resource: {
            type: "comms_thread",
            id: threadId
          }
        })
      });
      setProposeModalOpen(false);
      setProposedConclusion("");
    } catch (error: any) {
      setProposeStatus(error.message || "Unable to propose conclusion");
    } finally {
      setIsProposing(false);
    }
  };

  const handleFinalizeClose = async () => {
    if (!firestore || !thread || !isClosing) return;
    if (isFinalizing) return;
    setIsFinalizing(true);
    setFinalizeStatus(null);
    try {
      const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
      await runTransaction(firestore, async transaction => {
        const threadSnap = await transaction.get(threadRef);
        if (!threadSnap.exists()) throw new Error("Thread unavailable");
        const threadData = threadSnap.data() as { status?: string; conclusion?: { text?: string; enc?: unknown } };
        if ((threadData.status || "open") !== "closing") {
          throw new Error("Thread is not in closing");
        }
        if (!threadData.conclusion?.text?.trim() && !threadData.conclusion?.enc) {
          throw new Error("Conclusion is required");
        }
        transaction.update(threadRef, {
          status: "closed",
          finalizedAt: serverTimestamp(),
          finalizedBy: actor,
          lastActivityAt: serverTimestamp()
        });
      });
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comms_thread_closed",
          resource: {
            type: "comms_thread",
            id: threadId
          }
        })
      });
    } catch (error: any) {
      setFinalizeStatus(error.message || "Unable to finalize close");
    } finally {
      setIsFinalizing(false);
    }
  };

  const threadMeta = useMemo(() => {
    if (!thread) return null;
    return {
      createdAt: formatTimestamp(thread.createdAt),
      createdBy: resolveActorName(thread.createdBy),
      status: thread.status || "open",
      commentCount: thread.commentCount ?? 0,
      priority: thread.priority,
      pinned: thread.pinned
    };
  }, [thread]);

  const topLevelComments = useMemo(() => comments.filter(comment => !comment.parentId), [comments]);

  const repliesByParent = useMemo(() => {
    const grouped: Record<string, CommentView[]> = {};
    comments.forEach(comment => {
      if (!comment.parentId) return;
      if (!grouped[comment.parentId]) grouped[comment.parentId] = [];
      grouped[comment.parentId].push(comment);
    });
    return grouped;
  }, [comments]);

  const replyTarget = useMemo(() => {
    if (!replyToId) return null;
    return comments.find(comment => comment.id === replyToId) || null;
  }, [comments, replyToId]);

  return (
    <div className="flex flex-col gap-6">
      {loading ? (
        <div role="status" className="flex flex-col gap-4">
          <span className="sr-only">Loading the topic…</span>
          <Skeleton className="h-40 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      ) : loadError ? (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load this topic</AlertTitle>
          <AlertDescription>{loadError}</AlertDescription>
        </Alert>
      ) : thread && threadMeta ? (
        <>
          <AdminSectionCard>
            <div className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="text-xl font-semibold tracking-tight break-words text-foreground">{thread.title}</h2>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Started {threadMeta.createdAt} by {threadMeta.createdBy}
                  </p>
                </div>
                {isOpen ? (
                  <Button type="button" variant="outline" onClick={() => setProposeModalOpen(true)}>
                    Propose conclusion
                  </Button>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_BADGE[threadMeta.status] ?? "secondary"}>{STATUS_LABELS[threadMeta.status] || threadMeta.status}</Badge>
                {threadMeta.pinned ? <Badge variant="outline">Pinned</Badge> : null}
                {threadMeta.priority && threadMeta.priority !== "normal" ? (
                  <Badge variant={threadMeta.priority === "high" ? "warning" : "outline"}>{PRIORITY_LABELS[threadMeta.priority] || threadMeta.priority} priority</Badge>
                ) : null}
                <span className="text-sm text-muted-foreground">
                  {threadMeta.commentCount} {threadMeta.commentCount === 1 ? "comment" : "comments"}
                </span>
              </div>
              <p className="text-base break-words whitespace-pre-wrap text-foreground">{thread.body}</p>
              {isOpen ? (
                <p className="text-sm text-muted-foreground">When the team has agreed, propose a conclusion. Admins then vote on it before it is closed.</p>
              ) : null}
            </div>

            {(isClosing || isClosed) && thread.conclusion?.text ? (
              <div className="mt-5 flex flex-col gap-4 rounded-xl border border-border bg-muted/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-base font-semibold text-foreground">Conclusion</h3>
                    <p className="mt-1 text-sm break-words whitespace-pre-wrap text-foreground">{thread.conclusion.text}</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Proposed {formatTimestamp(thread.conclusion.proposedAt)} by {resolveActorName(thread.conclusion.proposedBy)}
                    </p>
                  </div>
                  {isClosing ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="success">{voteTally.approve} approve</Badge>
                      <Badge variant="destructive">{voteTally.reject} reject</Badge>
                    </div>
                  ) : null}
                </div>

                {isClosing ? (
                  <div className="flex flex-col gap-3">
                    <div className="flex flex-wrap gap-2" role="group" aria-label="Your vote">
                      <Button
                        type="button"
                        variant={conclusionVote === "approve" ? "secondary" : "outline"}
                        aria-pressed={conclusionVote === "approve"}
                        onClick={() => handleConclusionVote("approve")}
                        disabled={isVotingConclusion || conclusionVote === "approve"}
                      >
                        {conclusionVote === "approve" ? <Check aria-hidden="true" /> : null}
                        Approve
                      </Button>
                      <Button
                        type="button"
                        variant={conclusionVote === "reject" ? "secondary" : "outline"}
                        aria-pressed={conclusionVote === "reject"}
                        onClick={() => handleConclusionVote("reject")}
                        disabled={isVotingConclusion || conclusionVote === "reject"}
                      >
                        {conclusionVote === "reject" ? <Check aria-hidden="true" /> : null}
                        Reject
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" onClick={handleFinalizeClose} loading={isFinalizing}>
                        {isFinalizing ? "Finalizing…" : "Finalize close"}
                      </Button>
                      <p className="text-sm text-muted-foreground">Closes the topic with this conclusion.</p>
                    </div>
                    {conclusionVoteStatus ? (
                      <p role="status" className="text-sm text-muted-foreground">
                        {conclusionVoteStatus}
                      </p>
                    ) : null}
                    {finalizeStatus ? (
                      <p role="alert" className="text-sm font-medium text-destructive">
                        {finalizeStatus}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                {isClosed ? (
                  <p className="text-sm text-muted-foreground">
                    Finalized {formatTimestamp(thread.finalizedAt)} by {resolveActorName(thread.finalizedBy)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </AdminSectionCard>

          <AdminSectionCard title="Discussion" description="Comments and replies from the admin team.">
            {topLevelComments.length === 0 ? (
              <EmptyState
                icon={<MessageSquare aria-hidden="true" />}
                title="No comments yet"
                description={isOpen ? "Be the first to share your view below." : "Nobody commented on this topic."}
                className="py-8"
              />
            ) : (
              <ul className="flex flex-col gap-3">
                {topLevelComments.map(comment => {
                  const replies = repliesByParent[comment.id] || [];
                  return (
                    <li key={comment.id} className="flex flex-col gap-2">
                      <CommentCard
                        comment={comment}
                        liked={Boolean(likedComments[comment.id])}
                        likeCount={likeCounts[comment.id] ?? 0}
                        canAct={isOpen}
                        likeBusy={isLiking}
                        onLike={() => handleToggleLike(comment.id)}
                        onReply={() => {
                          setReplyToId(comment.id);
                          commentInputRef.current?.focus();
                        }}
                      />
                      {replies.length > 0 ? (
                        <ul className="flex flex-col gap-2 border-l-2 border-border pl-3 sm:pl-4">
                          {replies.map(reply => (
                            <li key={reply.id}>
                              <CommentCard
                                comment={reply}
                                liked={Boolean(likedComments[reply.id])}
                                likeCount={likeCounts[reply.id] ?? 0}
                                canAct={isOpen}
                                likeBusy={isLiking}
                                onLike={() => handleToggleLike(reply.id)}
                              />
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="mt-5 flex flex-col gap-3 border-t border-border pt-5">
              {replyTarget ? (
                <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
                  <span>Replying to {resolveActorName(replyTarget.createdBy)}</span>
                  <Button type="button" variant="ghost" onClick={() => setReplyToId(null)}>
                    Cancel reply
                  </Button>
                </div>
              ) : null}
              <Field label={replyTarget ? "Your reply" : "Add a comment"}>
                <Textarea
                  ref={commentInputRef}
                  value={commentBody}
                  onChange={event => setCommentBody(event.target.value)}
                  rows={3}
                  disabled={!isOpen}
                  placeholder={isOpen ? "Share feedback or a decision." : "This topic is closed to new comments."}
                />
              </Field>
              <div className="flex flex-wrap items-center gap-3">
                <Button type="button" onClick={handlePostComment} disabled={!isOpen} loading={isPostingComment}>
                  {isPostingComment ? "Posting…" : "Post comment"}
                </Button>
                {commentStatus ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {commentStatus}
                  </p>
                ) : null}
                {likeStatus ? (
                  <p role="status" className="text-sm text-muted-foreground">
                    {likeStatus}
                  </p>
                ) : null}
              </div>
            </div>
          </AdminSectionCard>
        </>
      ) : null}

      <Dialog open={proposeModalOpen} onOpenChange={setProposeModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Propose conclusion</DialogTitle>
            <DialogDescription>Write down what was decided. Admins then vote to approve or reject it before the topic is closed.</DialogDescription>
          </DialogHeader>
          <Field label="Conclusion" error={proposeStatus ?? undefined}>
            <Textarea
              value={proposedConclusion}
              onChange={event => setProposedConclusion(event.target.value)}
              rows={4}
              placeholder="Summarize the decision or outcome."
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setProposeModalOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={handleProposeConclusion} loading={isProposing}>
              {isProposing ? "Proposing…" : "Propose conclusion"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const STATUS_BADGE: Record<string, "success" | "warning" | "secondary"> = {
  open: "success",
  closing: "warning",
  closed: "secondary"
};

function CommentCard({
  comment,
  liked,
  likeCount,
  canAct,
  likeBusy,
  onLike,
  onReply
}: {
  comment: CommentView;
  liked: boolean;
  likeCount: number;
  canAct: boolean;
  likeBusy: boolean;
  onLike: () => void;
  onReply?: () => void;
}) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold text-foreground">{resolveActorName(comment.createdBy)}</p>
        <span className="text-sm text-muted-foreground">{formatTimestamp(comment.createdAt)}</span>
      </div>
      <p className="mt-1 text-sm break-words whitespace-pre-wrap text-foreground">{comment.body}</p>
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <Button type="button" variant="ghost" aria-pressed={liked} onClick={onLike} disabled={!canAct || likeBusy} className="text-muted-foreground">
          <ThumbsUp aria-hidden="true" className={liked ? "fill-current text-primary" : undefined} />
          {liked ? "Liked" : "Like"} · {likeCount}
        </Button>
        {onReply ? (
          <Button type="button" variant="ghost" onClick={onReply} disabled={!canAct} className="text-muted-foreground">
            <Reply aria-hidden="true" />
            Reply
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function formatTimestamp(value?: { toDate?: () => Date } | null) {
  return formatDateTime(value) || "date unknown";
}
