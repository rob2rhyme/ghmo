"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { CheckCircle2, Clock, KeyRound, Plus, ShieldAlert, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { formatDateTime } from "@/src/lib/format";

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

const formatDate = (iso: string | null) => (iso ? formatDateTime(iso) || "Never" : "Never");

/** Fired after a passkey is added or removed, so the sign-in summary at the top of the page can refresh. */
export const PASSKEYS_CHANGED_EVENT = "ghmo:passkeys-changed";
const announceChange = () => window.dispatchEvent(new Event(PASSKEYS_CHANGED_EVENT));

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
  const [removeTarget, setRemoveTarget] = useState<{ ownerUid: string; passkey: PasskeyView } | null>(null);

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
      announceChange();
    } catch (err) {
      const name = (err as { name?: string })?.name;
      toast.error(name === "NotAllowedError" ? "Passkey prompt was closed. Nothing was added." : err instanceof Error ? err.message : "Could not add passkey");
    } finally {
      setBusyId(null);
    }
  };

  const remove = async (ownerUid: string, passkey: PasskeyView) => {
    setRemoveTarget(null);
    setBusyId(passkey.credentialId);
    try {
      await api(`/api/admin/passkeys/${ownerUid}/${passkey.credentialId}`, { method: "DELETE" });
      toast.success("Passkey removed");
      await load();
      announceChange();
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
            <CardTitle className="flex items-center gap-2">
              <Clock aria-hidden="true" className="size-5 shrink-0 text-warning" /> Waiting for your approval
            </CardTitle>
            <CardDescription>
              Another admin added a passkey using an email link. Only approve it if you have confirmed with them (in person or
              by phone) that they added it.
            </CardDescription>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border">
            {data.pendingApprovals.map(p => (
              <li key={p.credentialId} className="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
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
          <CardTitle className="flex items-center gap-2">
            <KeyRound aria-hidden="true" className="size-5 shrink-0 text-primary" /> Passkeys
          </CardTitle>
          <CardDescription>
            Passkey: sign in with your fingerprint, face or phone screen lock. Add one on each device you use, so losing one device never
            locks you out.
          </CardDescription>
        </CardHeader>
        {data.mine.length === 0 ? (
          <EmptyState
            icon={<KeyRound />}
            title="No passkeys yet"
            description="Optional. Name this device below, then choose “Add passkey” and follow your device's prompt."
          />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {data.mine.map(p => (
              <li key={p.credentialId} className="flex flex-wrap items-start justify-between gap-3 py-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium break-words">{p.name}</p>
                    <StatusBadge passkey={p} />
                    {p.backedUp ? <Badge variant="secondary">Saved to your password manager</Badge> : null}
                    {p.prfEnabled ? <Badge variant="outline">Can unlock encryption</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Added {formatDate(p.createdAt)} · Last used {formatDate(p.lastUsedAt)}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  className="ml-auto text-destructive hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => setRemoveTarget({ ownerUid: data.uid, passkey: p })}
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
        <div className="flex flex-col gap-3 border-t border-border pt-4">
          <Field
            label="New passkey name"
            description="So you can tell your devices apart, e.g. “Work laptop” or “Sita’s phone”."
            className="max-w-md"
          >
            <Input value={newName} onChange={e => setNewName(e.target.value)} maxLength={60} placeholder="e.g. Work laptop" />
          </Field>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={addPasskey} loading={busyId === "new"}>
              <Plus aria-hidden="true" />
              Add passkey
            </Button>
          </div>
        </div>
        <ConfirmDialog
          open={removeTarget !== null}
          onOpenChange={open => (open ? undefined : setRemoveTarget(null))}
          title={`Remove “${removeTarget?.passkey.name ?? ""}”?`}
          description="That device will no longer be able to sign in."
          confirmLabel="Remove passkey"
          destructive
          onConfirm={() => (removeTarget ? remove(removeTarget.ownerUid, removeTarget.passkey) : undefined)}
        />
      </Card>
    </div>
  );
}
