"use client";

import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { Mail } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Textarea } from "@/src/components/ui/textarea";
import { BODY_MAX, SUBJECT_MAX, type BroadcastStatus } from "@/src/lib/broadcast";
import { formatShortDate } from "@/src/lib/format";
import { BroadcastSteps } from "./BroadcastSteps";

export type BroadcastSummary = { id: string; subject: string; status: BroadcastStatus; updatedAt?: string; createdByName?: string };

export const STATUS_BADGE: Record<BroadcastStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_approval: { label: "Waiting for approval", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
  sending: { label: "Sending", variant: "warning" },
  sent: { label: "Sent", variant: "success" },
  cancelled: { label: "Cancelled", variant: "destructive" }
};

export default function BroadcastsClient({ initial }: { initial: BroadcastSummary[] }) {
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

      <Card>
        <CardHeader>
          <CardTitle>New broadcast</CardTitle>
          <CardDescription>Plain text. Saving only creates a draft; nothing is sent.</CardDescription>
        </CardHeader>
        <form onSubmit={create} className="flex flex-col gap-4">
          <Field label="Subject">
            <Input id="new-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={SUBJECT_MAX} required placeholder="Dashain celebration on 12 October" />
          </Field>
          <Field label="Message">
            <Textarea
              id="new-body"
              rows={8}
              value={body}
              onChange={e => setBody(e.target.value)}
              maxLength={BODY_MAX}
              required
              placeholder={"Namaste everyone,\n\nJoin us for Dashain on Saturday 12 October, 5 pm at the community hall. Food and tika for all ages.\n\nGHMO board"}
            />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" loading={busy} className="max-sm:h-11 max-sm:w-full">
              Save draft
            </Button>
          </div>
        </form>
      </Card>

      {initial.length === 0 ? (
        <EmptyState
          icon={<Mail aria-hidden="true" />}
          title="No broadcasts yet"
          description="Write your first announcement above. It stays a draft until another admin approves it, and nothing is emailed before you press Send."
          action={
            <Button variant="outline" onClick={() => document.getElementById("new-subject")?.focus()}>
              Write a broadcast
            </Button>
          }
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card" aria-label="Broadcasts">
          {initial.map(item => {
            const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.draft;
            const meta = [item.createdByName ? `Started by ${item.createdByName}` : "", item.updatedAt ? `updated ${formatShortDate(item.updatedAt)}` : ""].filter(Boolean).join(" · ");
            return (
              <li key={item.id}>
                <Link href={`/admin/broadcasts/${item.id}` as Route} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-accent/50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.subject}</span>
                    {meta ? <span className="block truncate text-sm text-muted-foreground">{meta}</span> : null}
                  </span>
                  <Badge variant={badge.variant}>{badge.label}</Badge>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
