"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { addDoc, collection, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { firestore, firebaseInitError } from "@/src/lib/firebaseClient";
import { resolveActorName } from "@/src/lib/actor";
import type { CommsActorSnapshot } from "@/src/lib/comms";

type AdminChatClientProps = {
  actor: CommsActorSnapshot;
};

type AdminChatMessage = {
  id: string;
  body: string;
  createdAt?: { toDate?: () => Date } | null;
  createdBy?: CommsActorSnapshot;
};

export default function AdminChatClient({ actor }: AdminChatClientProps) {
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [body, setBody] = useState("");
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!firestore) {
      setLoadError(firebaseInitError || "Firebase is not configured.");
      setLoading(false);
      return;
    }
    const chatQuery = query(
      collection(firestore, "organizations", "ghmo", "adminChatMessages"),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(
      chatQuery,
      snapshot => {
        const nextMessages = snapshot.docs.map(doc => ({
          id: doc.id,
          ...(doc.data() as Omit<AdminChatMessage, "id">)
        }));
        setMessages(nextMessages);
        setLoading(false);
      },
      error => {
        setLoadError(error.message || "Unable to load chat");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const lastMessageCount = useMemo(() => messages.length, [messages]);

  useEffect(() => {
    if (!lastMessageCount) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastMessageCount]);

  const handleSend = async () => {
    if (!firestore) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setSendStatus("Message cannot be empty.");
      return;
    }
    if (isSending) return;
    setIsSending(true);
    setSendStatus(null);
    try {
      await addDoc(collection(firestore, "organizations", "ghmo", "adminChatMessages"), {
        body: trimmed,
        createdAt: serverTimestamp(),
        createdBy: actor
      });
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "admin_chat_message_sent",
          resource: {
            type: "admin_chat",
            summary: trimmed.slice(0, 80)
          }
        })
      });
      setBody("");
    } catch (error: any) {
      setSendStatus(error.message || "Unable to send message");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      <AdminSectionCard
        title="Admin Chat"
        description="Admin Chat: for quick coordination."
      >
        <p className="text-sm text-muted-foreground">
          Use this channel for quick updates, reminders, and coordination. Formal decisions belong in Plans & Issues.
        </p>
      </AdminSectionCard>

      <AdminSectionCard>
        <div className="flex h-[60vh] flex-col rounded-2xl border border-border bg-background">
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">Loading messages...</p>
            ) : loadError ? (
              <p className="text-sm text-destructive">{loadError}</p>
            ) : messages.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border bg-card px-4 py-6 text-center">
                <p className="text-sm text-muted-foreground">No messages yet.</p>
              </div>
            ) : (
              messages.map(message => (
                <div
                  key={message.id}
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-xs ${
                    message.createdBy?.uid === actor.uid
                      ? "ml-auto bg-primary text-white"
                      : "bg-card text-foreground"
                  }`}
                >
                  <p className="text-xs font-semibold uppercase tracking-wide opacity-70">
                    {resolveActorName(message.createdBy)}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap">{message.body}</p>
                  <p className="mt-2 text-[11px] opacity-70">
                    {formatTimestamp(message.createdAt)}
                  </p>
                </div>
              ))
            )}
            <div ref={endRef} />
          </div>
          <div className="border-t border-border bg-card px-4 py-3">
            <div className="flex flex-wrap items-end gap-2">
              <textarea
                value={body}
                onChange={event => setBody(event.target.value)}
                rows={2}
                className="flex-1 rounded-xl border border-border px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-hidden"
                placeholder="Share an update or ask for help..."
              />
              <button
                type="button"
                onClick={handleSend}
                disabled={isSending}
                className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {isSending ? "Sending..." : "Send"}
              </button>
            </div>
            {sendStatus ? <p className="mt-2 text-sm text-muted-foreground">{sendStatus}</p> : null}
          </div>
        </div>
      </AdminSectionCard>
    </div>
  );
}

function formatTimestamp(value?: { toDate?: () => Date } | null) {
  if (!value || typeof value?.toDate !== "function") return "Timestamp unavailable";
  return value.toDate().toLocaleString();
}
