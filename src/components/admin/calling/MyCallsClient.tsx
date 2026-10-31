"use client";

import { useEffect, useState } from "react";
import { Eye, EyeOff, Phone, PhoneCall } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Skeleton } from "@/src/components/ui/skeleton";
import { EncryptionGate } from "@/src/components/admin/encryption/EncryptionGate";
import { useMemberContacts } from "@/src/components/admin/members/useMemberContacts";
import { formatPhone, maskPhone } from "@/src/lib/members";

type MyMember = { id: string; name?: string | null; emailLower: string; contact?: unknown };
type MineResponse = { isCaller: boolean; version: number; members: MyMember[]; skipped: number };

/**
 * A caller's own slice of the calling tree (plan §12.3): names, numbers decrypted in this browser and
 * shown masked until tapped, tap-to-dial. Campaign outcomes arrive in 9-C.
 */
export default function MyCallsClient() {
  return (
    <EncryptionGate what="Your call list">
      <MyCalls />
    </EncryptionGate>
  );
}

function MyCalls() {
  const [data, setData] = useState<MineResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set());
  const { contacts } = useMemberContacts(data?.members ?? []);

  const fetchMine = async (): Promise<MineResponse> => {
    const res = await fetch("/api/admin/calling-tree/mine", { cache: "no-store" });
    const json = (await res.json().catch(() => ({}))) as MineResponse & { error?: string };
    if (!res.ok) throw new Error(json.error || "Request failed");
    return json;
  };
  const load = () =>
    fetchMine()
      .then(json => {
        setData(json);
        setError(null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Could not load your calls"));
  useEffect(() => {
    let cancelled = false;
    fetchMine()
      .then(json => {
        if (cancelled) return;
        setData(json);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load your calls");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = (id: string) =>
    setRevealed(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (error) return <EmptyState icon={<PhoneCall aria-hidden="true" />} title="Could not load your calls" description={error} action={<Button onClick={load}>Try again</Button>} />;
  if (!data) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your calls…</span>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }
  if (!data.isCaller) {
    return <EmptyState icon={<PhoneCall aria-hidden="true" />} title="You are not on the caller list" description="A super admin adds callers under Calling Tree." />;
  }
  if (data.members.length === 0) {
    return <EmptyState icon={<PhoneCall aria-hidden="true" />} title="Nobody assigned to you yet" description="Once the calling tree is planned, your people appear here." />;
  }

  const sorted = [...data.members].sort((a, b) => (a.name || a.emailLower).localeCompare(b.name || b.emailLower));

  return (
    <div className="space-y-4">
      {data.skipped > 0 ? (
        <Alert variant="info">
          <Phone />
          <AlertTitle>{data.skipped === 1 ? "One person is" : `${data.skipped} people are`} left out</AlertTitle>
          <AlertDescription>They asked not to be called, or no longer have a number on file.</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PhoneCall aria-hidden="true" className="size-5" /> Your people
          </CardTitle>
          <CardDescription>
            {sorted.length} {sorted.length === 1 ? "person" : "people"} to call. Numbers are decrypted on this device only; tap Show to see one, Call to dial.
          </CardDescription>
        </CardHeader>
        <ul className="divide-y divide-border" aria-label="Your call list">
          {sorted.map(member => {
            const label = member.name || member.emailLower;
            const view = contacts.get(member.id);
            const show = revealed.has(member.id);
            return (
              <li key={member.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <p className="truncate font-medium">{label}</p>
                  {!view ? (
                    <p className="text-sm text-muted-foreground">Decrypting…</p>
                  ) : !view.ok ? (
                    <p className="text-sm text-destructive">Number can&apos;t be read on this device: {view.error}</p>
                  ) : (
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
                      <span className="font-mono" aria-label={show ? `Phone ${formatPhone(view.contact.phone ?? "")}` : "Phone number hidden"}>
                        {view.contact.phone ? (show ? formatPhone(view.contact.phone) : maskPhone(view.contact.phone)) : "No number"}
                      </span>
                      {show && view.contact.altPhone ? <span>alt {formatPhone(view.contact.altPhone)}</span> : null}
                      {view.contact.language ? <span>{view.contact.language}</span> : null}
                      {view.contact.household ? <span>· {view.contact.household}</span> : null}
                      {show && view.contact.notes ? <span className="basis-full">{view.contact.notes}</span> : null}
                    </div>
                  )}
                </div>
                {view?.ok && view.contact.phone ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => toggle(member.id)} aria-label={show ? `Hide ${label}'s number` : `Show ${label}'s number`}>
                      {show ? <EyeOff aria-hidden="true" className="size-4" /> : <Eye aria-hidden="true" className="size-4" />}
                      {show ? "Hide" : "Show"}
                    </Button>
                    <Button asChild size="sm">
                      <a href={`tel:${view.contact.phone}`} aria-label={`Call ${label}`}>
                        <Phone aria-hidden="true" className="size-4" /> Call
                      </a>
                    </Button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
