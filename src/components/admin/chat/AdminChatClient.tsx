"use client";

import { notifyActivity } from "@/src/lib/notifyClient";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { collection, doc, onSnapshot, orderBy, query, serverTimestamp, setDoc } from "firebase/firestore";
import { MessageCircle, SendHorizontal } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { formatDateTime } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { firestore, firebaseInitError } from "@/src/lib/firebaseClient";
import { resolveActorName } from "@/src/lib/actor";
import { useE2ee, type Unpacked } from "@/src/lib/e2ee/client/E2eeProvider";
import type { CommsActorSnapshot } from "@/src/lib/comms";

type AdminChatClientProps = {
  actor: CommsActorSnapshot;
};

type AdminChatMessage = Unpacked<{
  id: string;
  body: string;
  createdAt?: { toDate?: () => Date } | null;
  createdBy?: CommsActorSnapshot;
}>;

const CHAT_PATH = "organizations/ghmo/adminChatMessages";

export default function AdminChatClient({ actor }: AdminChatClientProps) {
  const [messages, setMessages] = useState<AdminChatMessage[]>([]);
  const [loading, setLoading] = useState(() => Boolean(firestore));
  const [loadError, setLoadError] = useState<string | null>(() => (firestore ? null : firebaseInitError || "Firebase is not configured."));
  const [body, setBody] = useState("");
  const [sendStatus, setSendStatus] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const endRef = useRef<HTMLDivElement | null>(null);
  const { packPrivate, unpackPrivate, status } = useE2ee();
  // Messages are unlocked as snapshots arrive; unlocking later re-reads them.
  const canRead = status === "unlocked" || status === "not-setup";
  const latestDocs = useRef<{ id: string; data: Record<string, unknown> }[]>([]);

  const decryptAll = useCallback(async () => {
    const decoded = await Promise.all(
      latestDocs.current.map(d =>
        unpackPrivate<Omit<AdminChatMessage, "id" | "_e2ee" | "_e2eeError">>(d.data, { path: CHAT_PATH, docId: d.id }).then(m => ({ id: d.id, ...m }) as AdminChatMessage)
      )
    );
    setMessages(decoded);
    setLoading(false);
  }, [unpackPrivate]);

  useEffect(() => {
    if (canRead) void decryptAll();
  }, [canRead, decryptAll]);

  useEffect(() => {
    if (!firestore) return;
    const chatQuery = query(
      collection(firestore, "organizations", "ghmo", "adminChatMessages"),
      orderBy("createdAt", "asc")
    );
    const unsubscribe = onSnapshot(
      chatQuery,
      snapshot => {
        latestDocs.current = snapshot.docs.map(doc => ({ id: doc.id, data: doc.data() as Record<string, unknown> }));
        void decryptAll();
      },
      error => {
        setLoadError(error.message || "The connection failed.");
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, [decryptAll, attempt]);

  const lastMessageCount = useMemo(() => messages.length, [messages]);

  useEffect(() => {
    if (!lastMessageCount) return;
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [lastMessageCount]);

  const handleSend = async () => {
    if (!firestore) return;
    const trimmed = body.trim();
    if (!trimmed) {
      setSendStatus("Write a message first.");
      return;
    }
    if (isSending) return;
    setIsSending(true);
    setSendStatus(null);
    try {
      // The document ID is chosen first because the ciphertext is bound to it.
      const messageRef = doc(collection(firestore, "organizations", "ghmo", "adminChatMessages"));
      const privateFields = await packPrivate({ path: CHAT_PATH, docId: messageRef.id }, { body: trimmed });
      await setDoc(messageRef, {
        ...privateFields,
        createdAt: serverTimestamp(),
        createdBy: { uid: actor.uid, name: actor.name }
      });
      notifyActivity("chat");
      void fetch("/api/admin/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "admin_chat_message_sent", resource: { type: "admin_chat", id: messageRef.id } })
      });
      setBody("");
    } catch (error) {
      setSendStatus(`Couldn't send the message. ${(error instanceof Error && error.message) || "Check your connection and try again."}`);
    } finally {
      setIsSending(false);
    }
  };

  return (
    // Fills the rest of the page's full-height column (see app/(admin)/admin/chat/page.tsx), whatever sits above it.
    <section aria-label="Chat messages" data-fill className="flex min-h-64 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto bg-muted/30 px-3 py-4 sm:px-4">
        {loading ? (
          <div role="status" className="flex flex-col gap-3">
            <span className="sr-only">Loading messages…</span>
            <Skeleton className="h-16 w-3/4 rounded-xl" />
            <Skeleton className="ml-auto h-12 w-2/3 rounded-xl" />
            <Skeleton className="h-16 w-1/2 rounded-xl" />
          </div>
        ) : loadError ? (
          <Alert variant="destructive">
            <AlertTitle>Couldn&apos;t load the chat</AlertTitle>
            <AlertDescription className="flex flex-col items-start gap-3">
              <span>{loadError}</span>
              {firestore ? (
                <Button
                  variant="outline"
                  size="row"
                  onClick={() => {
                    setLoadError(null);
                    setLoading(true);
                    setAttempt(n => n + 1);
                  }}
                >
                  Try again
                </Button>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : messages.length === 0 ? (
          <EmptyState
            icon={<MessageCircle aria-hidden="true" />}
            title="No messages yet"
            description="Say hello, or share a quick update with the other admins below."
            className="my-auto border-none"
          />
        ) : (
          messages.map(message => {
            const mine = message.createdBy?.uid === actor.uid;
            return (
              <div
                key={message.id}
                className={cn(
                  "max-w-[85%] rounded-xl px-4 py-2.5 text-sm shadow-xs",
                  mine ? "ml-auto bg-primary text-primary-foreground" : "border border-border bg-card text-foreground"
                )}
              >
                <p className={cn("text-sm", mine ? "text-primary-foreground/80" : "text-muted-foreground")}>
                  <span className="font-semibold">{mine ? "You" : resolveActorName(message.createdBy)}</span> · {formatTimestamp(message.createdAt)}
                </p>
                {message._e2ee === "failed" ? (
                  <p className="mt-1 italic opacity-80">This message can&apos;t be opened on this device.</p>
                ) : (
                  <p className="mt-1 break-words whitespace-pre-wrap">{message.body}</p>
                )}
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>
      <div className="border-t border-border bg-card p-3">
        <div className="flex items-end gap-2">
          <Textarea
            aria-label="Message"
            value={body}
            onChange={event => setBody(event.target.value)}
            rows={2}
            className="min-h-11 min-w-0 flex-1 resize-none"
            placeholder="Share an update or ask for help..."
          />
          <Button type="button" size="lg" onClick={handleSend} disabled={isSending} className="px-4">
            <SendHorizontal aria-hidden="true" />
            {isSending ? "Sending…" : "Send"}
          </Button>
        </div>
        {sendStatus ? (
          <p role="status" className="mt-2 text-sm text-destructive">
            {sendStatus}
          </p>
        ) : null}
      </div>
    </section>
  );
}

function formatTimestamp(value?: { toDate?: () => Date } | null) {
  return formatDateTime(value) || "sending…";
}
