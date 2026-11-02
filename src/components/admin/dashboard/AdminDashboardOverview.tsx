"use client";

import type { Route } from "next";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
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
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import AdminCommandPalette from "@/src/components/admin/dashboard/AdminCommandPalette";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { MeetingMinutesRecord, minutesStatusLabels, type MinutesStatus } from "@/src/lib/minutes";
import { activitySentence, firstName, formatMoney, formatShortDate, percentOf, relativeTime } from "@/src/lib/adminView";
import { formatDateTime } from "@/src/lib/format";

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
  minutes: MeetingMinutesRecord[];
  auditLogs: AuditLogView[];
  webhookEvents: WebhookEventView[];
};

const MINUTES_BADGE: Record<MinutesStatus, "secondary" | "warning" | "success"> = {
  draft: "secondary",
  submitted: "warning",
  approved: "success"
};

const QUICK_ACTIONS: { href: Route; title: string; description: string; icon: LucideIcon }[] = [
  { href: "/admin/minutes" as Route, title: "Meeting Minutes", description: "Draft, approve and export minutes.", icon: NotebookPen },
  { href: "/admin/action-items" as Route, title: "Action Items", description: "Follow up on what was agreed.", icon: ListChecks },
  { href: "/admin/events" as Route, title: "Events", description: "Manage upcoming and past events.", icon: CalendarDays },
  { href: "/admin/document-generator" as Route, title: "Document Generator", description: "Create formatted letters quickly.", icon: FileSignature },
  { href: "/admin/document-gallery" as Route, title: "Document Gallery", description: "Browse saved PDF documents.", icon: FolderOpen },
  { href: "/admin/gumba-project" as Route, title: "GUMBA Project", description: "Track project updates and tasks.", icon: Landmark }
];

function EmptyNote({ children }: { children: ReactNode }) {
  return <div className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-sm text-muted-foreground">{children}</div>;
}

export default function AdminDashboardOverview({ community, adminName, stats, minutes, auditLogs, webhookEvents }: AdminDashboardOverviewProps) {
  const [reconcileStatus, setReconcileStatus] = useState<{ tone: "info" | "error"; text: string } | null>(null);
  const [reconciling, setReconciling] = useState(false);
  const [query, setQuery] = useState("");
  const [now] = useState(() => Date.now());
  const inputRef = useRef<HTMLInputElement>(null);

  // "/" jumps to the filter, Escape clears it (Ctrl/⌘ K is the page-jump search in the shell).
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
      if (event.key === "/" && !typing && !event.metaKey && !event.ctrlKey) {
        event.preventDefault();
        inputRef.current?.focus();
      }
      if (event.key === "Escape") {
        if (query) {
          event.preventDefault();
          setQuery("");
        } else if (document.activeElement === inputRef.current) {
          inputRef.current?.blur();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [query]);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredQuickActions = useMemo(() => {
    if (!normalizedQuery) return QUICK_ACTIONS;
    return QUICK_ACTIONS.filter(action => `${action.title} ${action.description}`.toLowerCase().includes(normalizedQuery));
  }, [normalizedQuery]);

  const recentMinutes = useMemo(() => {
    const sorted = [...(minutes || [])].sort((a, b) => (b.eventDate || 0) - (a.eventDate || 0));
    const filtered = normalizedQuery
      ? sorted.filter(entry => {
          const haystack = [
            entry.eventTitle,
            entry.meetingType,
            entry.recordedBy,
            ...(entry.agenda || []),
            ...(entry.decisions || []),
            ...(entry.actionItems || []).map(item => item.task)
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : sorted;
    return filtered.slice(0, 5);
  }, [minutes, normalizedQuery]);

  const recentAuditLogs = useMemo(() => {
    const sorted = [...(auditLogs || [])].sort((a, b) => (b.createdAtMs || 0) - (a.createdAtMs || 0));
    const filtered = normalizedQuery
      ? sorted.filter(log => {
          const sentence = activitySentence(log);
          const haystack = [sentence.text, sentence.detail, log.type, log.action, log.metadata?.action]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : sorted;
    return filtered.slice(0, 8);
  }, [auditLogs, normalizedQuery]);

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

  const awaitingApproval = (minutes || []).filter(entry => entry.status === "submitted").length;
  const drafts = (minutes || []).filter(entry => entry.status === "draft").length;
  const goalPercent = percentOf(stats.totalRaised, stats.goal);

  const triggerReconcile = async () => {
    setReconciling(true);
    setReconcileStatus({ tone: "info", text: "Syncing donations…" });
    try {
      const res = await fetch("/api/gfmpro/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: community.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setReconcileStatus({ tone: "info", text: "Donation sync started." });
    } catch (err) {
      setReconcileStatus({ tone: "error", text: `Could not sync: ${err instanceof Error ? err.message : "unknown error"}` });
    } finally {
      setReconciling(false);
    }
  };

  const donationsLastUpdate = latestWebhookMs ? relativeTime(latestWebhookMs, now) : "never";

  return (
    <div className="flex flex-col gap-6 md:gap-8">
      <AdminPageHeader
        title="Dashboard"
        description={`Welcome back, ${firstName(adminName)}. ${community.name ? `Here is what is happening at ${community.name}.` : "Here is what is happening."}`}
        actions={
          <div className="flex flex-nowrap gap-2">
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
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-4">
        <AdminKpiCard
          label="Raised"
          value={formatMoney(stats.totalRaised)}
          icon={CircleDollarSign}
          className="col-span-2 md:col-span-1"
          progress={goalPercent}
          hint={
            goalPercent !== null
              ? `${goalPercent}% of the ${formatMoney(stats.goal)} goal`
              : stats.totalRaised
                ? "No fundraising goal from GoFundMe yet"
                : "No donations recorded yet"
          }
          action={
            goalPercent === null ? (
              <a href="#donations" className="font-medium text-primary underline-offset-4 hover:underline">
                Sync from GoFundMe
              </a>
            ) : null
          }
        />
        <AdminKpiCard
          label="Donors"
          value={(stats.donorCount || 0).toLocaleString("en-US")}
          icon={UsersRound}
          hint={stats.donorCount ? "Given so far" : "Counted when donations sync"}
        />
        <AdminKpiCard
          label="To approve"
          value={awaitingApproval}
          icon={NotebookPen}
          href={"/admin/minutes?mode=records" as Route}
          hint={
            awaitingApproval
              ? `Minutes waiting${drafts ? ` · ${drafts} in draft` : ""}`
              : drafts
                ? `Nothing waiting · ${drafts} in draft`
                : "Nothing waiting. Open the records"
          }
        />
      </div>

      <section aria-labelledby="quick-actions-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 id="quick-actions-heading" className="text-lg font-semibold tracking-tight text-foreground">
              Quick actions
            </h2>
            <p className="text-sm text-muted-foreground">Jump into the tools you use most.</p>
          </div>
          <div className="w-full sm:w-72">
            <AdminCommandPalette value={query} onChange={setQuery} onClear={() => setQuery("")} inputRef={inputRef} />
          </div>
        </div>
        {filteredQuickActions.length === 0 ? (
          <EmptyNote>No quick actions match your filter.</EmptyNote>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-3">
            {filteredQuickActions.map(action => (
              <AdminActionCard key={action.href} href={action.href} title={action.title} description={action.description} icon={action.icon} />
            ))}
          </div>
        )}
      </section>

      <div className="grid items-start gap-6 lg:grid-cols-2">
        <AdminSectionCard
          title="Recent minutes"
          description="Latest records ready for approval or export."
          actions={
            <Button asChild variant="ghost">
              <Link href="/admin/minutes?mode=records">View all</Link>
            </Button>
          }
        >
          {recentMinutes.length === 0 ? (
            <EmptyNote>
              {normalizedQuery ? "No minutes match your filter." : "No minutes recorded yet."}
              {!normalizedQuery ? (
                <Link href="/admin/minutes?mode=new" className="mt-2 block font-semibold text-primary hover:underline">
                  Write your first minutes
                </Link>
              ) : null}
            </EmptyNote>
          ) : (
            <ul className="-mx-2 flex flex-col">
              {recentMinutes.map(entry => (
                <li key={entry.id}>
                  <Link
                    href={"/admin/minutes?mode=records" as Route}
                    className="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 py-3 transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-semibold text-foreground">{entry.eventTitle}</span>
                      <span className="block text-sm text-muted-foreground" suppressHydrationWarning>
                        {entry.meetingType} · {formatShortDate(entry.eventDate)}
                      </span>
                    </span>
                    <Badge variant={MINUTES_BADGE[entry.status]}>{minutesStatusLabels[entry.status]}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </AdminSectionCard>

        <AdminSectionCard title="Recent activity" description="Who did what, most recent first.">
          {recentAuditLogs.length === 0 ? (
            <EmptyNote>{normalizedQuery ? "No activity matches your filter." : "No activity yet."}</EmptyNote>
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

      <section id="donations" className="scroll-mt-24">
        <AdminSectionCard
          title="Donations"
          description={`Totals come from GoFundMe. Last update: ${donationsLastUpdate}.`}
          actions={
            <Button variant="outline" onClick={triggerReconcile} loading={reconciling}>
              <RefreshCw aria-hidden="true" />
              Sync donations
            </Button>
          }
        >
          <div className="flex items-start gap-3">
            <span
              aria-hidden="true"
              className={`mt-1.5 size-2.5 shrink-0 rounded-full ${webhookEvents?.length ? "bg-success" : "bg-muted-foreground/40"}`}
            />
            <div className="min-w-0">
              <p className="text-sm text-foreground" suppressHydrationWarning>
                {webhookEvents?.length
                  ? `${webhookEvents.length} ${webhookEvents.length === 1 ? "update" : "updates"} from GoFundMe recently.`
                  : "No updates from GoFundMe yet."}
              </p>
              <p className="text-sm text-muted-foreground">If a gift is missing from the totals, press Sync donations.</p>
              {reconcileStatus ? (
                <p role="status" className={`mt-1 text-sm ${reconcileStatus.tone === "error" ? "font-medium text-destructive" : "text-muted-foreground"}`}>
                  {reconcileStatus.text}
                </p>
              ) : null}
            </div>
          </div>
        </AdminSectionCard>
      </section>
    </div>
  );
}
