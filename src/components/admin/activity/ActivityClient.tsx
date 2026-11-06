"use client";

import type { Route } from "next";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Download, History, RefreshCw } from "lucide-react";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { SearchInput } from "@/src/components/ui/search-input";
import { Select } from "@/src/components/ui/select";
import { Skeleton } from "@/src/components/ui/skeleton";
import { ACTIVITY_AREAS, AREA_LABELS, type ActivityArea, type Change } from "@/src/lib/activityLog";
import { formatDateTime } from "@/src/lib/format";

type Entry = {
  id: string;
  createdAtMs: number | null;
  action: string;
  area: ActivityArea;
  text: string;
  detail?: string;
  person: string;
  role: string | null;
  changes: Change[];
  href: string | null;
  device?: { ip: string | null; userAgent: string | null };
};
type Person = { uid: string; name: string; active: boolean };
type Filters = { person: string; area: string; from: string; to: string };

const ROLE_WORDS: Record<string, string> = { super_admin: "Super admin", admin: "Admin", system: "System" };
const EMPTY: Filters = { person: "", area: "", from: "", to: "" };

const query = (filters: Filters, beforeMs?: number | null) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) if (value) params.set(key, value);
  if (beforeMs) params.set("before", String(beforeMs));
  const text = params.toString();
  return text ? `?${text}` : "";
};

/**
 * The whole activity log (plan §29, Phase 22): newest first, 50 at a time, by person, area and dates; each entry opens
 * to show what changed and a link to the record. Super admins also see the internet address and browser, and can
 * download what the filters show. The log is never changed from here.
 */
export default function ActivityClient() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [nextBeforeMs, setNextBeforeMs] = useState<number | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [superAdmin, setSuperAdmin] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [text, setText] = useState("");
  const [attempt, setAttempt] = useState(0);

  const fetchPage = useCallback(async (current: Filters, beforeMs?: number | null) => {
    const res = await fetch(`/api/admin/activity${query(current, beforeMs)}`, { cache: "no-store" });
    const data = (await res.json().catch(() => ({}))) as { entries?: Entry[]; nextBeforeMs?: number | null; people?: Person[]; superAdmin?: boolean; error?: string };
    if (!res.ok || !data.entries) throw new Error(data.error || "The activity log couldn't be loaded. Try again.");
    return data;
  }, []);

  useEffect(() => {
    let cancelled = false;
    fetchPage(filters)
      .then(data => {
        if (cancelled) return;
        setEntries(data.entries ?? []);
        setNextBeforeMs(data.nextBeforeMs ?? null);
        if (data.people) setPeople(data.people);
        setSuperAdmin(Boolean(data.superAdmin));
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "The activity log couldn't be loaded. Try again.");
      });
    return () => {
      cancelled = true;
    };
  }, [filters, fetchPage, attempt]);

  const change = (patch: Partial<Filters>) => {
    setEntries(null);
    setOpen(new Set());
    setFilters(current => ({ ...current, ...patch }));
  };

  const loadOlder = async () => {
    setLoadingMore(true);
    try {
      const data = await fetchPage(filters, nextBeforeMs);
      setEntries(current => [...(current ?? []), ...(data.entries ?? [])]);
      setNextBeforeMs(data.nextBeforeMs ?? null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't load older entries.");
    } finally {
      setLoadingMore(false);
    }
  };

  const download = async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/activity/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)))
      });
      if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "The download didn't work. Try again.");
      const url = URL.createObjectURL(await res.blob());
      const link = document.createElement("a");
      link.href = url;
      link.download = `ghmo-activity-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success("Downloaded. The download is recorded in the activity log.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "The download didn't work. Try again.");
    } finally {
      setDownloading(false);
    }
  };

  const needle = text.trim().toLowerCase();
  const shown = useMemo(
    () => (entries ?? []).filter(entry => !needle || `${entry.text} ${entry.detail ?? ""} ${entry.person}`.toLowerCase().includes(needle)),
    [entries, needle]
  );
  const filtered = Object.values(filters).some(Boolean);
  const toggle = (id: string) =>
    setOpen(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div className="flex flex-col gap-6">
      <AdminSectionCard
        title="Find entries"
        icon={<History aria-hidden="true" />}
        description="Every change in the admin area is recorded here, newest first. Nothing in it can be changed or deleted."
        actions={
          superAdmin ? (
            <Button variant="outline" size="row" loading={downloading} onClick={() => void download()}>
              <Download aria-hidden="true" /> Download CSV
            </Button>
          ) : undefined
        }
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Person">
            <Select value={filters.person} onChange={e => change({ person: e.target.value })}>
              <option value="">Everyone</option>
              {people.map(person => (
                <option key={person.uid} value={person.uid}>
                  {person.name}
                  {person.active ? "" : " (turned off)"}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Area">
            <Select value={filters.area} onChange={e => change({ area: e.target.value })}>
              <option value="">All areas</option>
              {ACTIVITY_AREAS.map(area => (
                <option key={area} value={area}>
                  {AREA_LABELS[area]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="From">
            <Input type="date" value={filters.from} max={filters.to || undefined} onChange={e => change({ from: e.target.value })} />
          </Field>
          <Field label="To">
            <Input type="date" value={filters.to} min={filters.from || undefined} onChange={e => change({ to: e.target.value })} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <SearchInput aria-label="Narrow what's shown" placeholder="Narrow what's shown by a word" value={text} onChange={setText} className="sm:max-w-xs" />
          {filtered ? (
            <Button variant="ghost" size="row" onClick={() => change(EMPTY)}>
              Clear filters
            </Button>
          ) : null}
        </div>
      </AdminSectionCard>

      {error ? (
        <Alert variant="destructive">
          <AlertDescription>
            <p>{error}</p>
            <Button className="mt-3" variant="outline" onClick={() => setAttempt(n => n + 1)}>
              <RefreshCw aria-hidden="true" /> Try again
            </Button>
          </AlertDescription>
        </Alert>
      ) : entries === null ? (
        <div role="status">
          <span className="sr-only">Loading the activity log…</span>
          <Skeleton className="h-40 w-full rounded-xl" />
        </div>
      ) : shown.length === 0 ? (
        <EmptyState
          icon={<History aria-hidden="true" />}
          title={entries.length === 0 ? (filtered ? "Nothing matches these filters" : "No activity yet") : "No entry has that word"}
          description={entries.length === 0 && filtered ? "Try another person, area or dates, or clear the filters." : "Changes made in the admin area show here."}
        />
      ) : (
        <ul aria-label="Activity" className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
          {shown.map(entry => {
            const isOpen = open.has(entry.id);
            return (
              <li key={entry.id} className="flex flex-col gap-2 p-3" data-testid="activity-entry">
                <button type="button" className="flex min-h-11 w-full items-start gap-3 text-left" aria-expanded={isOpen} onClick={() => toggle(entry.id)}>
                  {isOpen ? <ChevronDown aria-hidden="true" className="mt-0.5 size-4 shrink-0" /> : <ChevronRight aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                  <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <span className="font-medium break-words">{entry.text}</span>
                    {entry.detail ? <span className="text-sm text-muted-foreground break-words">{entry.detail}</span> : null}
                    <span className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      {entry.createdAtMs ? <time dateTime={new Date(entry.createdAtMs).toISOString()}>{formatDateTime(entry.createdAtMs)}</time> : null}
                      <Badge variant="outline">{AREA_LABELS[entry.area]}</Badge>
                      {entry.role ? <span>{ROLE_WORDS[entry.role] ?? entry.role}</span> : null}
                    </span>
                  </span>
                </button>
                {isOpen ? (
                  <div className="ml-7 flex flex-col gap-2 text-sm">
                    {entry.changes.length > 0 ? (
                      <table className="w-full text-left">
                        <caption className="sr-only">What changed</caption>
                        <thead className="text-xs text-muted-foreground">
                          <tr>
                            <th scope="col" className="py-1 pr-3 font-medium">What</th>
                            <th scope="col" className="py-1 pr-3 font-medium">Before</th>
                            <th scope="col" className="py-1 font-medium">After</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.changes.map(item => (
                            <tr key={item.field} className="align-top">
                              <td className="py-1 pr-3 text-muted-foreground">{item.field}</td>
                              <td className="py-1 pr-3 break-all">{item.before || "—"}</td>
                              <td className="py-1 break-all">{item.after || "—"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className="text-muted-foreground">No field-by-field details were recorded for this entry.</p>
                    )}
                    {entry.href ? (
                      <Link href={entry.href as Route} className="w-fit font-medium text-primary underline-offset-4 hover:underline">
                        Open the record
                      </Link>
                    ) : null}
                    {entry.device ? (
                      <p className="text-xs text-muted-foreground" data-testid="activity-device">
                        From {entry.device.ip || "an unknown address"}
                        {entry.device.userAgent ? ` · ${entry.device.userAgent}` : ""}
                      </p>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {entries && nextBeforeMs ? (
        <Button variant="outline" className="w-fit" loading={loadingMore} onClick={() => void loadOlder()}>
          Load older
        </Button>
      ) : null}
    </div>
  );
}
