"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { BODY_MAX, SUBJECT_MAX, type BroadcastAction, type BroadcastStatus } from "@/src/lib/broadcast";
import { STATUS_BADGE } from "./BroadcastsClient";

export type BroadcastDetail = {
  id: string;
  subject: string;
  body: string;
  status: BroadcastStatus;
  contentHash: string;
  createdByUid: string;
  createdByName?: string;
  submittedByUid?: string | null;
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as { broadcast?: BroadcastDetail; recipientCount?: number; sentTo?: string };
}

export default function BroadcastDetailClient({
  initial,
  recipientCount: initialCount,
  uid,
  footer
}: {
  initial: BroadcastDetail;
  recipientCount: number;
  uid: string;
  footer: { orgName: string; postalAddress: string } | null;
}) {
  const [broadcast, setBroadcast] = useState(initial);
  const [count, setCount] = useState(initialCount);
  const [subject, setSubject] = useState(initial.subject);
  const [body, setBody] = useState(initial.body);
  const [busy, setBusy] = useState<string | null>(null);

  const editable = broadcast.status === "draft";
  const dirty = subject !== broadcast.subject || body !== broadcast.body;
  const badge = STATUS_BADGE[broadcast.status];
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={badge.variant}>{badge.label}</Badge>
        <span className="text-sm text-muted-foreground" aria-live="polite">
          Would go to {count} {count === 1 ? "member" : "members"} (active, agreed to email, not unsubscribed).
        </span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Message</CardTitle>
          <CardDescription>
            {editable
              ? "Plain text. Changing a submitted or approved message sends it back to draft, so what goes out is exactly what was approved."
              : "To change this message, withdraw it first. It goes back to draft and needs approval again."}
          </CardDescription>
        </CardHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="b-subject">Subject</Label>
            <Input id="b-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={SUBJECT_MAX} readOnly={!editable} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="b-body">Message</Label>
            <Textarea id="b-body" rows={10} value={body} onChange={e => setBody(e.target.value)} maxLength={BODY_MAX} readOnly={!editable} />
          </div>
          {editable ? (
            <Button onClick={save} loading={busy === "save"} disabled={!dirty}>
              Save draft
            </Button>
          ) : null}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>How it will look</CardTitle>
          <CardDescription>Every email ends with this footer, with a personal unsubscribe link.</CardDescription>
        </CardHeader>
        <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
          <p className="font-semibold">{broadcast.subject}</p>
          <p className="whitespace-pre-wrap">{broadcast.body}</p>
          <hr className="border-border" />
          {footer ? (
            <p className="whitespace-pre-wrap text-muted-foreground" data-testid="footer-preview">
              {`You get this email because you asked to hear from ${footer.orgName}.\nTo stop these emails, open: (a personal unsubscribe link)\n\n${footer.orgName}\n${footer.postalAddress}`}
            </p>
          ) : (
            <p className="text-warning" role="alert">
              The footer is not set up. Set BROADCAST_ORG_NAME and BROADCAST_POSTAL_ADDRESS before testing or sending.
            </p>
          )}
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Next step</CardTitle>
          <CardDescription>
            {broadcast.status === "draft" && "Send yourself a test, then submit it so another admin can approve it."}
            {broadcast.status === "pending_approval" &&
              (wroteIt ? "Waiting for another admin. You wrote or submitted this, so you can't approve it." : "Read the message above. Approving means you checked exactly this text.")}
            {broadcast.status === "approved" && "Approved by a second admin. Sending is switched on in a later step; nothing has been sent."}
            {broadcast.status === "cancelled" && "This broadcast was cancelled and can't be used."}
          </CardDescription>
        </CardHeader>
        <div className="flex flex-wrap gap-2">
          {broadcast.status !== "cancelled" ? (
            <Button variant="outline" onClick={test} loading={busy === "test"} disabled={dirty || !footer}>
              Send a test to me
            </Button>
          ) : null}
          {broadcast.status === "draft" ? (
            <Button onClick={() => act("submit", "Submitted for approval")} loading={busy === "submit"} disabled={dirty}>
              Submit for approval
            </Button>
          ) : null}
          {broadcast.status === "pending_approval" && !wroteIt ? (
            <Button onClick={() => act("approve", "Approved")} loading={busy === "approve"}>
              Approve this message
            </Button>
          ) : null}
          {broadcast.status === "pending_approval" || broadcast.status === "approved" ? (
            <Button variant="outline" onClick={() => act("withdraw", "Withdrawn to draft")} loading={busy === "withdraw"}>
              Withdraw to edit
            </Button>
          ) : null}
          {broadcast.status !== "cancelled" ? (
            <Button variant="ghost" onClick={() => act("cancel", "Cancelled")} loading={busy === "cancel"}>
              Cancel broadcast
            </Button>
          ) : null}
        </div>
      </Card>
    </div>
  );
}
