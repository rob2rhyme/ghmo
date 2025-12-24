"use client";

import { useState } from "react";

type AdminDashboardProps = {
  community: any;
  stats: any;
  webhookEvents: any[];
  auditLogs: any[];
  blocks: any[];
  timeline: any[];
};

export default function AdminDashboardClient({ community, stats, webhookEvents, auditLogs, blocks, timeline }: AdminDashboardProps) {
  const [blockText, setBlockText] = useState(JSON.stringify(blocks, null, 2));
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [timelineForm, setTimelineForm] = useState({ title: "", body: "" });
  const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<string | null>(null);

  const saveBlocks = async () => {
    try {
      setSaveStatus("Saving...");
      const parsed = JSON.parse(blockText);
      await fetch("/api/admin/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ blocks: parsed })
      });
      setSaveStatus("Saved");
    } catch (err: any) {
      setSaveStatus(`Error: ${err.message}`);
    }
  };

  const createTimeline = async () => {
    try {
      setTimelineStatus("Saving...");
      await fetch("/api/admin/timeline", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...timelineForm })
      });
      setTimelineStatus("Created entry");
      setTimelineForm({ title: "", body: "" });
    } catch (err: any) {
      setTimelineStatus(`Error: ${err.message}`);
    }
  };

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
    <div className="space-y-6">
      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Admin Dashboard</h1>
            <p className="text-sm text-slate-600">{community.name}</p>
          </div>
          <button
            onClick={triggerReconcile}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Manual Reconcile
          </button>
        </div>
        {reconcileStatus ? <p className="mt-2 text-sm text-slate-600">{reconcileStatus}</p> : null}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <StatCard label="Raised" value={`$${(stats.totalRaised || 0).toLocaleString()}`} />
          <StatCard label="Goal" value={`$${(stats.goal || 0).toLocaleString()}`} />
          <StatCard label="Donors" value={stats.donorCount || 0} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Home Content Blocks</h2>
            <button
              onClick={saveBlocks}
              className="rounded-md border border-primary px-3 py-1 text-sm font-semibold text-primary hover:bg-primary/10"
            >
              Save
            </button>
          </div>
          <textarea
            className="h-64 w-full rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs"
            value={blockText}
            onChange={e => setBlockText(e.target.value)}
          />
          {saveStatus ? <p className="text-xs text-slate-600">{saveStatus}</p> : null}
        </div>

        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Create Timeline Entry</h2>
          <input
            placeholder="Title"
            value={timelineForm.title}
            onChange={e => setTimelineForm(prev => ({ ...prev, title: e.target.value }))}
            className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
          <textarea
            placeholder="Body"
            value={timelineForm.body}
            onChange={e => setTimelineForm(prev => ({ ...prev, body: e.target.value }))}
            className="h-32 w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
          <button
            onClick={createTimeline}
            className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
          >
            Add Entry
          </button>
          {timelineStatus ? <p className="text-xs text-slate-600">{timelineStatus}</p> : null}
          <div className="mt-3 space-y-2">
            {timeline.map(item => (
              <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-semibold">{item.title}</span>
                  <span className="text-xs text-slate-500">{item.timestamp ? new Date(item.timestamp.toDate?.() || item.timestamp).toLocaleString() : ""}</span>
                </div>
                <p className="text-xs text-slate-700">{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Webhook Events</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {webhookEvents.length === 0 ? <li className="text-slate-500">No webhook events yet.</li> : null}
            {webhookEvents.map(evt => (
              <li key={evt.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{evt.type || "event"}</span>
                  <span className="text-xs text-slate-500">{evt.receivedAt ? new Date(evt.receivedAt.toDate?.() || evt.receivedAt).toLocaleString() : ""}</span>
                </div>
                <p className="text-xs text-slate-600 break-words">{evt.event_id}</p>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold">Audit Logs</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {auditLogs.length === 0 ? <li className="text-slate-500">No audit logs yet.</li> : null}
            {auditLogs.map(log => (
              <li key={log.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{log.type}</span>
                  <span className="text-xs text-slate-500">{log.timestamp ? new Date(log.timestamp.toDate?.() || log.timestamp).toLocaleString() : ""}</span>
                </div>
                <p className="text-xs text-slate-600">Actor: {log.actorUid || "n/a"} | Role: {log.role}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-md border border-slate-100 bg-slate-50 px-4 py-3">
      <p className="text-xs uppercase text-slate-600">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
