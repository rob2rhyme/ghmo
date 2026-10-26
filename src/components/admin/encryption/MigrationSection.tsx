"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { AREA_LABELS, MIGRATION_AREAS, locationFor, type MigrationArea, type MigrationItem } from "@/src/lib/e2eeMigration";
import { errorText } from "./UnlockCard";

type Progress = { done: number; total: number; failed: string[] };

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
          state.failed.push(`${item.id}: ${errorText(err)}`);
        }
        setProgress(prev => ({ ...prev, [area]: { ...state, failed: [...state.failed] } }));
      }
      const next = (await (await fetch(`/api/admin/e2ee/migrate?area=${area}`, { cache: "no-store" })).json()) as { items: MigrationItem[] };
      page = next.items.filter(item => !skipped.has(`${item.parentId ?? ""}/${item.id}`));
    }
  };

  const run = async () => {
    setRunning(true);
    try {
      // Threads before their conclusions, comments and votes.
      for (const area of MIGRATION_AREAS) await migrateArea(area);
      toast.success("Existing records are now encrypted");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setRunning(false);
    }
  };

  const failures = Object.values(progress).reduce((n, p) => n + (p?.failed.length ?? 0), 0);
  const finished = !running && MIGRATION_AREAS.every(area => progress[area]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Encrypt existing records</CardTitle>
        <CardDescription>
          Records saved before encryption was turned on are still readable by the server. This encrypts them on this device, checks
          each one, then removes the plaintext. Approved minutes stay public. Keep this page open until it finishes.
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3">
        <Button onClick={run} loading={running} className="self-start">
          {finished ? "Run again" : "Encrypt existing records"}
        </Button>
        <ul className="flex flex-col gap-1 text-sm" aria-live="polite">
          {MIGRATION_AREAS.map(area => {
            const p = progress[area];
            return (
              <li key={area} className="flex justify-between gap-4">
                <span>{AREA_LABELS[area]}</span>
                <span className="text-muted-foreground" data-testid={`migrate-${area}`}>
                  {p ? (p.total === 0 ? "nothing to do" : `${p.done} of ${p.total}`) : "—"}
                </span>
              </li>
            );
          })}
        </ul>
        {finished && failures === 0 ? (
          <p className="text-sm text-success">
            Done. Backups made before today still contain the old plaintext: delete them once you no longer need them.
          </p>
        ) : null}
        {failures > 0 ? (
          <div className="text-sm text-destructive">
            <p>{failures} record(s) could not be encrypted and were left as they were:</p>
            <ul className="list-disc pl-5">
              {Object.values(progress).flatMap(p => p?.failed ?? []).slice(0, 10).map(line => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
