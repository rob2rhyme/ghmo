"use client";

import { useState } from "react";
import { COMMUNITY_SLUG } from "@/src/lib/community";

type AdminDashboardProps = {
  community: any;
  stats: any;
  webhookEvents: any[];
  auditLogs: any[];
  blocks: any[];
  timeline: {
    id: string;
    title?: string;
    body?: string;
    timestamp?: number | null;
    tags?: string[];
  }[];
};

export default function AdminDashboardClient({ community, stats, webhookEvents, auditLogs, blocks, timeline }: AdminDashboardProps) {
  const [blockText, setBlockText] = useState(JSON.stringify(blocks, null, 2));
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const [timelineForm, setTimelineForm] = useState({ title: "", body: "" });
  const [timelineStatus, setTimelineStatus] = useState<string | null>(null);
  const [reconcileStatus, setReconcileStatus] = useState<string | null>(null);
  const [timelineEntries, setTimelineEntries] = useState(timeline);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ title: "", body: "" });
  const [editStatus, setEditStatus] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

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
      setTimelineEntries(prev => [{ id: crypto.randomUUID(), ...timelineForm, timestamp: Date.now() }, ...prev]);
    } catch (err: any) {
      setTimelineStatus(`Error: ${err.message}`);
    }
  };

  const startEdit = (entry: AdminDashboardProps["timeline"][number]) => {
    setEditingId(entry.id);
    setEditForm({ title: entry.title || "", body: entry.body || "" });
    setEditStatus(null);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditForm({ title: "", body: "" });
    setEditStatus(null);
  };

  const saveEdit = async (id: string) => {
    try {
      setEditStatus("Saving...");
      if (!editForm.title.trim()) throw new Error("Title is required");
      const res = await fetch(`/api/admin/timeline`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, title: editForm.title, body: editForm.body })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to save");
      const updatedItem = data.item || {};
      setTimelineEntries(prev =>
        prev.map(item =>
          item.id === id ? { ...item, ...updatedItem, timestamp: updatedItem.timestamp ?? item.timestamp } : item
        )
      );
      setEditingId(null);
      setEditStatus("Saved");
    } catch (err: any) {
      setEditStatus(`Error: ${err.message}`);
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
          <div className="flex gap-2">
            <a
              href="/admin/events"
              className="rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-primary/50"
            >
              Events
            </a>
            <button
              onClick={triggerReconcile}
              className="rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white hover:bg-primary/90"
            >
              Manual Reconcile
            </button>
          </div>
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
            {timelineEntries.map(item => (
              <div key={item.id} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                <div className="flex items-start justify-between gap-2 text-sm">
                  <div className="flex-1">
                    {editingId === item.id ? (
                      <>
                        <input
                          className="mb-2 w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                          value={editForm.title}
                          onChange={e => setEditForm(prev => ({ ...prev, title: e.target.value }))}
                        />
                        <textarea
                          className="w-full rounded-md border border-slate-200 px-2 py-1 text-sm"
                          value={editForm.body}
                          onChange={e => setEditForm(prev => ({ ...prev, body: e.target.value }))}
                        />
                      </>
                    ) : (
                      <>
                        <span className="font-semibold">{item.title}</span>
                        {item.body ? (
                          <p
                            className={`text-xs text-slate-700 ${expanded[item.id] ? "" : "line-clamp-2"}`}
                          >
                            {item.body}
                          </p>
                        ) : null}
                        {item.body && item.body.length > 80 ? (
                          <button
                            className="mt-1 text-xs font-semibold text-primary"
                            onClick={() => setExpanded(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                          >
                            {expanded[item.id] ? "View less" : "View more"}
                          </button>
                        ) : null}
                      </>
                    )}
                  </div>
                  <div className="text-right text-xs text-slate-500 whitespace-nowrap">
                    {item.timestamp ? new Date(item.timestamp).toLocaleString() : ""}
                  </div>
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  {editingId === item.id ? (
                    <>
                      <button
                        onClick={() => saveEdit(item.id)}
                        className="rounded-md bg-primary px-2 py-1 font-semibold text-white hover:bg-primary/90"
                      >
                        Save
                      </button>
                      <button
                        onClick={cancelEdit}
                        className="rounded-md border border-slate-300 px-2 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => startEdit(item)}
                      className="rounded-md bg-primary px-2 py-1 font-semibold text-white hover:bg-primary/90"
                    >
                      Edit
                    </button>
                  )}
                </div>
              </div>
            ))}
            {editStatus ? <p className="text-xs text-slate-600">{editStatus}</p> : null}
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
                  <span className="font-semibold">{log.summary || log.type}</span>
                  <span className="text-xs text-slate-500">
                    {log.createdAtMs ? new Date(log.createdAtMs).toLocaleString() : ""}
                  </span>
                </div>
                <p className="text-xs text-slate-600">Actor: {log.actorUid || "n/a"} | Role: {log.role || "n/a"}</p>
                {log.metadata && (log.metadata.eventId || log.metadata.timelineId || log.metadata.action) ? (
                  <p className="text-xs text-slate-500">
                    {log.metadata.eventId ? `Event: ${log.metadata.eventId} ` : ""}
                    {log.metadata.timelineId ? `Timeline: ${log.metadata.timelineId} ` : ""}
                    {log.metadata.action ? `Action: ${log.metadata.action}` : ""}
                  </p>
                ) : null}
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
