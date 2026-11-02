"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Network } from "lucide-react";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { campaignScriptLoc, normalizeTitle } from "@/src/lib/callCampaigns";
import { api, formatDay, newId, type CampaignView } from "./campaignShared";

type EventLite = { id: string; title: string; status?: string };
/** Just enough of the calling tree to tell whether a campaign would have anyone to call. */
type TreeLite = { tree: { callers: string[] }; total: number };

export default function CallCampaignsClient() {
  return (
    <EncryptionGate what="the call campaigns">
      <Campaigns />
    </EncryptionGate>
  );
}

function Campaigns() {
  const { encrypt, status } = useE2ee();
  const [campaigns, setCampaigns] = useState<CampaignView[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<EventLite[]>([]);
  const [tree, setTree] = useState<TreeLite | null>(null);
  const [title, setTitle] = useState("");
  const [eventId, setEventId] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [script, setScript] = useState("");
  const [creating, setCreating] = useState(false);

  const fetchAll = () =>
    Promise.all([
      api<{ campaigns: CampaignView[] }>("/api/admin/call-campaigns"),
      api<{ events?: EventLite[] }>("/api/organizations/ghmo/events?status=all").catch(() => ({ events: [] as EventLite[] })),
      // Read only, to explain an empty tree; if it fails the form simply stays available.
      api<TreeLite>("/api/admin/calling-tree").catch(() => null)
    ]);
  const load = () =>
    fetchAll()
      .then(([list, ev, t]) => {
        setCampaigns(list.campaigns);
        setEvents(Array.isArray(ev.events) ? ev.events : []);
        setTree(t);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load campaigns"));
  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([list, ev, t]) => {
        if (cancelled) return;
        setCampaigns(list.campaigns);
        setEvents(Array.isArray(ev.events) ? ev.events : []);
        setTree(t);
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

  // Unknown (the tree could not be read) counts as planned, so the form is never wrongly locked.
  const treePlanned = tree === null || (tree.tree.callers.length > 0 && tree.total > 0);
  const focusForm = () => document.getElementById("campaign-title")?.focus();

  return (
    <div className="flex flex-col gap-6">
      {!treePlanned ? (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Network aria-hidden="true" className="size-5 text-primary" /> First plan the calling tree
            </CardTitle>
            <CardDescription>
              A campaign shares out the people on the calling tree, and right now it has {tree?.tree.callers.length ? "no one assigned to the callers" : "no callers"}.
              Choose callers and plan assignments there, then come back to open a campaign.
            </CardDescription>
          </CardHeader>
          <div className="flex flex-wrap gap-2">
            <Button asChild className="max-sm:h-11 max-sm:w-full">
              <Link href="/admin/calling-tree">Plan the calling tree</Link>
            </Button>
          </div>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Megaphone aria-hidden="true" className="size-5" /> Open a campaign
          </CardTitle>
          <CardDescription>Each person on the calling tree gets their usual caller for this campaign. Only callers can read the script.</CardDescription>
        </CardHeader>
        <form onSubmit={create}>
          <fieldset disabled={!treePlanned} className="flex min-w-0 flex-col gap-4">
            {!treePlanned ? <legend className="sr-only">Open a campaign (available once the calling tree is planned)</legend> : null}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Event (optional)" description="Picking an event fills in the title.">
                <Select id="campaign-event" value={eventId} onChange={e => pickEvent(e.target.value)}>
                  <option value="">No event</option>
                  {events.map(event => (
                    <option key={event.id} value={event.id}>
                      {event.title}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Calls done by (optional)">
                <Input id="campaign-due" type="date" value={dueAt} onChange={e => setDueAt(e.target.value)} />
              </Field>
            </div>
            <Field label="Title">
              <Input id="campaign-title" value={title} onChange={e => setTitle(e.target.value)} maxLength={150} required placeholder="General meeting, 15 November" />
            </Field>
            <Field label="Script and agenda (optional, encrypted)" description="Encrypted on this device before it is saved.">
              <Textarea id="campaign-script" rows={5} value={script} onChange={e => setScript(e.target.value)} maxLength={5000} placeholder="What to say: date, place, agenda items, what to ask." />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={creating} className="max-sm:h-11 max-sm:w-full">
                Open campaign
              </Button>
            </div>
          </fieldset>
        </form>
      </Card>

      {campaigns.length === 0 ? (
        <EmptyState
          icon={<Megaphone aria-hidden="true" />}
          title="No campaigns yet"
          description={
            treePlanned
              ? "Open one with the form above when there is news to share. Each caller then sees their people under My Calls."
              : "Plan the calling tree first; then open a campaign here."
          }
          action={
            treePlanned ? (
              <Button variant="outline" onClick={focusForm}>
                Start a campaign
              </Button>
            ) : (
              <Button asChild variant="outline">
                <Link href="/admin/calling-tree">Go to Calling Tree</Link>
              </Button>
            )
          }
        />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Campaigns">
          {campaigns.map(campaign => {
            const pct = campaign.counts.total ? Math.round((campaign.counts.reached / campaign.counts.total) * 100) : 0;
            return (
              <li key={campaign.id} className="min-w-0">
                <Card className="h-full">
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="min-w-0">
                        <Link href={`/admin/call-campaigns/${campaign.id}` as Route} className="underline-offset-4 hover:underline">
                          {campaign.title}
                        </Link>
                      </CardTitle>
                      <Badge variant={campaign.status === "open" ? "success" : "secondary"}>{campaign.status === "open" ? "Open" : "Closed"}</Badge>
                    </div>
                    <CardDescription>
                      {campaign.dueAt ? `Calls by ${formatDay(campaign.dueAt)}` : campaign.createdAt ? `Opened ${formatDay(campaign.createdAt)}` : ""}
                    </CardDescription>
                  </CardHeader>
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>
                        <strong className="font-semibold tabular-nums">
                          {campaign.counts.reached} of {campaign.counts.total}
                        </strong>{" "}
                        reached
                      </span>
                      <span className="text-muted-foreground tabular-nums">{pct}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${campaign.title}: ${pct}% reached`}>
                      <div className="h-full bg-primary" style={{ width: `${pct}%` }} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {campaign.counts.rsvpYes} coming · {campaign.counts.rsvpNo} not coming · {campaign.counts.rsvpMaybe} maybe
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button asChild variant="outline" className="max-sm:h-11 max-sm:w-full">
                      <Link href={`/admin/call-campaigns/${campaign.id}` as Route} aria-label={`See progress for ${campaign.title}`}>
                        See progress
                      </Link>
                    </Button>
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
