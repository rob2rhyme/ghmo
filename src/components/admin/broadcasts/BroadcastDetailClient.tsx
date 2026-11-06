"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { ProgressBar } from "@/src/components/ui/stat";
import { Textarea } from "@/src/components/ui/textarea";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Copy, MailWarning, MessageCircle } from "lucide-react";
import {
  BODY_MAX,
  MANUAL_CHANNELS,
  MANUAL_CHANNEL_LABELS,
  SUBJECT_MAX,
  messengerText,
  type BroadcastAction,
  type BroadcastStatus,
  type ManualChannel
} from "@/src/lib/broadcast.shared";
import { formatDateTime } from "@/src/lib/format";
import { statusBadge } from "@/src/lib/statusBadges";
import { BroadcastSteps } from "./BroadcastSteps";

/** Where the broadcast is in Write → Approve → Send (3 = all done). */
const STEP_OF: Partial<Record<BroadcastStatus, 0 | 1 | 2 | 3>> = { draft: 0, pending_approval: 1, approved: 2, sending: 2, sent: 3 };

export type SendProgress = {
  status: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  remaining: number;
  done: boolean;
  paused?: { reason: "quota"; resumesAt: string };
};

export type BroadcastDetail = {
  id: string;
  subject: string;
  body: string;
  status: BroadcastStatus;
  contentHash: string;
  createdByUid: string;
  createdByName?: string;
  submittedByUid?: string | null;
  approvedHash?: string | null;
  /** Hand posts to the Messenger group chats (plan §12, 9-D); dates arrive as epoch milliseconds. */
  manualPosts?: { channel: ManualChannel; at: number; byUid: string; byName: string }[];
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as { broadcast?: BroadcastDetail; recipientCount?: number; sentTo?: string; progress?: SendProgress };
}

export default function BroadcastDetailClient({
  initial,
  recipientCount: initialCount,
  uid,
  footer,
  initialProgress = null,
  sendingBlocker = null
}: {
  initial: BroadcastDetail;
  recipientCount: number;
  uid: string;
  footer: { orgName: string; postalAddress: string } | null;
  initialProgress?: SendProgress | null;
  sendingBlocker?: string | null;
}) {
  const [broadcast, setBroadcast] = useState(initial);
  const [count, setCount] = useState(initialCount);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<SendProgress | null>(initialProgress);
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const stopRef = useRef(false);

  const editable = broadcast.status === "draft";
  const dirty = subject !== broadcast.subject || body !== broadcast.body;
  const badge = statusBadge("broadcast", broadcast.status);
  const wroteIt = broadcast.createdByUid === uid || broadcast.submittedByUid === uid;

  const run = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    try {
      await task();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong");
    } finally {
      setBusy(null);
    }
  };

  const apply = (data: Awaited<ReturnType<typeof send>>) => {
    if (data.broadcast) {
      setBroadcast(data.broadcast);
      setSubject(data.broadcast.subject);
      setBody(data.broadcast.body);
    }
    if (typeof data.recipientCount === "number") setCount(data.recipientCount);
  };

  const save = () =>
    run("save", async () => {
      apply(await send(`/api/admin/broadcasts/${broadcast.id}`, "PATCH", { subject, body }));
      toast.success("Draft saved");
    });

  const act = (action: BroadcastAction, message: string) =>
    run(action, async () => {
      apply(await send(`/api/admin/broadcasts/${broadcast.id}`, "PATCH", { action, ...(action === "approve" ? { contentHash: broadcast.contentHash } : {}) }));
      toast.success(message);
    });

  const test = () =>
    run("test", async () => {
      const data = await send(`/api/admin/broadcasts/${broadcast.id}/test`, "POST");
      toast.success(`Test sent to ${data.sentTo}`);
    });

  /** Calls the server one chunk at a time until done, paused by the daily limit, stopped, or failing. */
  const loop = useCallback(async () => {
    stopRef.current = false;
    setRunning(true);
    setSendError(null);
    try {
      for (;;) {
        if (stopRef.current) break;
        const data = await send(`/api/admin/broadcasts/${broadcast.id}/send`, "POST", { step: "chunk" });
        if (data.progress) {
          setProgress(data.progress);
          if (data.progress.done) {
            setBroadcast(current => ({ ...current, status: "sent" }));
            toast.success("Broadcast sent");
            break;
          }
          if (data.progress.paused) break;
        }
      }
    } catch (error) {
      setSendError(error instanceof Error ? error.message : "Sending stopped");
    } finally {
      setRunning(false);
    }
  }, [broadcast.id]);

  useEffect(() => () => {
    stopRef.current = true;
  }, []);

  const startSending = () =>
    run("start", async () => {
      const data = await send(`/api/admin/broadcasts/${broadcast.id}/send`, "POST", { step: "start" });
      setConfirming(false);
      if (data.progress) setProgress(data.progress);
      setBroadcast(current => ({ ...current, status: "sending" }));
      void loop();
    });

  const retry = () =>
    run("retry", async () => {
      const data = await send(`/api/admin/broadcasts/${broadcast.id}/send`, "POST", { step: "retryFailed" });
      if (data.progress) setProgress(data.progress);
      setBroadcast(current => ({ ...current, status: "sending" }));
      void loop();
    });

  const step = STEP_OF[broadcast.status];
  const members = (n: number) => `${n} ${n === 1 ? "member" : "members"}`;
  const canCancel = broadcast.status !== "cancelled" && broadcast.status !== "sent" && !running;

  return (
    <div className="flex flex-col gap-6">
      {step !== undefined ? <BroadcastSteps current={step} /> : null}

      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="text-sm text-muted-foreground" aria-live="polite">
            Would go to {members(count)} (active, agreed to email, not unsubscribed).
          </span>
        </div>
        {count === 0 && broadcast.status !== "sent" && broadcast.status !== "cancelled" ? (
          <Alert variant="warning">
            <MailWarning />
            <AlertTitle>Nobody can be emailed yet</AlertTitle>
            <AlertDescription>
              No member has agreed to email yet.{" "}
              <Link href="/admin/members" className="font-semibold text-foreground underline underline-offset-2">
                Open Members
              </Link>{" "}
              to record who agreed. You can still post it to the group chats once it is approved.
            </AlertDescription>
          </Alert>
        ) : null}
      </div>

      <AdminSectionCard
        title="Message"
        description={
          editable
            ? "Plain text. Changing a submitted or approved message sends it back to draft, so what goes out is exactly what was approved."
            : "To change this message, withdraw it first. It goes back to draft and needs approval again."
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Subject">
            <Input id="b-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={SUBJECT_MAX} readOnly={!editable} placeholder="A short subject line" />
          </Field>
          <Field label="Message">
            <Textarea id="b-body" rows={10} value={body} onChange={e => setBody(e.target.value)} maxLength={BODY_MAX} readOnly={!editable} />
          </Field>
          {editable ? (
            <div className="flex flex-wrap gap-2">
              <Button onClick={save} loading={busy === "save"} disabled={!dirty} variant={dirty ? "default" : "outline"} className="max-sm:h-11">
                Save draft
              </Button>
            </div>
          ) : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard title="How it will look" description="Every email ends with this footer, with a personal unsubscribe link.">
        <div className="flex flex-col gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">{broadcast.subject}</p>
          <p className="whitespace-pre-wrap">{broadcast.body}</p>
          <hr className="border-border" />
          {footer ? (
            <p className="whitespace-pre-wrap text-muted-foreground" data-testid="footer-preview">
              {`You get this email because you asked to hear from ${footer.orgName}.\nTo stop these emails, open: (a personal unsubscribe link)\n\n${footer.orgName}\n${footer.postalAddress}`}
            </p>
          ) : (
            <Alert variant="warning">
              <MailWarning />
              <AlertTitle>The email footer isn&apos;t set up yet</AlertTitle>
              <AlertDescription>
                Every email must end with it, so tests and sending are off until then. Ask whoever manages the website to add the organization&apos;s name and postal
                address.
              </AlertDescription>
            </Alert>
          )}
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title="Next step"
        description={
          <>
            {broadcast.status === "draft" && "Send yourself a test, then submit it so another admin can approve it."}
            {broadcast.status === "pending_approval" &&
              (wroteIt ? "Waiting for another admin. You wrote or submitted this, so you can't approve it." : "Read the message above. Approving means you checked exactly this text.")}
            {broadcast.status === "approved" &&
              (sendingBlocker ? `Approved by a second admin. It can't be sent yet. ${sendingBlocker}` : `Approved by a second admin. Ready to send to ${members(count)}.`)}
            {broadcast.status === "sending" && "Sending in small batches. Keep this page open; if you close it, sending pauses and you (or another admin) can resume here."}
            {broadcast.status === "sent" && "Sent. Each member got their own copy with a personal unsubscribe link."}
            {broadcast.status === "cancelled" && "This broadcast was canceled and can't be used."}
          </>
        }
      >
        {progress && (broadcast.status === "sending" || broadcast.status === "sent") ? (
          <div className="flex flex-col gap-2" aria-live="polite">
            <ProgressBar value={progress.total - progress.remaining} max={progress.total} label="Sending progress" />
            <p className="text-sm" data-testid="send-progress">
              {progress.sent} sent · {progress.skipped} skipped · {progress.failed} failed · {progress.remaining} to go (of {progress.total})
            </p>
            {progress.paused ? (
              <p className="text-sm text-muted-foreground" role="status">
                Today&apos;s sending limit is used up. Continue after {formatDateTime(progress.paused.resumesAt)}.
              </p>
            ) : null}
            {sendError ? (
              <p className="text-sm text-destructive" role="alert">
                {sendError}
              </p>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {broadcast.status === "approved" ? (
            <Button onClick={() => setConfirming(true)} disabled={Boolean(sendingBlocker) || count === 0}>
              Send to {members(count)}…
            </Button>
          ) : null}
          {broadcast.status === "sending" && !running ? (
            <Button onClick={() => void loop()} disabled={Boolean(sendingBlocker)}>
              Resume sending
            </Button>
          ) : null}
          {broadcast.status === "sending" && running ? (
            <Button variant="outline" onClick={() => (stopRef.current = true)}>
              Pause
            </Button>
          ) : null}
          {broadcast.status === "draft" ? (
            <Button onClick={() => act("submit", "Submitted for approval")} loading={busy === "submit"} disabled={dirty} title={dirty ? "Save your changes first." : undefined}>
              Submit for approval
            </Button>
          ) : null}
          {broadcast.status === "pending_approval" && !wroteIt ? (
            <Button onClick={() => act("approve", "Approved")} loading={busy === "approve"}>
              Approve this message
            </Button>
          ) : null}
          {(broadcast.status === "sending" || broadcast.status === "sent") && progress && progress.failed > 0 && !running ? (
            <Button variant="outline" onClick={retry} loading={busy === "retry"}>
              Retry {progress.failed} failed
            </Button>
          ) : null}
          {broadcast.status === "draft" || broadcast.status === "pending_approval" || broadcast.status === "approved" ? (
            <Button variant="outline" onClick={test} loading={busy === "test"} disabled={dirty || !footer} title={dirty ? "Save your changes first." : !footer ? "The email footer isn't set up yet." : undefined}>
              Send a test to me
            </Button>
          ) : null}
          {broadcast.status === "pending_approval" || broadcast.status === "approved" ? (
            <Button variant="outline" onClick={() => act("withdraw", "Withdrawn to draft")} loading={busy === "withdraw"}>
              Withdraw to edit
            </Button>
          ) : null}
        </div>
        {canCancel ? (
          <div className="border-t border-border pt-4">
            <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => setCancelling(true)} disabled={busy === "cancel"}>
              Cancel broadcast…
            </Button>
          </div>
        ) : null}
      </AdminSectionCard>

      {broadcast.status === "approved" || broadcast.status === "sending" || broadcast.status === "sent" ? <MessengerCard broadcast={broadcast} onRecorded={setBroadcast} /> : null}

      <ConfirmDialog
        open={confirming && broadcast.status === "approved"}
        onOpenChange={setConfirming}
        title={`Send to ${members(count)} now?`}
        description="Each member gets their own email with a personal unsubscribe link. Once sending starts it can be paused, but emails already sent can't be taken back."
        confirmLabel="Yes, send it now"
        cancelLabel="Not yet"
        busy={busy === "start"}
        onConfirm={startSending}
      />
      <ConfirmDialog
        open={cancelling}
        onOpenChange={setCancelling}
        destructive
        title="Cancel this broadcast?"
        description="It can't be edited, approved or sent after this. To send the same message later, write a new broadcast."
        confirmLabel="Cancel broadcast"
        cancelLabel="Keep it"
        busy={busy === "cancel"}
        onConfirm={async () => {
          await act("cancel", "Canceled");
          setCancelling(false);
        }}
      />
    </div>
  );
}

/**
 * The approved text for the Messenger group chats (decision D14: no Messenger integration). The admin
 * copies it, pastes it into the chat themselves, and records where, so the audit trail covers the chats.
 */
function MessengerCard({ broadcast, onRecorded }: { broadcast: BroadcastDetail; onRecorded: (b: BroadcastDetail) => void }) {
  const text = messengerText({ subject: broadcast.subject, body: broadcast.body });
  const [busy, setBusy] = useState<ManualChannel | null>(null);
  const posts = [...(broadcast.manualPosts ?? [])].sort((a, b) => b.at - a.at);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied. Paste it into the group chat.");
    } catch {
      const area = document.getElementById("b-messenger") as HTMLTextAreaElement | null;
      area?.focus();
      area?.select();
      toast.info("Select all and copy the text below.");
    }
  };

  const record = async (channel: ManualChannel) => {
    setBusy(channel);
    try {
      const data = await send(`/api/admin/broadcasts/${broadcast.id}/manual-post`, "POST", { channel, contentHash: broadcast.contentHash });
      if (data.broadcast) onRecorded(data.broadcast);
      toast.success(`Recorded: posted to the ${MANUAL_CHANNEL_LABELS[channel]}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not record it");
    } finally {
      setBusy(null);
    }
  };

  return (
    <AdminSectionCard
      title="Post to the Messenger group chats"
      icon={<MessageCircle aria-hidden="true" />}
      description="The site doesn't connect to Messenger. Copy the approved text, paste it into the group chat, then record where you posted it."
    >
      <div className="flex flex-col gap-3">
        <Label htmlFor="b-messenger" className="sr-only">
          Text for Messenger
        </Label>
        <Textarea id="b-messenger" rows={Math.min(12, text.split("\n").length + 1)} value={text} readOnly />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={copy}>
            <Copy aria-hidden="true" className="size-4" /> Copy text
          </Button>
          {MANUAL_CHANNELS.map(channel => (
            <Button key={channel} variant="outline" loading={busy === channel} onClick={() => record(channel)}>
              I posted it in the {MANUAL_CHANNEL_LABELS[channel]}
            </Button>
          ))}
        </div>
        {posts.length > 0 ? (
          <ul className="space-y-1 text-sm" aria-label="Posted to group chats">
            {posts.map(post => (
              <li key={`${post.channel}-${post.at}-${post.byUid}`}>
                {post.byName} posted it in the {MANUAL_CHANNEL_LABELS[post.channel]} · {formatDateTime(post.at)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">Not recorded in any group chat yet.</p>
        )}
      </div>
    </AdminSectionCard>
  );
}
