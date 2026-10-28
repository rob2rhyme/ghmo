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
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Textarea } from "@/src/components/ui/textarea";
import { BODY_MAX, SUBJECT_MAX, type BroadcastStatus } from "@/src/lib/broadcast";

export type BroadcastSummary = { id: string; subject: string; status: BroadcastStatus; updatedAt?: string; createdByName?: string };

export const STATUS_BADGE: Record<BroadcastStatus, { label: string; variant: "secondary" | "warning" | "success" | "destructive" }> = {
  draft: { label: "Draft", variant: "secondary" },
  pending_approval: { label: "Waiting for approval", variant: "warning" },
  approved: { label: "Approved", variant: "success" },
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
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>New broadcast</CardTitle>
          <CardDescription>Plain text. Saving only creates a draft; nothing is sent.</CardDescription>
        </CardHeader>
        <form onSubmit={create} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="new-subject">Subject</Label>
            <Input id="new-subject" value={subject} onChange={e => setSubject(e.target.value)} maxLength={SUBJECT_MAX} required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="new-body">Message</Label>
            <Textarea id="new-body" rows={8} value={body} onChange={e => setBody(e.target.value)} maxLength={BODY_MAX} required />
          </div>
          <Button type="submit" loading={busy}>
            Save draft
          </Button>
        </form>
      </Card>

      {initial.length === 0 ? (
        <EmptyState icon={<Mail aria-hidden="true" />} title="No broadcasts yet" description="Your drafts and approved messages will be listed here." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {initial.map(item => {
            const badge = STATUS_BADGE[item.status] ?? STATUS_BADGE.draft;
            return (
              <li key={item.id}>
                <Link href={`/admin/broadcasts/${item.id}` as Route} className="flex items-center justify-between gap-3 p-3 hover:bg-accent/50">
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.subject}</span>
                    {item.createdByName ? <span className="block truncate text-xs text-muted-foreground">Started by {item.createdByName}</span> : null}
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
