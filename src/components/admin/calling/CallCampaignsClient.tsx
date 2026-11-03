"use client";

import Link from "next/link";
import type { Route } from "next";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Megaphone, Network } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ProgressBar } from "@/src/components/ui/stat";
import { Textarea } from "@/src/components/ui/textarea";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { campaignScriptLoc, normalizeTitle } from "@/src/lib/callCampaigns";
import { statusBadge } from "@/src/lib/statusBadges";
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
  const { encrypt, status, enabled } = useE2ee();
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

  if (error) {
    return (
      <Alert variant="destructive">
        <Megaphone />
        <AlertTitle>Couldn&apos;t load the campaigns</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{error}</span>
          <Button variant="outline" size="row" onClick={load}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!campaigns) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading campaigns…</span>
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  // Unknown (the tree could not be read) counts as planned, so the form is never wrongly hidden.
  const treePlanned = tree === null || (tree.tree.callers.length > 0 && tree.total > 0);

  return (
    <div className="flex flex-col gap-6">
      {!treePlanned ? (
        // Until the tree is planned there is nobody to call: this callout is the page's one route to the Calling tree.
        <AdminSectionCard
          title="First plan the calling tree"
          icon={<Network aria-hidden="true" />}
          description={`A campaign shares out the people on the calling tree, and right now it has ${tree?.tree.callers.length ? "no one assigned to the callers" : "no callers"}. Choose callers and plan assignments there, then come back here.`}
          className="border-primary/30 bg-primary/5"
        >
          <div className="flex flex-wrap gap-2">
            <Button asChild className="max-sm:h-11">
              <Link href="/admin/calling-tree">Open Calling tree</Link>
            </Button>
          </div>
        </AdminSectionCard>
      ) : (
        <AdminSectionCard title="Open a campaign" description="Each person on the calling tree gets their usual caller for this campaign. Only callers can read the script.">
          <form onSubmit={create} className="flex min-w-0 flex-col gap-4">
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
            <Field
              label="Script and agenda (optional, encrypted)"
              description={
                enabled ? (
                  "Encrypted on this device before it is saved."
                ) : (
                  <>
                    Turn on encryption to add a script.{" "}
                    <Link href="/admin/encryption" className="font-medium text-foreground underline underline-offset-2">
                      Open Encryption
                    </Link>
                  </>
                )
              }
            >
              <Textarea
                id="campaign-script"
                rows={5}
                value={script}
                onChange={e => setScript(e.target.value)}
                maxLength={5000}
                disabled={!enabled}
                placeholder={enabled ? "What to say: date, place, agenda items, what to ask." : undefined}
              />
            </Field>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={creating} className="max-sm:h-11">
                Open campaign
              </Button>
            </div>
          </form>
        </AdminSectionCard>
      )}

      {campaigns.length === 0 ? (
        treePlanned ? (
          <EmptyState
            icon={<Megaphone aria-hidden="true" />}
            title="No campaigns yet"
            description="Open one with the form above when there is news to share. Each caller then sees their people under My calls."
          />
        ) : null
      ) : (
        <ul className="grid gap-4 md:grid-cols-2" aria-label="Campaigns">
          {campaigns.map(campaign => {
            const badge = statusBadge("campaign", campaign.status);
            const { reached, total } = campaign.counts;
            const pct = total ? Math.round((reached / total) * 100) : 0;
            return (
              <li key={campaign.id} className="min-w-0">
                <AdminSectionCard
                  className="h-full"
                  title={
                    <Link href={`/admin/call-campaigns/${campaign.id}` as Route} className="underline-offset-4 hover:underline">
                      {campaign.title}
                    </Link>
                  }
                  description={campaign.dueAt ? `Calls by ${formatDay(campaign.dueAt)}` : campaign.createdAt ? `Opened ${formatDay(campaign.createdAt)}` : undefined}
                  actions={<Badge variant={badge.variant}>{badge.label}</Badge>}
                >
                  <div className="flex flex-col gap-2">
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span>
                        <strong className="font-semibold tabular-nums">
                          {reached} of {total}
                        </strong>{" "}
                        reached
                      </span>
                      <span className="text-muted-foreground tabular-nums">{pct}%</span>
                    </div>
                    <ProgressBar value={reached} max={total} label={`${campaign.title}: ${reached} of ${total} reached`} />
                    <p className="text-sm text-muted-foreground">
                      {campaign.counts.rsvpYes} coming · {campaign.counts.rsvpNo} not coming · {campaign.counts.rsvpMaybe} maybe
                    </p>
                  </div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    <Button asChild variant="outline" size="row">
                      <Link href={`/admin/call-campaigns/${campaign.id}` as Route} aria-label={`See progress for ${campaign.title}`}>
                        See progress
                      </Link>
                    </Button>
                  </div>
                </AdminSectionCard>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
