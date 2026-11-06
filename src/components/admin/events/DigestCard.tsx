"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing, RefreshCw } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { errorMessage, peopleApi } from "@/src/components/admin/people/api";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { formatShortDate } from "@/src/lib/format";

type Settings = {
  enabled: boolean;
  updatedAt: string | null;
  lastRun: { at: string; status: "sent" | "nothing_to_send" | "blocked" | "failed"; emailed: number; failed: number; deferred: number; cannotEmail: number; note: string | null } | null;
};
type Response = { settings: Settings; superAdmin: boolean; scheduleReady: boolean; blocker: string | null };

const lastRunText = (run: NonNullable<Settings["lastRun"]>) => {
  const when = run.at ? formatShortDate(run.at) : "recently";
  if (run.status === "sent") return `Last run ${when}: ${run.emailed} ${run.emailed === 1 ? "person" : "people"} emailed${run.deferred ? `, ${run.deferred} left for the next day` : ""}.`;
  if (run.status === "nothing_to_send") return `Last run ${when}: no one needed a reminder.`;
  if (run.status === "blocked") return `Last run ${when}: nothing was sent. ${run.note ?? ""}`.trim();
  return `Last run ${when}: it didn't finish. ${run.note ?? ""}`.trim();
};

/** The switch for the daily overdue-task digest (plan §16, 12-B). Off until a super admin turns it on. */
export default function DigestCard() {
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    peopleApi<Response>("/api/admin/task-digest")
      .then(result => {
        if (!cancelled) setData(result);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, "Could not load the digest settings"));
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load the daily digest settings</AlertTitle>
        <AlertDescription>
          <p>{error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="row"
              onClick={() => {
                setError(null);
                setAttempt(n => n + 1);
              }}
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (!data) {
    return (
      <div role="status">
        <span className="sr-only">Loading the daily digest settings…</span>
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }
  const { settings, superAdmin, scheduleReady, blocker } = data;

  const change = async (enabled: boolean) => {
    setBusy(true);
    try {
      const result = await peopleApi<{ settings: Settings }>("/api/admin/task-digest", { method: "PUT", body: { enabled } });
      setData({ ...data, settings: result.settings });
      toast.success(enabled ? "Daily digest switched on" : "Daily digest switched off");
      setConfirming(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSectionCard
      title="Daily overdue digest"
      description="Every morning, around 8 or 9 AM Eastern, each person with overdue tasks gets one email listing them. Only members who agreed to emails are included."
      icon={<BellRing aria-hidden="true" />}
      actions={
        superAdmin ? (
          settings.enabled ? (
            <Button variant="outline" size="row" onClick={() => void change(false)} loading={busy}>
              Switch off
            </Button>
          ) : (
            <Button size="row" onClick={() => setConfirming(true)}>
              Switch on
            </Button>
          )
        ) : undefined
      }
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={settings.enabled ? "success" : "secondary"}>{settings.enabled ? "On" : "Off"}</Badge>
        {settings.lastRun ? <span className="text-sm text-muted-foreground">{lastRunText(settings.lastRun)}</span> : <span className="text-sm text-muted-foreground">It has not run yet.</span>}
      </div>
      {!superAdmin ? <p className="text-sm text-muted-foreground">Only a super admin can switch it on or off.</p> : null}
      {settings.enabled && !scheduleReady ? (
        <Alert variant="destructive">
          <AlertDescription>The daily schedule isn&apos;t set up on this site yet, so nothing will be sent. Ask whoever manages the website to add the schedule secret.</AlertDescription>
        </Alert>
      ) : null}
      {settings.enabled && blocker ? (
        <Alert variant="destructive">
          <AlertDescription>{blocker}</AlertDescription>
        </Alert>
      ) : null}
      <ConfirmDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Switch on the daily digest?"
        description="Every day, each member with an overdue task gets one email listing their overdue tasks, with an unsubscribe link. At most 50 people a day, and never more than half of the day's email limit. People who haven't agreed to emails are skipped. You can switch it off at any time."
        confirmLabel="Switch on"
        busy={busy}
        onConfirm={() => change(true)}
      />
    </AdminSectionCard>
  );
}
