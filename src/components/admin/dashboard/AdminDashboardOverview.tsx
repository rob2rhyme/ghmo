"use client";

import type { Route } from "next";
import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  CalendarDays,
  CalendarPlus,
  CircleDollarSign,
  FileSignature,
  FolderOpen,
  Landmark,
  ListChecks,
  NotebookPen,
  Plus,
  RefreshCw,
  UsersRound,
  type LucideIcon
} from "lucide-react";
import AdminActionCard from "@/src/components/admin/AdminActionCard";
import AdminKpiCard from "@/src/components/admin/AdminKpiCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AllMinutesLink } from "./AllMinutesLink";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import type { MeetingMinutesRecord } from "@/src/lib/minutes";
import { activitySentence, firstName, formatMoney, formatShortDate, percentOf, relativeTime } from "@/src/lib/adminView";
import { formatDateTime } from "@/src/lib/format";
import { statusBadge } from "@/src/lib/statusBadges";
import type { SetupItem } from "@/src/lib/siteSetup";
import SiteSetupCard from "./SiteSetupCard";
import { Alert, AlertDescription } from "@/src/components/ui/alert";

type AuditLogView = {
  id: string;
  summary?: string;
  type?: string;
  action?: string;
  resource?: { summary?: string } | null;
  actor?: { name?: string | null; role?: string | null; roles?: string[] | null } | string | null;
  actorUid?: string;
  role?: string;
  metadata?: { action?: string } | null;
  createdAtMs?: number | null;
};

type WebhookEventView = { id: string; receivedAt?: unknown };

type AdminDashboardOverviewProps = {
  community: { id: string; name?: string };
  adminName?: string;
  stats: { totalRaised?: number; goal?: number; donorCount?: number };
  /** The latest records (list fields only), newest meeting first. */
  minutes: Pick<MeetingMinutesRecord, "id" | "eventTitle" | "eventDate" | "meetingType" | "status">[];
  /** How many records wait for approval and how many are drafts, over all minutes (counted on the server). */
  minutesCounts: { submitted: number; draft: number };
  auditLogs: AuditLogView[];
  webhookEvents: WebhookEventView[];
  /** Which parts of the page failed to load, in words, or null. */
  loadWarning?: string | null;
  /** Super admins only: what is missing in the site's settings (empty when all is set; null for other admins). */
  setup?: SetupItem[] | null;
};

const QUICK_ACTIONS: { href: Route; title: string; description: string; icon: LucideIcon }[] = [
  { href: "/admin/minutes" as Route, title: "Meeting minutes", description: "Draft, approve and export minutes.", icon: NotebookPen },
  { href: "/admin/action-items" as Route, title: "Action items", description: "Follow up on what was agreed.", icon: ListChecks },
  { href: "/admin/events" as Route, title: "Events", description: "Manage upcoming and past events.", icon: CalendarDays },
  { href: "/admin/document-generator" as Route, title: "Document generator", description: "Letters, invitations and certificates on GHMO letterhead.", icon: FileSignature },
  { href: "/admin/document-gallery" as Route, title: "Document gallery", description: "Letters and certificates you saved.", icon: FolderOpen },
  { href: "/admin/gumba-project" as Route, title: "Gumba Project", description: "Fundraising progress and the minutes behind it.", icon: Landmark }
];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function AdminDashboardOverview({ community, adminName, stats, minutes, minutesCounts, auditLogs, webhookEvents, loadWarning = null, setup = null }: AdminDashboardOverviewProps) {
  const [reconciling, setReconciling] = useState(false);
  const [now] = useState(() => Date.now());

  const recentMinutes = useMemo(() => [...(minutes || [])].sort((a, b) => (b.eventDate || 0) - (a.eventDate || 0)).slice(0, 5), [minutes]);

  const recentAuditLogs = useMemo(() => [...(auditLogs || [])].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0)).slice(0, 8), [auditLogs]);

  const latestWebhookMs = useMemo(() => {
    let latest = 0;
    for (const event of webhookEvents || []) {
      const raw = event.receivedAt as { toDate?: () => Date } | string | number | undefined;
      const stamp = typeof raw === "object" && raw && typeof raw.toDate === "function" ? raw.toDate() : raw;
      const ts = stamp ? new Date(stamp as string | number | Date).getTime() : 0;
      if (ts > latest) latest = ts;
    }
    return latest || null;
  }, [webhookEvents]);

  const awaitingApproval = minutesCounts.submitted;
  const drafts = minutesCounts.draft;
  const goalPercent = percentOf(stats.totalRaised, stats.goal);

  const triggerReconcile = async () => {
    setReconciling(true);
    try {
      const res = await fetch("/api/gfmpro/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: community.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      toast.success("Donation sync started.");
    } catch (err) {
      toast.error(`Couldn't sync donations: ${err instanceof Error ? err.message : "unknown error"}. Try again in a minute.`);
    } finally {
      setReconciling(false);
    }
  };

  const donationsLastUpdate = latestWebhookMs ? relativeTime(latestWebhookMs, now) : "never";
  const hasDonations = Boolean(stats.totalRaised || stats.donorCount);

  const toApproveHint = awaitingApproval
    ? drafts
      ? `Waiting for approval · ${plural(drafts, "draft")}`
      : "Waiting for approval"
    : drafts
      ? `Nothing waiting · ${plural(drafts, "draft")}`
      : "Nothing waiting";

  return (
    <div className="flex flex-col gap-6">
      <AdminPageHeader
        title="Dashboard"
        description={`Welcome back, ${firstName(adminName)}. ${community.name ? `Here is what is happening at ${community.name}.` : "Here is what is happening."}`}
        actions={
          <>
            <Button asChild>
              <Link href="/admin/minutes?mode=new">
                <Plus aria-hidden="true" />
                Write minutes
              </Link>
            </Button>
            <Button asChild variant="outline">
              <Link href="/admin/events/new">
                <CalendarPlus aria-hidden="true" />
                New event
              </Link>
            </Button>
          </>
        }
      />

      {loadWarning ? (
        <Alert variant="destructive">
          <AlertDescription>{loadWarning}</AlertDescription>
        </Alert>
      ) : null}
      {setup && setup.length > 0 ? <SiteSetupCard items={setup} /> : null}

      {/* Figures, with the one Donations card beside them. Before the first sync the two zero tiles fold into that card. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        {hasDonations ? (
          <>
            <AdminKpiCard
              label="Raised"
              value={formatMoney(stats.totalRaised)}
              icon={CircleDollarSign}
              className="col-span-2 md:col-span-1"
              progress={goalPercent}
              hint={goalPercent !== null ? `${goalPercent}% of the ${formatMoney(stats.goal)} goal` : "No fundraising goal from GoFundMe yet"}
            />
            <AdminKpiCard label="Donors" value={(stats.donorCount || 0).toLocaleString("en-US")} icon={UsersRound} hint={stats.donorCount ? "Given so far" : "Counted when donations sync"} />
          </>
        ) : null}
        <AdminKpiCard
          label="To approve"
          value={awaitingApproval}
          icon={NotebookPen}
          href={"/admin/minutes?mode=records" as Route}
          hint={toApproveHint}
          className={hasDonations ? undefined : "col-span-2 md:col-span-1"}
        />
        <AdminSectionCard
          title="Donations"
          description={hasDonations ? `Totals come from GoFundMe. Last update: ${donationsLastUpdate}.` : undefined}
          className={hasDonations ? "col-span-2 md:col-span-3" : "col-span-2 md:col-span-2"}
          actions={
            <Button variant="outline" onClick={triggerReconcile} loading={reconciling}>
              <RefreshCw aria-hidden="true" />
              Sync donations
            </Button>
          }
        >
          {hasDonations ? (
            <div className="flex items-start gap-3">
              <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${webhookEvents?.length ? "bg-success" : "bg-muted-foreground/40"}`} />
              <div className="min-w-0">
                <p className="text-sm text-foreground" suppressHydrationWarning>
                  {webhookEvents?.length ? `${plural(webhookEvents.length, "update")} from GoFundMe recently.` : "No updates from GoFundMe yet."}
                </p>
                <p className="text-sm text-muted-foreground">If a gift is missing from the totals, press Sync donations.</p>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No donations synced yet.</p>
          )}
        </AdminSectionCard>
      </div>

      {/* Tablets only: phones go straight from the figures to the recent lists, and from lg the sidebar already lists these pages. */}
      <section aria-labelledby="quick-actions-heading" className="hidden flex-col gap-3 md:flex lg:hidden">
        <div className="min-w-0">
          <h2 id="quick-actions-heading" className="text-lg font-semibold tracking-tight text-foreground">
            Quick actions
          </h2>
          <p className="text-sm text-muted-foreground">Jump into the tools you use most.</p>
        </div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-3">
          {QUICK_ACTIONS.map(action => (
            <AdminActionCard key={action.href} href={action.href} title={action.title} description={action.description} icon={action.icon} />
          ))}
        </div>
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <AdminSectionCard
          title="Recent minutes"
          description="The latest records, newest meeting first."
          actions={
            // One link at every width, in the header, so the list stays the card's last child and runs to its edge.
            recentMinutes.length ? <AllMinutesLink /> : null
          }
        >
          {recentMinutes.length === 0 ? (
            <EmptyNote>
              No minutes recorded yet.
              <Link href="/admin/minutes?mode=new" className="mt-2 block font-semibold text-primary hover:underline">
                Write your first minutes
              </Link>
            </EmptyNote>
          ) : (
            <AdminList bare label="Recent minutes">
              {recentMinutes.map(entry => {
                const badge = statusBadge("minutes", entry.status);
                return (
                  <AdminListRow
                    key={entry.id}
                    href={`/admin/minutes?minutesId=${encodeURIComponent(entry.id)}` as Route}
                    title={entry.eventTitle}
                    meta={<span suppressHydrationWarning>{`${entry.meetingType} · ${formatShortDate(entry.eventDate)}`}</span>}
                    badges={<Badge variant={badge.variant}>{badge.label}</Badge>}
                  />
                );
              })}
            </AdminList>
          )}
        </AdminSectionCard>

        <AdminSectionCard
          title="Recent activity"
          description="Who did what, most recent first."
          actions={
            <Button asChild variant="ghost" size="row">
              <Link href={"/admin/activity" as Route}>See all activity</Link>
            </Button>
          }
        >
          {recentAuditLogs.length === 0 ? (
            <EmptyNote>No activity yet.</EmptyNote>
          ) : (
            <ol className="relative flex flex-col gap-4 before:absolute before:top-2 before:bottom-2 before:left-[5px] before:w-px before:bg-border">
              {recentAuditLogs.map(log => {
                const sentence = activitySentence(log);
                return (
                  <li key={log.id} className="relative flex gap-3 pl-5">
                    <span aria-hidden="true" className="absolute top-1.5 left-0 size-[11px] rounded-full border-2 border-primary bg-card" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium break-words text-foreground">{sentence.text}</p>
                      {sentence.detail ? <p className="text-sm break-words text-muted-foreground">{sentence.detail}</p> : null}
                      {log.createdAtMs ? (
                        <p className="text-sm text-muted-foreground" suppressHydrationWarning title={formatDateTime(log.createdAtMs)}>
                          {relativeTime(log.createdAtMs, now)}
                        </p>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </AdminSectionCard>
      </div>
    </div>
  );
}
