"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, Lock, Megaphone } from "lucide-react";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ProgressBar, StatGrid, StatTile } from "@/src/components/ui/stat";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { attemptNoteLoc, campaignCsv, campaignScriptLoc, computeCounts, isFinalOutcome, progressByCaller } from "@/src/lib/callCampaigns";
import { statusBadge } from "@/src/lib/statusBadges";
import { api, formatDay, formatWhen, memberLabel, type CallView, type CampaignView, type MemberLite } from "./campaignShared";

type Detail = { me: { uid: string; superAdmin: boolean }; campaign: CampaignView; calls: CallView[]; members: MemberLite[]; callerNames: Record<string, string> };

const BACK = { href: "/admin/call-campaigns", label: "Call campaigns" } as const;

export default function CampaignDetailClient({ campaignId }: { campaignId: string }) {
  const { enabled, status } = useE2ee();
  // The campaign's own header (its title) loads behind the gate; until then keep the way back visible.
  const gated = enabled && status !== "unlocked";
  return (
    <>
      {gated ? <AdminPageHeader title="Call campaign" back={BACK} /> : null}
      <EncryptionGate what="this campaign">
        <CampaignDetail campaignId={campaignId} />
      </EncryptionGate>
    </>
  );
}

function CampaignDetail({ campaignId }: { campaignId: string }) {
  const { decrypt, status } = useE2ee();
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [script, setScript] = useState<string | null>(null);
  const [notes, setNotes] = useState<Map<string, string>>(() => new Map());
  const [busy, setBusy] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);

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
            next.set(attempt.id, "(can't be opened on this device)");
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
        toast.success("Downloaded (names and outcomes only, no numbers)");
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

  if (error) {
    return (
      <div className="flex flex-col gap-6">
        <AdminPageHeader title="Call campaign" back={BACK} />
        <Alert variant="destructive">
          <Megaphone />
          <AlertTitle>Couldn&apos;t load the campaign</AlertTitle>
          <AlertDescription className="flex flex-col items-start gap-2">
            <span>{error}</span>
            <Button variant="outline" size="row" onClick={load}>
              Try again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }
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

  const pct = live.total ? Math.round((live.reached / live.total) * 100) : 0;
  const badge = statusBadge("campaign", campaign.status);
  const summary = [
    campaign.eventTitle ? `For ${campaign.eventTitle}.` : "",
    campaign.createdAt ? `Opened ${formatDay(campaign.createdAt)}.` : "",
    campaign.dueAt ? `Calls to be done by ${formatDay(campaign.dueAt)}.` : ""
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title={campaign.title}
        back={BACK}
        badge={<Badge variant={badge.variant}>{badge.label}</Badge>}
        description={summary || "Who has been reached so far, per caller, with every call logged."}
        actions={
          <>
            <Button variant="outline" loading={busy === "export"} onClick={() => act("export")} className="max-sm:h-11">
              <Download aria-hidden="true" className="size-4" /> Download spreadsheet (CSV)
            </Button>
            {campaign.status === "open" ? (
              <>
                <Button variant="outline" loading={busy === "remind"} onClick={() => act("remind")} className="max-sm:h-11">
                  Remind callers
                </Button>
                {/* Set apart from the other actions: a divider, ghost red, and a confirmation. */}
                <span aria-hidden="true" className="hidden h-6 w-px bg-border sm:block" />
                <Button
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 hover:text-destructive max-sm:h-11"
                  disabled={busy === "close"}
                  onClick={() => setClosing(true)}
                >
                  Close campaign
                </Button>
              </>
            ) : null}
          </>
        }
      />

      <AdminSectionCard title="Progress" description={`${live.reached} of ${live.total} people reached (${pct}%).`}>
        <ProgressBar value={live.reached} max={live.total} label={`${live.reached} of ${live.total} people reached`} />
        <StatGrid>
          <StatTile label="Reached" value={<Figure label="Reached" value={`${live.reached} / ${live.total}`} />} />
          <StatTile label="Attempted" value={<Figure label="Attempted" value={`${live.attempted} / ${live.total}`} />} />
          <StatTile label="Coming" value={<Figure label="Coming" value={String(live.rsvpYes)} />} />
          <StatTile label="Not coming / maybe" value={<Figure label="Not coming / maybe" value={`${live.rsvpNo} / ${live.rsvpMaybe}`} />} />
        </StatGrid>
      </AdminSectionCard>

      {campaign.script ? (
        <AdminSectionCard title="Script" icon={<Lock aria-hidden="true" />} description="What callers say. Only callers and approved admin devices can read it.">
          <p className="text-sm whitespace-pre-wrap">{script ?? "Unlocking…"}</p>
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard title="Progress per caller">
        <div className="-mx-1 overflow-x-auto px-1">
          <table className="w-full min-w-[28rem] text-sm" aria-label="Progress per caller">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-2 pr-3 font-medium">Caller</th>
                <th className="py-2 pr-3 font-medium">Reached</th>
                <th className="py-2 pr-3 font-medium">Attempted</th>
                <th className="py-2 pr-3 font-medium">Left</th>
                <th className="py-2 font-medium">Coming</th>
              </tr>
            </thead>
            <tbody>
              {byCaller.map(row => (
                <tr key={row.callerUid} className="border-t border-border">
                  <td className="py-2 pr-3 font-medium">{callerNames[row.callerUid] ?? row.callerUid}</td>
                  <td className="py-2 pr-3 tabular-nums">
                    {row.reached} / {row.total}
                  </td>
                  <td className="py-2 pr-3 tabular-nums">{row.attempted}</td>
                  <td className="py-2 pr-3 tabular-nums">{row.total - row.done}</td>
                  <td className="py-2 tabular-nums">{row.rsvpYes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        title={`Not yet reached (${notReached.length})`}
        description="People still to try: not called yet, no answer, a voicemail left, or asked to be called back."
      >
        {notReached.length === 0 ? (
          <p className="text-sm text-muted-foreground">Everyone has been reached.</p>
        ) : (
          <AdminList bare label="Not yet reached">
            {notReached.map(call => {
              const outcome = statusBadge("callOutcome", call.outcome);
              return (
                <AdminListRow
                  key={call.memberId}
                  title={memberLabel(memberById.get(call.memberId), call.memberId)}
                  badges={<Badge variant={outcome.variant}>{outcome.label}</Badge>}
                  meta={`${callerNames[call.callerUid] ?? call.callerUid}${call.attemptCount ? ` · ${call.attemptCount} ${call.attemptCount === 1 ? "attempt" : "attempts"}` : ""}`}
                />
              );
            })}
          </AdminList>
        )}
      </AdminSectionCard>

      <AdminSectionCard title={`Call log (${log.length})`} description="Every attempt, newest first. Notes are unlocked on this device.">
        {log.length === 0 ? (
          <p className="text-sm text-muted-foreground">No calls logged yet. Callers log them from My calls.</p>
        ) : (
          <AdminList bare label="Call log">
            {log.map(entry => {
              const outcome = statusBadge("callOutcome", entry.outcome);
              return (
                <AdminListRow
                  key={entry.id}
                  title={memberLabel(memberById.get(entry.memberId), entry.memberId)}
                  badges={<Badge variant={outcome.variant}>{outcome.label}</Badge>}
                  meta={`by ${callerNames[entry.byUid] ?? entry.byUid} · ${formatWhen(entry.at)}`}
                >
                  {notes.get(entry.id) ? <p className="mt-1 text-sm text-foreground">{notes.get(entry.id)}</p> : null}
                </AdminListRow>
              );
            })}
          </AdminList>
        )}
      </AdminSectionCard>

      <ConfirmDialog
        open={closing}
        onOpenChange={setClosing}
        destructive
        title="Close this campaign?"
        description="Callers can't log any more calls for it. The progress and call log stay here, and you can still download them."
        confirmLabel="Close campaign"
        busy={busy === "close"}
        onConfirm={async () => {
          await act("close");
          setClosing(false);
        }}
      />
    </div>
  );
}

/** A figure with its own accessible name ("Reached: 2 / 3"), so it reads in one go. */
function Figure({ label, value }: { label: string; value: string }) {
  return <span aria-label={`${label}: ${value}`}>{value}</span>;
}
