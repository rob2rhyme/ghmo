"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Mail, MailWarning } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { BODY_MAX, SUBJECT_MAX, type BroadcastStatus } from "@/src/lib/broadcast.shared";
import { formatShortDate } from "@/src/lib/format";
import { statusBadge } from "@/src/lib/statusBadges";
import { BroadcastSteps } from "./BroadcastSteps";

export type BroadcastSummary = { id: string; subject: string; status: BroadcastStatus; updatedAt?: string; createdByName?: string };

export default function BroadcastsClient({
  initial,
  recipientCount = null,
  emailProblem = null
}: {
  initial: BroadcastSummary[];
  /** Members a broadcast would reach now; null when it couldn't be counted. */
  recipientCount?: number | null;
  /** Why email can't go out yet (plain words), or null when sending is set up. */
  emailProblem?: string | null;
}) {
  const router = useRouter();
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/admin/broadcasts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ subject, body }) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save the draft");
      router.push(`/admin/broadcasts/${data.broadcast.id}` as Route);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save the draft");
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <BroadcastSteps />

      <EmailReadiness recipientCount={recipientCount} emailProblem={emailProblem} />

      <AdminSectionCard title="New broadcast" description="Plain text. Saving only creates a draft; nothing is sent.">
        <form onSubmit={create} className="flex flex-col gap-4">
          <Field label="Subject" description="For example: Dashain celebration on October 12">
            <Input id="new-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={SUBJECT_MAX} required placeholder="A short subject line" />
          </Field>
          <Field label="Message" description="For example: Namaste everyone, join us for Dashain on Saturday, October 12, 5 pm at the community hall. Food and tika for all ages. GHMO board">
            <Textarea
              id="new-body"
              rows={8}
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={BODY_MAX}
              required
              placeholder="Write the announcement"
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} className="max-sm:h-11">
              Save draft
            </Button>
          </div>
        </form>
      </AdminSectionCard>

      {initial.length === 0 ? (
        <EmptyState
          icon={<Mail aria-hidden="true" />}
          title="No broadcasts yet"
          description="Your first announcement, written above, shows here. It stays a draft until another admin approves it, and nothing is emailed before you press Send."
        />
      ) : (
        <AdminList label="Broadcasts">
          {initial.map(item => {
            const badge = statusBadge("broadcast", item.status);
            const meta = [item.createdByName ? `Started by ${item.createdByName}` : "", item.updatedAt ? `updated ${formatShortDate(item.updatedAt)}` : ""].filter(Boolean).join(" · ");
            return (
              <AdminListRow
                key={item.id}
                href={`/admin/broadcasts/${item.id}` as Route}
                title={item.subject}
                meta={meta || undefined}
                badges={<Badge variant={badge.variant}>{badge.label}</Badge>}
              />
            );
          })}
        </AdminList>
      )}
    </div>
  );
}

/**
 * Day-one guidance (Audit 2, S10): says before anyone writes a draft that nobody can be emailed yet
 * and/or that email sending isn't set up. Drafts and the group-chat copy still work either way.
 */
function EmailReadiness({ recipientCount, emailProblem }: { recipientCount: number | null; emailProblem: string | null }) {
  const nobody = recipientCount === 0;
  if (recipientCount === null && !emailProblem) {
    return (
      <p className="text-sm text-muted-foreground">
        Before your first broadcast, check that members have agreed to email on{" "}
        <Link href="/admin/members" className="font-medium text-foreground underline underline-offset-2">
          Members
        </Link>
        .
      </p>
    );
  }
  if (!nobody && !emailProblem) return null;
  return (
    <Alert variant="warning">
      <MailWarning />
      <AlertTitle>
        {nobody && emailProblem ? "Nobody can be emailed yet, and email sending isn't set up" : nobody ? "Nobody can be emailed yet" : "Email sending isn't set up yet"}
      </AlertTitle>
      <AlertDescription className="flex flex-col gap-1">
        {nobody ? (
          <span>
            No member has agreed to email yet.{" "}
            <Link href="/admin/members" className="font-semibold text-foreground underline underline-offset-2">
              Open Members
            </Link>{" "}
            to record who agreed.
          </span>
        ) : null}
        {emailProblem ? <span>{emailProblem}</span> : null}
        {recipientCount === null ? (
          <span>
            Before your first broadcast, check that members have agreed to email on{" "}
            <Link href="/admin/members" className="font-semibold text-foreground underline underline-offset-2">
              Members
            </Link>
            .
          </span>
        ) : null}
        <span>You can still write drafts, get them approved and post them to the group chats.</span>
      </AlertDescription>
    </Alert>
  );
}
