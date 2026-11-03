"use client";

import { CheckCircle2, ChevronDown, ShieldAlert } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { AREA_LABELS, MIGRATION_AREAS, locationFor, type MigrationArea, type MigrationItem } from "@/src/lib/e2eeMigration";
import { errorText } from "./UnlockCard";

type Progress = { done: number; total: number; failed: string[] };

const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function postSwap(item: MigrationItem, enc: unknown) {
  const res = await fetch("/api/admin/e2ee/migrate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ area: item.area, id: item.id, parentId: item.parentId, updateTime: item.updateTime, enc })
  });
  if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error || "Request failed");
}

/**
 * Encrypts records created before encryption was turned on. Each one is encrypted here,
 * decrypted again to prove it matches, and only then replaced on the server.
 */
export function MigrationSection() {
  const { encrypt, decrypt } = useE2ee();
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<Partial<Record<MigrationArea, Progress>>>({});

  /** Returns how many records in the area could not be encrypted. */
  const migrateArea = async (area: MigrationArea) => {
    const res = await fetch(`/api/admin/e2ee/migrate?area=${area}`, { cache: "no-store" });
    const first = (await res.json()) as { items: MigrationItem[]; remaining: number; error?: string };
    if (!res.ok) throw new Error(first.error || "Could not list records");
    const state: Progress = { done: 0, total: first.remaining, failed: [] };
    setProgress(prev => ({ ...prev, [area]: { ...state } }));
    let page = first.items;
    // A failed record is skipped, so it must not be fetched again within this run.
    const skipped = new Set<string>();
    while (page.length) {
      for (const item of page) {
        const key = `${item.parentId ?? ""}/${item.id}`;
        try {
          const location = locationFor(item.area, item.id, item.parentId);
          const enc = await encrypt(location, item.plain);
          if (!sameJson(await decrypt(enc, location), item.plain)) throw new Error("Round-trip check failed");
          await postSwap(item, enc);
          state.done += 1;
        } catch (err) {
          skipped.add(key);
          state.failed.push(errorText(err));
        }
        setProgress(prev => ({ ...prev, [area]: { ...state, failed: [...state.failed] } }));
      }
      const next = (await (await fetch(`/api/admin/e2ee/migrate?area=${area}`, { cache: "no-store" })).json()) as { items: MigrationItem[] };
      page = next.items.filter(item => !skipped.has(`${item.parentId ?? ""}/${item.id}`));
    }
    return state.failed.length;
  };

  const run = async () => {
    setRunning(true);
    setProgress({});
    try {
      // Topics before their conclusions, comments and votes.
      let failed = 0;
      for (const area of MIGRATION_AREAS) failed += await migrateArea(area);
      if (failed) toast.error(`${plural(failed, "record", "records")} couldn't be encrypted. See the list below.`);
      else toast.success("Existing records are now encrypted");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRunning(false);
    }
  };

  const failures = Object.values(progress).reduce((n, p) => n + (p?.failed.length ?? 0), 0);
  const started = running || Object.keys(progress).length > 0;
  const finished = !running && MIGRATION_AREAS.every(area => progress[area]);

  const rows = (
    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border text-sm" aria-live="polite">
      {MIGRATION_AREAS.map(area => {
        const p = progress[area];
        return (
          <li key={area} className="flex justify-between gap-4 px-3 py-2">
            <span className="min-w-0">{AREA_LABELS[area]}</span>
            <span className="shrink-0 text-muted-foreground tabular-nums" data-testid={`migrate-${area}`}>
              {p ? (p.total === 0 ? "Nothing to do" : `${p.done} of ${p.total}`) : "Not started"}
            </span>
          </li>
        );
      })}
    </ul>
  );

  if (finished && failures === 0) {
    return (
      <Card className="gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="flex items-center gap-2 font-medium">
            <CheckCircle2 className="size-5 shrink-0 text-success" aria-hidden="true" />
            <span>
              All records are encrypted <span className="text-success">✓</span>
            </span>
          </p>
          <Button variant="outline" size="row" onClick={run}>
            Run again
          </Button>
        </div>
        <p className="text-sm text-muted-foreground">
          Backups made before today still hold old unencrypted copies: delete them once you no longer need them.
        </p>
        <details className="group text-sm">
          <summary className="inline-flex min-h-11 cursor-pointer list-none items-center gap-1 rounded-md font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 [&::-webkit-details-marker]:hidden">
            Show each area
            <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
          </summary>
          <div className="mt-2">{rows}</div>
        </details>
      </Card>
    );
  }

  return (
    <AdminSectionCard
      title="Encrypt existing records"
      description="Records saved before encryption was turned on can still be read by the server. Run this once to encrypt them."
    >
      <p className="text-sm text-muted-foreground">
        Each record is encrypted on this device and checked, then the old unencrypted copy is removed. Approved minutes stay public. Keep this page
        open until it finishes.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button onClick={run} loading={running}>
          {finished ? "Run again" : "Encrypt existing records"}
        </Button>
      </div>
      {started ? rows : null}
      {failures > 0 ? (
        <Alert variant="destructive">
          <ShieldAlert />
          <AlertTitle>{plural(failures, "record", "records")} couldn&apos;t be encrypted and stayed as they were</AlertTitle>
          <AlertDescription>
            <ul className="list-disc pl-5">
              {MIGRATION_AREAS.filter(area => progress[area]?.failed.length).map(area => {
                const failed = progress[area]!.failed;
                return (
                  <li key={area}>
                    {AREA_LABELS[area]}: {plural(failed.length, "record", "records")} ({[...new Set(failed)].slice(0, 2).join("; ")})
                  </li>
                );
              })}
            </ul>
            <p className="mt-2">Run it again once the reason is fixed; records that worked are not touched twice.</p>
          </AlertDescription>
        </Alert>
      ) : null}
    </AdminSectionCard>
  );
}
