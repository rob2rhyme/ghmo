"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Input } from "@/src/components/ui/input";
import { Label } from "@/src/components/ui/label";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { campaignScriptLoc, normalizeTitle } from "@/src/lib/callCampaigns";
import { api, formatDay, newId, type CampaignView } from "./campaignShared";

type EventLite = { id: string; title: string; status?: string };

export default function CallCampaignsClient() {
  return (
    <EncryptionGate what="Call campaigns">
      <Campaigns />
    </EncryptionGate>
  );
}

function Campaigns() {
  const { encrypt, status } = useE2ee();
  const [campaigns, setCampaigns] = useState<CampaignView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [script, setScript] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAll = () =>
    Promise.all([
      api<{ campaigns: CampaignView[] }>("/api/admin/call-campaigns"),
      api<{ events?: EventLite[] }>("/api/organizations/ghmo/events?status=all").catch(() => ({ events: [] as EventLite[] }))
    ]);
  const load = () =>
    fetchAll()
      .then(([list, ev]) => {
        setCampaigns(list.campaigns);
        setEvents(Array.isArray(ev.events) ? ev.events : []);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load campaigns"));
  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([list, ev]) => {
        if (cancelled) return;
        setCampaigns(list.campaigns);
        setEvents(Array.isArray(ev.events) ? ev.events : []);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load campaigns");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const pickEvent = (id: string) => {
    setEventId(id);
    const event = events.find(e => e.id === id);
    if (event && !title.trim()) setTitle(event.title);
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const clean = normalizeTitle(title);
      if (!clean) throw new Error("Give the campaign a title.");
      const id = newId();
      const body: Record<string, unknown> = { id, title: clean, eventId: eventId || null, dueAt: dueAt ? new Date(`${dueAt}T23:59:00`).toISOString() : null };
      if (script.trim()) {
        if (status !== "unlocked") throw new Error("Unlock this device to save the script.");
        body.script = await encrypt(campaignScriptLoc(id), { script: script.trim() });
      }
      const { campaign } = await api<{ campaign: CampaignView }>("/api/admin/call-campaigns", { method: "POST", body: JSON.stringify(body) });
      toast.success(`Campaign opened: ${campaign.counts.total} people to call`);
      setTitle("");
      setEventId("");
      setDueAt("");
      setScript("");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not open the campaign");
    } finally {
      setCreating(false);
    }
  };

  if (error) return <EmptyState icon={<Megaphone aria-hidden="true" />} title="Could not load campaigns" description={error} action={<Button onClick={load}>Try again</Button>} />;
  if (!campaigns) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading campaigns…</span>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone aria-hidden="true" className="size-5" /> Open a campaign
          </CardTitle>
          <CardDescription>
            The current calling tree is copied into the campaign, so every callable person gets exactly one caller. The script is encrypted in this browser;
            callers read it on their own devices.
          </CardDescription>
        </CardHeader>
        <form onSubmit={create} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="campaign-event">Event (optional)</Label>
              <select id="campaign-event" className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm" value={eventId} onChange={e => pickEvent(e.target.value)}>
                <option value="">No event</option>
                {events.map(event => (
                  <option key={event.id} value={event.id}>
                    {event.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="campaign-due">Calls done by (optional)</Label>
              <Input id="campaign-due" type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-title">Title</Label>
            <Input id="campaign-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={150} required placeholder="General meeting, 15 November" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="campaign-script">Script and agenda (optional, encrypted)</Label>
            <Textarea id="campaign-script" rows={5} value={script} onChange={e => setScript(e.target.value)} maxLength={5000} placeholder="What to say: date, place, agenda items, what to ask." />
          </div>
          <Button type="submit" loading={creating}>
            Open campaign
          </Button>
        </form>
      </Card>

      {campaigns.length === 0 ? (
        <EmptyState icon={<Megaphone aria-hidden="true" />} title="No campaigns yet" description="Open one above once the calling tree is planned." />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Campaigns">
          {campaigns.map(campaign => {
            const pct = campaign.counts.total ? Math.round((campaign.counts.reached / campaign.counts.total) * 100) : 0;
            return (
              <li key={campaign.id}>
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between gap-2 text-base">
                      <Link href={`/admin/call-campaigns/${campaign.id}` as Route} className="underline-offset-4 hover:underline">
                        {campaign.title}
                      </Link>
                      <Badge variant={campaign.status === "open" ? "success" : "secondary"}>{campaign.status === "open" ? "Open" : "Closed"}</Badge>
                    </CardTitle>
                    <CardDescription>
                      {campaign.counts.reached} of {campaign.counts.total} reached ({pct}%). {campaign.counts.rsvpYes} coming, {campaign.counts.rsvpNo} not, {campaign.counts.rsvpMaybe} maybe.
                      {campaign.dueAt ? ` Calls by ${formatDay(campaign.dueAt)}.` : ""}
                    </CardDescription>
                  </CardHeader>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${campaign.title}: ${pct}% reached`}>
                    <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
