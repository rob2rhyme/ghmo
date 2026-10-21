"use client";

import type { Route } from "next";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import AdminActionCard from "@/src/components/admin/AdminActionCard";
import AdminKpiCard from "@/src/components/admin/AdminKpiCard";
import AdminPageHeader from "@/src/components/admin/AdminPageHeader";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import AdminCommandPalette from "@/src/components/admin/dashboard/AdminCommandPalette";
import { MeetingMinutesRecord, minutesStatusLabels, minutesStatusPillClasses } from "@/src/lib/minutes";
import { IconEvents, IconGallery, IconGenerator, IconGumba, IconMinutes } from "@/src/components/admin/icons/AdminIcons";
import { resolveActorLabel } from "@/src/lib/actor";

type AdminDashboardOverviewProps = {
  community: { id: string; name?: string };
  stats: { totalRaised?: number; goal?: number; donorCount?: number };
  minutes: MeetingMinutesRecord[];
  auditLogs: any[];
  webhookEvents: any[];
};

export default function AdminDashboardOverview({
  community,
  stats,
  minutes,
  auditLogs,
  webhookEvents
}: AdminDashboardOverviewProps) {
  const [reconcileStatus, setReconcileStatus] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const isMac = navigator.platform.toLowerCase().includes("mac");
      const isShortcut = isMac ? event.metaKey : event.ctrlKey;
      if (isShortcut && event.key.toLowerCase() === "k") {
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

  const quickActions = useMemo(
    () => [
      {
        href: "/admin/minutes" as Route,
        title: "Meeting Minutes",
        description: "Draft, approve, and export minutes.",
        icon: <IconMinutes />
      },
      {
        href: "/admin/events" as Route,
        title: "Events",
        description: "Manage upcoming and past events.",
        icon: <IconEvents />
      },
      {
        href: "/admin/document-generator" as Route,
        title: "Document Generator",
        description: "Create formatted letters quickly.",
        icon: <IconGenerator />
      },
      {
        href: "/admin/document-gallery" as Route,
        title: "Document Gallery",
        description: "Browse saved PDF assets.",
        icon: <IconGallery />
      },
      {
        href: "/admin/gumba-project" as Route,
        title: "GUMBA Project",
        description: "Track project updates and tasks.",
        icon: <IconGumba />
      }
    ],
    []
  );

  const filteredQuickActions = useMemo(() => {
    if (!normalizedQuery) return quickActions;
    return quickActions.filter(action => {
      const haystack = `${action.title} ${action.description}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, quickActions]);

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
          const haystack = [
            log.summary,
            log.type,
            log.actorUid,
            log.role,
            log.metadata?.action
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(normalizedQuery);
        })
      : sorted;
    return filtered.slice(0, 8);
  }, [auditLogs, normalizedQuery]);
  const latestWebhookEvent = useMemo(() => {
    if (!webhookEvents?.length) return null;
    return webhookEvents.reduce((latest, event) => {
      const stamp = event.receivedAt?.toDate?.() || event.receivedAt;
      const ts = stamp ? new Date(stamp).getTime() : 0;
      if (!latest) return { event, ts };
      return ts > latest.ts ? { event, ts } : latest;
    }, null as null | { event: any; ts: number });
  }, [webhookEvents]);

  const triggerReconcile = async () => {
    try {
      setReconcileStatus("Reconciling...");
      const res = await fetch("/api/gfmpro/reconcile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ communityId: community.id })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed");
      setReconcileStatus("Reconcile triggered");
    } catch (err: any) {
      setReconcileStatus(`Error: ${err.message}`);
    }
  };

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 px-4 py-6">
      <AdminPageHeader
        title="Dashboard"
        description={community.name ? `Welcome back to ${community.name}.` : "Monitor key metrics and admin activity."}
        actions={
          <>
            <Link
              href="/admin/minutes?mode=new"
              className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-primary/90"
            >
              Create Minutes
            </Link>
            <Link
              href="/admin/events/new"
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground/80 transition hover:border-primary hover:text-foreground"
            >
              New Event
            </Link>
            <button
              type="button"
              onClick={triggerReconcile}
              className="rounded-full border border-border px-4 py-2 text-sm font-semibold text-muted-foreground transition hover:border-primary hover:text-foreground"
            >
              Manual Reconcile
            </button>
          </>
        }
      />

      <AdminCommandPalette
        value={query}
        onChange={setQuery}
        onClear={() => setQuery("")}
        inputRef={inputRef}
      />

      {reconcileStatus ? <p className="text-sm text-muted-foreground">{reconcileStatus}</p> : null}

      <div className="grid gap-4 md:grid-cols-3">
        <AdminKpiCard label="Raised" value={`$${(stats.totalRaised || 0).toLocaleString()}`} />
        <AdminKpiCard label="Goal" value={`$${(stats.goal || 0).toLocaleString()}`} />
        <AdminKpiCard label="Donors" value={stats.donorCount || 0} />
      </div>

      <AdminSectionCard
        title="Quick Actions"
        description="Jump into the tools you use most."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {filteredQuickActions.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center sm:col-span-2 lg:col-span-5">
              <p className="text-sm text-muted-foreground">No quick actions match your search.</p>
            </div>
          ) : (
            filteredQuickActions.map(action => (
              <AdminActionCard
                key={action.href}
                href={action.href}
                title={action.title}
                description={action.description}
                icon={action.icon}
              />
            ))
          )}
        </div>
      </AdminSectionCard>

      <div className="grid gap-6 lg:grid-cols-2">
        <AdminSectionCard
          title="Recent Minutes"
          description="Latest records ready for approval or export."
          actions={
            <Link href="/admin/minutes?mode=records" className="text-sm font-semibold text-primary">
              View all
            </Link>
          }
        >
          {recentMinutes.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {normalizedQuery ? "No minutes match your search." : "No minutes recorded yet."}
              </p>
              {!normalizedQuery ? (
                <Link href="/admin/minutes?mode=new" className="mt-2 inline-block text-sm font-semibold text-primary">
                  Create your first minutes
                </Link>
              ) : null}
            </div>
          ) : (
            <div className="space-y-3">
              {recentMinutes.map(entry => (
                <div key={entry.id} className="flex items-start justify-between gap-3 rounded-xl border border-border bg-background px-4 py-3">
                  <div>
                    <p className="text-sm font-semibold text-foreground">{entry.eventTitle}</p>
                    <p className="text-xs text-muted-foreground">
                      {entry.meetingType} • {entry.eventDate ? new Date(entry.eventDate).toLocaleString() : "Date unavailable"}
                    </p>
                  </div>
                  <span
                    className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase ${minutesStatusPillClasses[entry.status]}`}
                  >
                    {minutesStatusLabels[entry.status]}
                  </span>
                </div>
              ))}
            </div>
          )}
        </AdminSectionCard>

        <AdminSectionCard
          title="Recent Audit Activity"
          description="Latest admin changes and approvals."
          actions={
            <Link href="/admin" className="text-sm font-semibold text-primary">
              View all
            </Link>
          }
        >
          {recentAuditLogs.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-background px-4 py-6 text-center">
              <p className="text-sm text-muted-foreground">
                {normalizedQuery ? "No audit activity matches your search." : "No audit activity yet."}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentAuditLogs.map(log => (
                <div key={log.id} className="rounded-xl border border-border bg-background px-4 py-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{log.summary || log.type}</p>
                    <span className="text-xs text-muted-foreground">{formatTimestamp(log.createdAtMs)}</span>
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Actor: {resolveActorLabel(log.actor ?? { role: log.role })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </AdminSectionCard>
      </div>

      <AdminSectionCard
        title="Integrations & System Status"
        description="Sync donors and review webhook health."
        actions={
          <button
            type="button"
            onClick={triggerReconcile}
            className="rounded-full border border-border px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground transition hover:border-primary hover:text-foreground"
          >
            Manual Reconcile
          </button>
        }
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-border bg-background px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Webhook events</p>
            <p className="mt-2 text-sm text-foreground/80">
              {webhookEvents?.length ? `${webhookEvents.length} received` : "No recent webhook activity"}
            </p>
            {latestWebhookEvent?.ts ? (
              <p className="mt-1 text-xs text-muted-foreground">
                Last received {new Date(latestWebhookEvent.ts).toLocaleString()}
              </p>
            ) : null}
          </div>
          <div className="rounded-xl border border-border bg-background px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Manual reconcile</p>
            <p className="mt-2 text-sm text-foreground/80">Trigger a donation sync when needed.</p>
            {reconcileStatus ? <p className="mt-1 text-xs text-muted-foreground">{reconcileStatus}</p> : null}
          </div>
        </div>
      </AdminSectionCard>
    </div>
  );
}

function formatTimestamp(value?: number) {
  return value ? new Date(value).toLocaleString() : "Date unavailable";
}
