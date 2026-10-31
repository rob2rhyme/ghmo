"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Download, Lock, Megaphone } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { OUTCOME_LABELS, RSVP_LABELS, attemptNoteLoc, campaignCsv, campaignScriptLoc, computeCounts, isFinalOutcome, progressByCaller } from "@/src/lib/callCampaigns";
import { api, formatDay, formatWhen, memberLabel, type CallView, type CampaignView, type MemberLite } from "./campaignShared";

type Detail = { me: { uid: string; superAdmin: boolean }; campaign: CampaignView; calls: CallView[]; members: MemberLite[]; callerNames: Record<string, string> };

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  return (
    <EncryptionGate what="This campaign">
      <CampaignDetail campaignId={campaignId} />
    </EncryptionGate>
  );
}

function CampaignDetail({ campaignId }: { campaignId: string }) {
  const { decrypt, status } = useE2ee();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [notes, setNotes] = useState<Map<string, string>>(() => new Map());
  const [busy, setBusy] = useState<string | null>(null);

  const url = `/api/admin/call-campaigns/${campaignId}`;
  const load = () =>
    api<Detail>(url)
      .then(d => {
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load the campaign"));
  useEffect(() => {
    let cancelled = false;
    api<Detail>(url)
      .then(d => {
        if (cancelled) return;
        setData(d);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load the campaign");
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  // The script and the notes are envelopes; decrypt them on this device only.
  useEffect(() => {
    if (!data || status !== "unlocked") return;
    let cancelled = false;
    const work = async () => {
      const next = new Map<string, string>();
      let text: string | null = null;
      if (data.campaign.script) {
        try {
          text = (await decrypt<{ script?: string }>(data.campaign.script, campaignScriptLoc(data.campaign.id))).script ?? null;
        } catch {
          text = null;
        }
      }
      for (const call of data.calls) {
        for (const attempt of call.attempts) {
          if (!attempt.note) continue;
          try {
            const { note } = await decrypt<{ note?: string }>(attempt.note, attemptNoteLoc(data.campaign.id, call.memberId, attempt.id));
            if (note) next.set(attempt.id, note);
          } catch {
            next.set(attempt.id, "(can't be read on this device)");
          }
        }
      }
      return { text, next };
    };
    work().then(result => {
      if (cancelled) return;
      setScript(result.text);
      setNotes(result.next);
    });
    return () => {
      cancelled = true;
    };
  }, [data, status, decrypt]);

  const memberById = useMemo(() => new Map((data?.members ?? []).map(m => [m.id, m])), [data]);

  const act = async (action: "close" | "remind" | "export") => {
    if (!data) return;
    setBusy(action);
    try {
      const result = await api<{ ok: true; callers?: number; sent?: number }>(url, { method: "POST", body: JSON.stringify({ action }) });
      if (action === "export") {
        const rows = data.calls.map(call => ({
          ...call,
          name: memberLabel(memberById.get(call.memberId), call.memberId),
          email: memberById.get(call.memberId)?.emailLower ?? "",
          callerName: data.callerNames[call.callerUid] ?? call.callerUid,
          lastAttemptAt: call.attempts.length ? (call.attempts[call.attempts.length - 1].at ?? null) : null
        }));
        const blob = new Blob([campaignCsv(rows)], { type: "text/csv;charset=utf-8" });
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href;
        a.download = `call-campaign-${data.campaign.id}.csv`;
        a.click();
        URL.revokeObjectURL(href);
        toast.success("Exported (names and outcomes only, no numbers)");
      } else if (action === "remind") {
        toast.success(`Reminder sent to ${result.sent ?? 0} of ${result.callers ?? 0} callers with calls left`);
      } else {
        toast.success("Campaign closed");
        await load();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not do that");
    } finally {
      setBusy(null);
    }
  };

  if (error) return <EmptyState icon={<Megaphone aria-hidden="true" />} title="Could not load the campaign" description={error} action={<Button onClick={load}>Try again</Button>} />;
  if (!data) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading the campaign…</span>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  const { campaign, calls, callerNames } = data;
  const live = computeCounts(calls);
  const byCaller = progressByCaller(calls);
  const notReached = calls.filter(call => !isFinalOutcome(call.outcome)).sort((a, b) => memberLabel(memberById.get(a.memberId), a.memberId).localeCompare(memberLabel(memberById.get(b.memberId), b.memberId)));
  const log = calls
    .flatMap(call => call.attempts.map(attempt => ({ ...attempt, memberId: call.memberId, callerUid: call.callerUid })))
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0));

  return (
    <div className="space-y-6">
      <AdminPageHeader
        title={campaign.title}
        description={`${campaign.status === "open" ? "Open" : "Closed"}${campaign.eventTitle ? ` · ${campaign.eventTitle}` : ""}${campaign.dueAt ? ` · calls by ${formatDay(campaign.dueAt)}` : ""} · opened ${formatWhen(campaign.createdAt)} · calling tree v${campaign.treeVersion}`}
      />
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/admin/call-campaigns">
            <ArrowLeft aria-hidden="true" className="size-4" /> All campaigns
          </Link>
        </Button>
        <Button size="sm" variant="outline" loading={busy === "export"} onClick={() => act("export")}>
          <Download aria-hidden="true" className="size-4" /> Export CSV
        </Button>
        {campaign.status === "open" ? (
          <>
            <Button size="sm" variant="outline" loading={busy === "remind"} onClick={() => act("remind")}>
              Remind callers
            </Button>
            <Button size="sm" variant="destructive" loading={busy === "close"} onClick={() => act("close")}>
              Close campaign
            </Button>
          </>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-4" aria-label="Campaign totals">
        <Stat label="Reached" value={`${live.reached} / ${live.total}`} />
        <Stat label="Attempted" value={`${live.attempted} / ${live.total}`} />
        <Stat label="Coming" value={String(live.rsvpYes)} />
        <Stat label="Not coming / maybe" value={`${live.rsvpNo} / ${live.rsvpMaybe}`} />
      </div>

      {campaign.script ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Lock aria-hidden="true" className="size-4" /> Script
            </CardTitle>
          </CardHeader>
          <p className="whitespace-pre-wrap text-sm">{script ?? "Decrypting…"}</p>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Progress per caller</CardTitle>
        </CardHeader>
        <table className="w-full text-sm" aria-label="Progress per caller">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th className="py-1 pr-2 font-medium">Caller</th>
              <th className="py-1 pr-2 font-medium">Reached</th>
              <th className="py-1 pr-2 font-medium">Attempted</th>
              <th className="py-1 pr-2 font-medium">Left</th>
              <th className="py-1 font-medium">Coming</th>
            </tr>
          </thead>
          <tbody>
            {byCaller.map(row => (
              <tr key={row.callerUid} className="border-t border-border">
                <td className="py-1 pr-2">{callerNames[row.callerUid] ?? row.callerUid}</td>
                <td className="py-1 pr-2">
                  {row.reached} / {row.total}
                </td>
                <td className="py-1 pr-2">{row.attempted}</td>
                <td className="py-1 pr-2">{row.total - row.done}</td>
                <td className="py-1">{row.rsvpYes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Not yet reached ({notReached.length})</CardTitle>
          <CardDescription>People whose caller has not reached them, had the call declined, or found a wrong number.</CardDescription>
        </CardHeader>
        {notReached.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone has been reached.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" aria-label="Not yet reached">
            {notReached.map(call => (
              <li key={call.memberId} className="flex items-center justify-between gap-2 py-1.5">
                <span>{memberLabel(memberById.get(call.memberId), call.memberId)}</span>
                <span className="text-muted-foreground">
                  {callerNames[call.callerUid] ?? call.callerUid}
                  {call.outcome ? ` · ${OUTCOME_LABELS[call.outcome]} (${call.attemptCount})` : " · not tried"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Call log ({log.length})</CardTitle>
          <CardDescription>Every attempt, newest first. Notes are decrypted on this device.</CardDescription>
        </CardHeader>
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls logged yet.</p>
        ) : (
          <ul className="divide-y divide-border text-sm" aria-label="Call log">
            {log.map(entry => (
              <li key={entry.id} className="py-1.5">
                <span className="font-medium">{memberLabel(memberById.get(entry.memberId), entry.memberId)}</span>
                {" · "}
                <Badge variant={entry.outcome === "reached" ? "success" : "secondary"}>{OUTCOME_LABELS[entry.outcome]}</Badge>
                <span className="text-muted-foreground">
                  {" "}
                  by {callerNames[entry.byUid] ?? entry.byUid} · {formatWhen(entry.at)}
                </span>
                {notes.get(entry.id) ? <p className="text-muted-foreground">{notes.get(entry.id)}</p> : null}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {calls.some(call => call.rsvp) ? (
        <p className="text-xs text-muted-foreground">
          RSVPs: {calls.filter(c => c.rsvp === "yes").length} {RSVP_LABELS.yes.toLowerCase()}, {calls.filter(c => c.rsvp === "no").length} {RSVP_LABELS.no.toLowerCase()},{" "}
          {calls.filter(c => c.rsvp === "maybe").length} {RSVP_LABELS.maybe.toLowerCase()}.
        </p>
      ) : null}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card className="py-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold" aria-label={`${label}: ${value}`}>
        {value}
      </p>
    </Card>
  );
}
