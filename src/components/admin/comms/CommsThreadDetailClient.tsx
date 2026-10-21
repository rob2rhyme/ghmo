"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
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
import { firestore, firebaseInitError } from "@/src/lib/firebaseClient";
import { resolveActorName } from "@/src/lib/actor";
import type { CommsActorSnapshot, CommsComment, CommsThread } from "@/src/lib/comms";

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
  const [thread, setThread] = useState<CommsThread | null>(null);
  const [comments, setComments] = useState<CommsComment[]>([]);
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

  const [conclusionVote, setConclusionVote] = useState<"approve" | "reject" | null>(null);
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
    const unsubscribe = onSnapshot(
      threadRef,
      snapshot => {
        if (!snapshot.exists()) {
          setLoadError("Thread not found.");
          setThread(null);
        } else {
          setThread({ id: snapshot.id, ...(snapshot.data() as Omit<CommsThread, "id">) });
          setLoadError(null);
        }
        setLoading(false);
      },
      error => {
        setLoadError(error.message || "Unable to load thread");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [threadId]);

  useEffect(() => {
    if (!firestore) return;
    const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
    const commentQuery = query(collection(threadRef, "comments"), orderBy("createdAt", "asc"));
    const unsubscribe = onSnapshot(
      commentQuery,
      snapshot => {
        const nextComments = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<CommsComment, "id">)
        }));
        setComments(nextComments);
      },
      error => {
        setCommentStatus(error.message || "Unable to load comments");
      }
    );
    return () => unsubscribe();
  }, [threadId]);

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

  useEffect(() => {
    if (!firestore || !actor.uid || !thread || thread.status !== "closing") {
      setConclusionVote(null);
      return;
    }
    const voteRef = doc(
      firestore,
      "organizations",
      "ghmo",
      "commsThreads",
      threadId,
      "conclusionVotes",
      actor.uid
    );
    const unsubscribe = onSnapshot(
      voteRef,
      snapshot => {
        if (snapshot.exists()) {
          const data = snapshot.data() as { value?: "approve" | "reject" };
          setConclusionVote(data.value ?? null);
        } else {
          setConclusionVote(null);
        }
      },
      error => {
        setConclusionVoteStatus(error.message || "Unable to load votes");
      }
    );
    return () => unsubscribe();
  }, [threadId, actor.uid, thread]);

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
      const threadRef = doc(firestore, "organizations", "ghmo", "commsThreads", threadId);
      const voteRef = doc(threadRef, "conclusionVotes", actor.uid);
      let didChange = false;
      await runTransaction(firestore, async transaction => {
        const [threadSnap, voteSnap] = await Promise.all([
          transaction.get(threadRef),
          transaction.get(voteRef)
        ]);
        if (!threadSnap.exists()) throw new Error("Thread unavailable");
        const threadData = threadSnap.data() as CommsThread;
        if ((threadData.status || "open") !== "closing") {
          throw new Error("Thread is not in closing");
        }
        const currentVote = voteSnap.exists()
          ? ((voteSnap.data() as { value?: "approve" | "reject" }).value ?? null)
          : null;
        if (currentVote === nextVote) return;
        didChange = true;
        const approvedCount = threadData.approvedCount || 0;
        const rejectedCount = threadData.rejectedCount || 0;
        const nextApproved =
          approvedCount + (nextVote === "approve" ? 1 : 0) - (currentVote === "approve" ? 1 : 0);
        const nextRejected =
          rejectedCount + (nextVote === "reject" ? 1 : 0) - (currentVote === "reject" ? 1 : 0);
        transaction.set(
          voteRef,
          {
            value: nextVote,
            createdAt: serverTimestamp(),
            createdBy: actor
          },
          { merge: true }
        );
        transaction.update(threadRef, {
          approvedCount: Math.max(nextApproved, 0),
          rejectedCount: Math.max(nextRejected, 0),
          lastActivityAt: serverTimestamp()
        });
      });
      if (didChange) {
        void fetch("/api/admin/audit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "comms_conclusion_vote",
            resource: {
              type: "comms_thread",
              id: threadId,
              summary: thread.title
            },
            meta: { value: nextVote }
          })
        });
      }
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
      await runTransaction(firestore, async transaction => {
        const threadSnap = await transaction.get(threadRef);
        if (!threadSnap.exists()) throw new Error("Thread unavailable");
        const threadData = threadSnap.data() as CommsThread;
        if ((threadData.status || "open") !== "open") {
          throw new Error("Thread is closed");
        }
        transaction.set(commentRef, {
          body: trimmed,
          createdAt: serverTimestamp(),
          createdBy: actor,
          ...(replyToId ? { parentId: replyToId } : {})
        });
        transaction.update(threadRef, {
          commentCount: (threadData.commentCount || 0) + 1,
          lastActivityAt: serverTimestamp()
        });
      });
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comms_comment_created",
          resource: {
            type: "comms_thread",
            id: threadId,
            summary: thread.title
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
      await runTransaction(firestore, async transaction => {
        const threadSnap = await transaction.get(threadRef);
        if (!threadSnap.exists()) throw new Error("Thread unavailable");
        const threadData = threadSnap.data() as CommsThread;
        if ((threadData.status || "open") !== "open") {
          throw new Error("Thread is not open");
        }
        transaction.update(threadRef, {
          status: "closing",
          conclusion: {
            text: trimmed,
            proposedAt: serverTimestamp(),
            proposedBy: actor
          },
          approvedCount: 0,
          rejectedCount: 0,
          lastActivityAt: serverTimestamp()
        });
      });
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "comms_conclusion_proposed",
          resource: {
            type: "comms_thread",
            id: threadId,
            summary: thread.title
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
        const threadData = threadSnap.data() as CommsThread;
        if ((threadData.status || "open") !== "closing") {
          throw new Error("Thread is not in closing");
        }
        const conclusionText = threadData.conclusion?.text?.trim();
        if (!conclusionText) {
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
            id: threadId,
            summary: thread.title
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
      approvedCount: thread.approvedCount ?? 0,
      rejectedCount: thread.rejectedCount ?? 0,
      priority: thread.priority,
      pinned: thread.pinned
    };
  }, [thread]);

  const topLevelComments = useMemo(() => comments.filter(comment => !comment.parentId), [comments]);

  const repliesByParent = useMemo(() => {
    const grouped: Record<string, CommsComment[]> = {};
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
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link href="/admin/comms" className="text-sm font-semibold text-primary">
          ← Back to Plans & Issues
        </Link>
        {isOpen && thread ? (
          <button
            type="button"
            onClick={() => setProposeModalOpen(true)}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground"
          >
            Propose Conclusion
          </button>
        ) : null}
      </div>

      {loading ? (
        <AdminSectionCard>
          <p className="text-sm text-muted-foreground">Loading thread...</p>
        </AdminSectionCard>
      ) : loadError ? (
        <AdminSectionCard>
          <p className="text-sm text-destructive">{loadError}</p>
        </AdminSectionCard>
      ) : thread && threadMeta ? (
        <>
          <AdminSectionCard>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold text-foreground">{thread.title}</h1>
                  {(threadMeta.pinned || threadMeta.priority) && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {threadMeta.pinned ? "Pinned" : null}
                      {threadMeta.pinned && threadMeta.priority ? " • " : null}
                      {threadMeta.priority ? PRIORITY_LABELS[threadMeta.priority] || threadMeta.priority : null}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">{thread.body}</p>
                <p className="mt-3 text-xs text-muted-foreground">
                  Created {threadMeta.createdAt} by {threadMeta.createdBy}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase">
                <span
                  className={`rounded-full border px-2 py-0.5 ${
                    threadMeta.status === "open"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : threadMeta.status === "closing"
                        ? "border-amber-200 bg-amber-50 text-amber-700"
                      : "border-border bg-muted text-muted-foreground"
                  }`}
                >
                  {STATUS_LABELS[threadMeta.status] || threadMeta.status}
                </span>
                <span className="rounded-full border border-border bg-card px-2 py-0.5 text-muted-foreground">
                  {threadMeta.commentCount} comments
                </span>
              </div>
            </div>
            {(isClosing || isClosed) && thread.conclusion?.text ? (
              <div className="mt-4 rounded-xl border border-border bg-background px-4 py-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conclusion</p>
                    <p className="mt-2 text-sm text-foreground/80">{thread.conclusion.text}</p>
                    <p className="mt-2 text-xs text-muted-foreground">
                      Proposed {formatTimestamp(thread.conclusion.proposedAt)} by{" "}
                      {resolveActorName(thread.conclusion.proposedBy)}
                    </p>
                  </div>
                  {isClosing ? (
                    <div className="flex flex-wrap items-center gap-2 text-xs font-semibold uppercase">
                      <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-emerald-700">
                        {threadMeta.approvedCount} approve
                      </span>
                      <span className="rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-destructive">
                        {threadMeta.rejectedCount} reject
                      </span>
                    </div>
                  ) : null}
                </div>

                {isClosing ? (
                  <div className="mt-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => handleConclusionVote("approve")}
                        disabled={isVotingConclusion || conclusionVote === "approve"}
                        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                          conclusionVote === "approve"
                            ? "border border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border border-border text-muted-foreground hover:border-primary hover:text-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConclusionVote("reject")}
                        disabled={isVotingConclusion || conclusionVote === "reject"}
                        className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-wide transition ${
                          conclusionVote === "reject"
                            ? "border border-rose-200 bg-rose-50 text-destructive"
                            : "border border-border text-muted-foreground hover:border-primary hover:text-foreground"
                        } disabled:cursor-not-allowed disabled:opacity-60`}
                      >
                        Reject
                      </button>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleFinalizeClose}
                        disabled={isFinalizing}
                        className="rounded-full bg-slate-900 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isFinalizing ? "Finalizing..." : "Finalize Close"}
                      </button>
                      {conclusionVoteStatus ? (
                        <p className="text-xs text-muted-foreground">{conclusionVoteStatus}</p>
                      ) : null}
                      {finalizeStatus ? <p className="text-xs text-destructive">{finalizeStatus}</p> : null}
                    </div>
                  </div>
                ) : null}

                {isClosed ? (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Finalized {formatTimestamp(thread.finalizedAt)} by {resolveActorName(thread.finalizedBy)}
                  </p>
                ) : null}
              </div>
            ) : null}
          </AdminSectionCard>

          <div className="grid gap-6">
            <AdminSectionCard title="Discussion" description="Add context, replies, and lightweight likes.">
              {topLevelComments.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center">
                  <p className="text-sm text-muted-foreground">No comments yet.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {topLevelComments.map(comment => {
                    const replies = repliesByParent[comment.id] || [];
                    const likeCount = likeCounts[comment.id] ?? 0;
                    const liked = Boolean(likedComments[comment.id]);
                    return (
                      <div key={comment.id} className="space-y-2">
                        <div className="rounded-xl border border-border bg-background px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <p className="text-sm font-semibold text-foreground">
                              {resolveActorName(comment.createdBy)}
                            </p>
                            <span className="text-xs text-muted-foreground">
                              {formatTimestamp(comment.createdAt)}
                            </span>
                          </div>
                          <p className="mt-2 text-sm text-foreground/80">{comment.body}</p>
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                            <button
                              type="button"
                              onClick={() => handleToggleLike(comment.id)}
                              disabled={!isOpen || isLiking}
                              className={`rounded-full border px-3 py-1 transition ${
                                liked
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                              } disabled:cursor-not-allowed disabled:opacity-60`}
                            >
                              {liked ? "Liked" : "Like"} · {likeCount}
                            </button>
                            <button
                              type="button"
                              onClick={() => setReplyToId(comment.id)}
                              disabled={!isOpen}
                              className="rounded-full border border-border px-3 py-1 text-muted-foreground transition hover:border-primary hover:text-foreground disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              Reply
                            </button>
                          </div>
                        </div>
                        {replies.length > 0 ? (
                          <div className="space-y-2 pl-4">
                            {replies.map(reply => {
                              const replyLikeCount = likeCounts[reply.id] ?? 0;
                              const replyLiked = Boolean(likedComments[reply.id]);
                              return (
                                <div key={reply.id} className="rounded-xl border border-border bg-card px-4 py-3">
                                  <div className="flex items-start justify-between gap-3">
                                    <p className="text-sm font-semibold text-foreground">
                                      {resolveActorName(reply.createdBy)}
                                    </p>
                                    <span className="text-xs text-muted-foreground">
                                      {formatTimestamp(reply.createdAt)}
                                    </span>
                                  </div>
                                  <p className="mt-2 text-sm text-foreground/80">{reply.body}</p>
                                  <div className="mt-3 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-wide">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleLike(reply.id)}
                                      disabled={!isOpen || isLiking}
                                      className={`rounded-full border px-3 py-1 transition ${
                                        replyLiked
                                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                          : "border-border text-muted-foreground hover:border-primary hover:text-foreground"
                                      } disabled:cursor-not-allowed disabled:opacity-60`}
                                    >
                                      {replyLiked ? "Liked" : "Like"} · {replyLikeCount}
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="mt-4 space-y-2">
                {replyTarget ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Replying to {resolveActorName(replyTarget.createdBy)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setReplyToId(null)}
                      className="text-xs font-semibold text-muted-foreground hover:text-foreground"
                    >
                      Cancel reply
                    </button>
                  </div>
                ) : null}
                <label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  Add comment
                  <textarea
                    ref={commentInputRef}
                    value={commentBody}
                    onChange={event => setCommentBody(event.target.value)}
                    rows={3}
                    disabled={!isOpen}
                    className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden disabled:bg-muted"
                    placeholder={isOpen ? "Share feedback or a decision." : "Thread is not open for comments."}
                  />
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handlePostComment}
                    disabled={!isOpen || isPostingComment}
                    className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isPostingComment ? "Posting..." : "Post comment"}
                  </button>
                  {commentStatus ? <p className="text-sm text-muted-foreground">{commentStatus}</p> : null}
                  {likeStatus ? <p className="text-sm text-muted-foreground">{likeStatus}</p> : null}
                </div>
              </div>
            </AdminSectionCard>
          </div>
        </>
      ) : null}

      {proposeModalOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 py-8">
          <div className="w-full max-w-lg rounded-2xl bg-card p-6 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-foreground">Propose conclusion</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Proposing a conclusion moves the thread into the closing review stage.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setProposeModalOpen(false)}
                className="text-sm font-semibold text-muted-foreground hover:text-foreground/80"
              >
                Close
              </button>
            </div>
            <label className="mt-4 block text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Conclusion
              <textarea
                value={proposedConclusion}
                onChange={event => setProposedConclusion(event.target.value)}
                rows={4}
                className="mt-2 w-full rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
                placeholder="Summarize the decision or outcome."
              />
            </label>
            {proposeStatus ? <p className="mt-2 text-sm text-destructive">{proposeStatus}</p> : null}
            <div className="mt-4 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setProposeModalOpen(false)}
                className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleProposeConclusion}
                disabled={isProposing}
                className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isProposing ? "Proposing..." : "Propose conclusion"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatTimestamp(value?: { toDate?: () => Date } | null) {
  if (!value || typeof value?.toDate !== "function") return "Timestamp unavailable";
  return value.toDate().toLocaleString();
}
