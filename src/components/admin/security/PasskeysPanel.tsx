"use client";

import { startRegistration } from "@simplewebauthn/browser";
import { CheckCircle2, Clock, KeyRound, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
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
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load your passkeys</AlertTitle>
        <AlertDescription>
          <p>{loadError}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={load}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
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
        <AdminSectionCard
          as="h3"
          className="border-warning/50"
          icon={<Clock aria-hidden="true" />}
          title="Waiting for your approval"
          description="Another admin added a passkey using an email link. Only approve it if you have confirmed with them (in person or by phone) that they added it."
        >
          <AdminList bare label="Passkeys waiting for your approval">
            {data.pendingApprovals.map(p => (
              <AdminListRow
                key={p.credentialId}
                title={`${p.ownerName} · ${p.name}`}
                meta={`Added ${formatDate(p.createdAt)}`}
                actions={
                  <Button variant="outline" size="row" onClick={() => approve(p)} loading={busyId === p.credentialId}>
                    Approve
                  </Button>
                }
              />
            ))}
          </AdminList>
        </AdminSectionCard>
      ) : null}

      <AdminSectionCard
        as="h3"
        icon={<KeyRound aria-hidden="true" />}
        title="Passkeys"
        description="Sign in with your fingerprint, face or phone screen lock. Add one on each device you use, so losing one device never locks you out."
      >
        {data.mine.length === 0 ? (
          <EmptyState
            icon={<KeyRound />}
            title="No passkeys yet"
            description="Optional. Name this device below, then choose “Add passkey” and follow your device's prompt."
          />
        ) : (
          <AdminList bare label="Your passkeys">
            {data.mine.map(p => (
              <AdminListRow
                key={p.credentialId}
                title={<span className="break-words">{p.name}</span>}
                badges={
                  <>
                    <StatusBadge passkey={p} />
                    {p.backedUp ? <Badge variant="secondary">Saved to your password manager</Badge> : null}
                    {p.prfEnabled ? <Badge variant="outline">Can unlock encryption</Badge> : null}
                  </>
                }
                meta={`Added ${formatDate(p.createdAt)} · Last used ${formatDate(p.lastUsedAt)}`}
                actions={
                  <Button
                    variant="ghost"
                    size="row"
                    className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => setRemoveTarget({ ownerUid: data.uid, passkey: p })}
                    loading={busyId === p.credentialId}
                    aria-label={`Remove passkey ${p.name}`}
                  >
                    <Trash2 aria-hidden="true" />
                    Remove
                  </Button>
                }
              />
            ))}
          </AdminList>
        )}
        <div className="flex flex-col gap-3">
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
      </AdminSectionCard>
    </div>
  );
}
