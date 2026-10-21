"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { CheckCircle2, Clock, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";

type PasskeyView = {
  credentialId: string;
  name: string;
  status: "active" | "pending";
  deviceType: string;
  backedUp: boolean;
  prfEnabled: boolean;
  createdVia: "passkey" | "magic_link";
  createdAt: string | null;
  lastUsedAt: string | null;
};

type PendingView = PasskeyView & { ownerUid: string; ownerName: string };

type PasskeysResponse = { uid: string; mine: PasskeyView[]; pendingApprovals: PendingView[] };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const formatDate = (iso: string | null) => (iso ? dateFormat.format(new Date(iso)) : "Never");

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

function StatusBadge({ passkey }: { passkey: PasskeyView }) {
  return passkey.status === "active" ? (
    <Badge variant="success">
      <CheckCircle2 aria-hidden="true" /> Active
    </Badge>
  ) : (
    <Badge variant="warning">
      <Clock aria-hidden="true" /> Waiting for approval
    </Badge>
  );
}

export default function PasskeysPanel() {
  const [data, setData] = useState<PasskeysResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      setData(await api<PasskeysResponse>("/api/admin/passkeys"));
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load passkeys");
    }
  }, []);

  useEffect(() => {
    let active = true;
    api<PasskeysResponse>("/api/admin/passkeys")
      .then(result => {
        if (active) setData(result);
      })
      .catch(err => {
        if (active) setLoadError(err instanceof Error ? err.message : "Could not load passkeys");
      });
    return () => {
      active = false;
    };
  }, []);

  const addPasskey = async () => {
    setBusyId("new");
    try {
      const { options, challengeId } = await api<{
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
        challengeId: string;
      }>("/api/auth/passkey/register/options", { method: "POST", body: "{}" });
      const response = await startRegistration({ optionsJSON: options });
      await api("/api/auth/passkey/register/verify", {
        method: "POST",
        body: JSON.stringify({ challengeId, name: newName.trim() || undefined, response })
      });
      setNewName("");
      toast.success("Passkey added");
      await load();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      toast.error(name === "NotAllowedError" ? "Passkey prompt was closed. Nothing was added." : err instanceof Error ? err.message : "Could not add passkey");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (ownerUid: string, passkey: PasskeyView) => {
    if (!window.confirm(`Remove “${passkey.name}”? That device will no longer be able to sign in.`)) return;
    setBusyId(passkey.credentialId);
    try {
      await api(`/api/admin/passkeys/${ownerUid}/${passkey.credentialId}`, { method: "DELETE" });
      toast.success("Passkey removed");
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not remove passkey");
    } finally {
      setBusyId(null);
    }
  };

  const approve = async (pending: PendingView) => {
    setBusyId(pending.credentialId);
    try {
      await api(`/api/admin/passkeys/${pending.ownerUid}/${pending.credentialId}`, {
        method: "POST",
        body: JSON.stringify({ action: "approve" })
      });
      toast.success(`Approved ${pending.ownerName}’s passkey`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not approve");
    } finally {
      setBusyId(null);
    }
  };

  if (loadError) {
    return <EmptyState icon={<ShieldAlert />} title="Could not load your passkeys" description={loadError} action={<Button onClick={load}>Try again</Button>} />;
  }

  if (!data) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading passkeys…</span>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {data.pendingApprovals.length > 0 ? (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>Waiting for your approval</CardTitle>
            <CardDescription>
              Another admin added a passkey using an email link. Only approve it if you have confirmed with them (in person or
              by phone) that they added it.
            </CardDescription>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border">
            {data.pendingApprovals.map(p => (
              <li key={p.credentialId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-medium">
                    {p.ownerName} · {p.name}
                  </p>
                  <p className="text-sm text-muted-foreground">Added {formatDate(p.createdAt)}</p>
                </div>
                <Button onClick={() => approve(p)} loading={busyId === p.credentialId}>
                  Approve
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Your passkeys</CardTitle>
          <CardDescription>Add a passkey on each device you use, so losing one device never locks you out.</CardDescription>
        </CardHeader>
        {data.mine.length === 0 ? (
          <EmptyState icon={<KeyRound />} title="No passkeys yet" />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.mine.map(p => (
              <li key={p.credentialId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">{p.name}</p>
                    <StatusBadge passkey={p} />
                    {p.backedUp ? <Badge variant="secondary">Synced</Badge> : null}
                    {p.prfEnabled ? <Badge variant="outline">Encryption-ready</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Added {formatDate(p.createdAt)} · Last used {formatDate(p.lastUsedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => remove(data.uid, p)}
                  loading={busyId === p.credentialId}
                  aria-label={`Remove passkey ${p.name}`}
                >
                  <Trash2 aria-hidden="true" />
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-col gap-3 border-t border-border pt-4 sm:flex-row sm:items-end">
          <Field label="New passkey name" className="flex-1">
            <Input value={newName} onChange={e => setNewName(e.target.value)} maxLength={60} placeholder="e.g. Work laptop" />
          </Field>
          <Button onClick={addPasskey} loading={busyId === "new"}>
            <Plus aria-hidden="true" />
            Add passkey
          </Button>
        </div>
      </Card>
    </div>
  );
}
