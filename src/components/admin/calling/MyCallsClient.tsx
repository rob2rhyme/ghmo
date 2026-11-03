"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Eye, EyeOff, Lock, Phone, PhoneCall } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/src/components/ui/dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Textarea } from "@/src/components/ui/textarea";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useMemberContacts, type ContactView } from "@/src/components/admin/members/useMemberContacts";
import { OUTCOMES, OUTCOME_LABELS, RSVPS, RSVP_LABELS, attemptNoteLoc, campaignScriptLoc, isFinalOutcome, type Outcome, type Rsvp } from "@/src/lib/callCampaigns";
import { statusBadge } from "@/src/lib/statusBadges";
import { formatPhone, maskPhone } from "@/src/lib/members";
import { api, formatDay, memberLabel, newId, type CallView, type CampaignView, type MemberLite } from "./campaignShared";

type MineResponse = { isCaller: boolean; version: number; members: MemberLite[]; skipped: number };
type CampaignsResponse = { campaigns: CampaignView[]; mine: Record<string, { calls: CallView[]; members: MemberLite[] }> };

/**
 * A caller's own page (plan §12.3): for each open campaign, their people with the script, outcome and
 * RSVP buttons and an encrypted note; below it, everyone assigned to them in the calling tree. Numbers
 * are decrypted in this browser and shown masked until tapped.
 */
export default function MyCallsClient() {
  return (
    <EncryptionGate what="your call list" detail="Phone numbers are readable only on approved admin devices.">
      <MyCalls />
    </EncryptionGate>
  );
}

function MyCalls() {
  const [mine, setMine] = useState<MineResponse | null>(null);
  const [campaigns, setCampaigns] = useState<CampaignsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const [logging, setLogging] = useState<{ campaign: CampaignView; call: CallView; member: MemberLite | undefined } | null>(null);

  // One contact map for everyone on this page: the tree slice plus every campaign row.
  const everyone = useMemo(() => {
    const map = new Map<string, MemberLite>();
    for (const m of mine?.members ?? []) map.set(m.id, m);
    for (const slice of Object.values(campaigns?.mine ?? {})) for (const m of slice.members) map.set(m.id, m);
    return [...map.values()];
  }, [mine, campaigns]);
  const { contacts, e2ee } = useMemberContacts(everyone);
  const { decrypt, encrypt, status } = e2ee;
  const superAdmin = Boolean(e2ee.overview?.me.superAdmin);
  const [scripts, setScripts] = useState<Map<string, string>>(() => new Map());

  const fetchAll = () => Promise.all([api<MineResponse>("/api/admin/calling-tree/mine"), api<CampaignsResponse>("/api/admin/call-campaigns?mine=1")]);
  const load = () =>
    fetchAll()
      .then(([m, c]) => {
        setMine(m);
        setCampaigns(c);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load your calls"));
  useEffect(() => {
    let cancelled = false;
    fetchAll()
      .then(([m, c]) => {
        if (cancelled) return;
        setMine(m);
        setCampaigns(c);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your calls");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Scripts are envelopes on the campaign; decrypt the ones for campaigns this caller is in.
  useEffect(() => {
    if (!campaigns || status !== "unlocked") return;
    let cancelled = false;
    const open = campaigns.campaigns.filter(c => c.status === "open" && campaigns.mine[c.id] && c.script);
    Promise.all(
      open.map(async c => {
        try {
          return [c.id, (await decrypt<{ script?: string }>(c.script, campaignScriptLoc(c.id))).script ?? ""] as const;
        } catch {
          return [c.id, "(the script can't be opened on this device)"] as const;
        }
      })
    ).then(entries => {
      if (!cancelled) setScripts(new Map(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [campaigns, status, decrypt]);

  const toggle = (id: string) =>
    setRevealed(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const logAttempt = async (params: { outcome: Outcome; rsvp: Rsvp | null; note: string }) => {
    if (!logging) return false;
    const { campaign, call } = logging;
    try {
      const attemptId = newId();
      const body: Record<string, unknown> = { attemptId, outcome: params.outcome, rsvp: params.outcome === "reached" ? params.rsvp : null };
      if (params.note.trim()) body.note = await encrypt(attemptNoteLoc(campaign.id, call.memberId, attemptId), { note: params.note.trim() });
      const { call: updated } = await api<{ call: CallView }>(`/api/admin/call-campaigns/${campaign.id}/calls/${call.memberId}`, { method: "POST", body: JSON.stringify(body) });
      setCampaigns(current => {
        if (!current) return current;
        const slice = current.mine[campaign.id];
        if (!slice) return current;
        return { ...current, mine: { ...current.mine, [campaign.id]: { ...slice, calls: slice.calls.map(c => (c.memberId === updated.memberId ? updated : c)) } } };
      });
      toast.success(`Logged: ${OUTCOME_LABELS[params.outcome]}`);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not log the call");
      return false;
    }
  };

  if (error) {
    return (
      <Alert variant="destructive">
        <PhoneCall />
        <AlertTitle>Couldn&apos;t load your calls</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-2">
          <span>{error}</span>
          <Button variant="outline" size="row" onClick={load}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }
  if (!mine || !campaigns) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your calls…</span>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const openCampaigns = campaigns.campaigns.filter(c => c.status === "open" && campaigns.mine[c.id]);

  if (!mine.isCaller && openCampaigns.length === 0) {
    return (
      <EmptyState
        icon={<PhoneCall aria-hidden="true" />}
        title="You are not on the caller list"
        description={
          superAdmin
            ? "Add yourself as a caller: check your name under Calling tree, plan assignments and save. Your people then show up here."
            : "Ask a super admin to add you under Calling tree."
        }
        action={
          superAdmin ? (
            <Button asChild variant="outline" size="row">
              <Link href="/admin/calling-tree">Open Calling tree</Link>
            </Button>
          ) : null
        }
      />
    );
  }

  const sortedPeople = [...mine.members].sort((a, b) => memberLabel(a, a.id).localeCompare(memberLabel(b, b.id)));

  return (
    <div className="flex flex-col gap-6">
      {openCampaigns.map(campaign => {
        const slice = campaigns.mine[campaign.id];
        const memberById = new Map(slice.members.map(m => [m.id, m]));
        const rows = [...slice.calls].sort((a, b) => Number(isFinalOutcome(a.outcome)) - Number(isFinalOutcome(b.outcome)) || memberLabel(memberById.get(a.memberId), a.memberId).localeCompare(memberLabel(memberById.get(b.memberId), b.memberId)));
        const left = rows.filter(r => !isFinalOutcome(r.outcome)).length;
        return (
          <AdminSectionCard
            key={campaign.id}
            title={campaign.title}
            description={`${left === 0 ? "All done: everyone was reached or finished." : `${left} of ${rows.length} still to reach.`}${campaign.dueAt ? ` Calls by ${formatDay(campaign.dueAt)}.` : ""}`}
          >
            {campaign.script ? (
              <details className="rounded-md border border-border bg-muted/40 p-3 text-sm" open={left > 0}>
                <summary className="flex min-h-11 cursor-pointer items-center gap-1.5 font-medium">
                  <Lock aria-hidden="true" className="size-3.5" /> What to say
                </summary>
                <p className="mt-2 whitespace-pre-wrap">{scripts.get(campaign.id) ?? "Unlocking…"}</p>
              </details>
            ) : null}
            <AdminList bare label={`Calls for ${campaign.title}`}>
              {rows.map(call => {
                const member = memberById.get(call.memberId);
                const label = memberLabel(member, call.memberId);
                const view = contacts.get(call.memberId);
                const outcome = call.outcome ? statusBadge("callOutcome", call.outcome) : null;
                return (
                  <AdminListRow
                    key={call.memberId}
                    title={label}
                    badges={
                      outcome ? (
                        <Badge variant={outcome.variant}>
                          {outcome.label}
                          {call.rsvp ? ` · ${RSVP_LABELS[call.rsvp]}` : ""}
                        </Badge>
                      ) : null
                    }
                    actions={
                      <>
                        <RevealAndCall label={label} view={view} revealed={revealed.has(call.memberId)} onToggle={() => toggle(call.memberId)} />
                        <Button variant="outline" size="row" onClick={() => setLogging({ campaign, call, member })} aria-label={`Log call to ${label}`}>
                          Log call
                        </Button>
                      </>
                    }
                  >
                    <PhoneLine view={view} revealed={revealed.has(call.memberId)} />
                  </AdminListRow>
                );
              })}
            </AdminList>
          </AdminSectionCard>
        );
      })}

      {mine.isCaller ? (
        <AdminSectionCard
          title="Your people"
          description={`${sortedPeople.length} ${sortedPeople.length === 1 ? "person" : "people"} assigned to you in the calling tree.${e2ee.enabled ? " Numbers are unlocked on this device only and never leave it." : ""}${
            mine.skipped > 0 ? ` ${mine.skipped} left out (asked not to be called, or no number).` : ""
          }`}
        >
          {sortedPeople.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nobody assigned to you yet. People are shared out when a super admin plans assignments under Calling tree.</p>
          ) : (
            <AdminList bare label="Your call list">
              {sortedPeople.map(member => {
                const label = memberLabel(member, member.id);
                const view = contacts.get(member.id);
                return (
                  <AdminListRow
                    key={member.id}
                    title={label}
                    actions={<RevealAndCall label={label} view={view} revealed={revealed.has(member.id)} onToggle={() => toggle(member.id)} />}
                  >
                    <PhoneLine view={view} revealed={revealed.has(member.id)} />
                  </AdminListRow>
                );
              })}
            </AdminList>
          )}
        </AdminSectionCard>
      ) : null}

      {!mine.isCaller && openCampaigns.length > 0 ? (
        <Alert variant="info">
          <PhoneCall />
          <AlertTitle>You are no longer on the caller list</AlertTitle>
          <AlertDescription>The campaigns above keep the people you were given when they opened.</AlertDescription>
        </Alert>
      ) : null}

      {logging ? (
        <LogCallDialog
          label={memberLabel(logging.member, logging.call.memberId)}
          campaignTitle={logging.campaign.title}
          current={logging.call}
          onClose={() => setLogging(null)}
          onSave={async params => {
            if (await logAttempt(params)) setLogging(null);
          }}
        />
      ) : null}
    </div>
  );
}

function PhoneLine({ view, revealed }: { view: ContactView | undefined; revealed: boolean }) {
  if (!view) return <p className="mt-0.5 text-sm text-muted-foreground">Unlocking…</p>;
  if (!view.ok) return <p className="mt-0.5 text-sm text-destructive">Number can&apos;t be opened on this device.</p>;
  const { phone, altPhone, language, household, notes } = view.contact;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
      <span className="font-mono" aria-label={revealed && phone ? `Phone ${formatPhone(phone)}` : "Phone number hidden"}>
        {phone ? (revealed ? formatPhone(phone) : maskPhone(phone)) : "No number"}
      </span>
      {revealed && altPhone ? <span>alt {formatPhone(altPhone)}</span> : null}
      {language ? <span>{language}</span> : null}
      {household ? <span>· {household}</span> : null}
      {revealed && notes ? <span className="basis-full">{notes}</span> : null}
    </div>
  );
}

function RevealAndCall({ label, view, revealed, onToggle }: { label: string; view: ContactView | undefined; revealed: boolean; onToggle: () => void }) {
  if (!view?.ok || !view.contact.phone) return null;
  return (
    <>
      <Button variant="ghost" size="row" onClick={onToggle} aria-label={revealed ? `Hide ${label}'s number` : `Show ${label}'s number`}>
        {revealed ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
        {revealed ? "Hide" : "Show"}
      </Button>
      <Button asChild variant="outline" size="row">
        <a href={`tel:${view.contact.phone}`} aria-label={`Call ${label}`}>
          <Phone aria-hidden="true" className="size-4" /> Call
        </a>
      </Button>
    </>
  );
}

function LogCallDialog({
  label,
  campaignTitle,
  current,
  onClose,
  onSave
}: {
  label: string;
  campaignTitle: string;
  current: CallView;
  onClose: () => void;
  onSave: (params: { outcome: Outcome; rsvp: Rsvp | null; note: string }) => Promise<void>;
}) {
  const [outcome, setOutcome] = useState<Outcome>("reached");
  const [rsvp, setRsvp] = useState<Rsvp | null>(current.rsvp);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await onSave({ outcome, rsvp, note });
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open onOpenChange={open => (!open ? onClose() : null)}>
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Log a call to {label}</DialogTitle>
            <DialogDescription>
              {campaignTitle}. {current.attemptCount > 0 ? `${current.attemptCount} earlier ${current.attemptCount === 1 ? "attempt" : "attempts"}.` : "First attempt."} The outcome is recorded with your name; the note is
              encrypted.
            </DialogDescription>
          </DialogHeader>
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">What happened?</legend>
            <div className="grid grid-cols-2 gap-1.5" role="radiogroup" aria-label="Outcome">
              {OUTCOMES.map(value => (
                <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${outcome === value ? "border-primary bg-primary/5" : "border-border"}`}>
                  <input type="radio" name="outcome" value={value} checked={outcome === value} onChange={() => setOutcome(value)} />
                  {OUTCOME_LABELS[value]}
                </label>
              ))}
            </div>
          </fieldset>
          {outcome === "reached" ? (
            <fieldset className="space-y-1.5">
              <legend className="text-sm font-medium">Are they coming?</legend>
              <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="RSVP">
                {RSVPS.map(value => (
                  <label key={value} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${rsvp === value ? "border-primary bg-primary/5" : "border-border"}`}>
                    <input type="radio" name="rsvp" value={value} checked={rsvp === value} onChange={() => setRsvp(value)} />
                    {RSVP_LABELS[value]}
                  </label>
                ))}
                <label className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${rsvp === null ? "border-primary bg-primary/5" : "border-border"}`}>
                  <input type="radio" name="rsvp" value="" checked={rsvp === null} onChange={() => setRsvp(null)} />
                  Didn&apos;t say
                </label>
              </div>
            </fieldset>
          ) : null}
          <Field label="Note (optional, encrypted)">
            <Textarea id="call-note" rows={2} value={note} onChange={e => setNote(e.target.value)} maxLength={1000} placeholder="Asked to call back after 6 pm, bringing two guests…" />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" loading={saving}>
              Save call
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
