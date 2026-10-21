"use client";

import { CheckCircle2, Clock, KeyRound, Lock, RefreshCw, ShieldAlert, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useE2ee, type DeviceView, type PreparedRecovery } from "@/src/lib/e2ee/client/E2eeProvider";
import { DeviceSetupForm } from "./DeviceSetupForm";
import { RecoveryKeyFlow } from "./RecoveryKeyFlow";

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });

function errorText(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") return "The passkey prompt was closed. Try again.";
  return err instanceof Error ? err.message : "Something went wrong";
}

function SafetyCode({ code, large = false }: { code: string; large?: boolean }) {
  return (
    <span className={large ? "font-mono text-2xl font-semibold tracking-widest" : "font-mono text-sm tracking-wider"} aria-label={`Safety code ${code}`}>
      {code}
    </span>
  );
}

function StatusBadge({ device }: { device: DeviceView }) {
  if (device.status === "active")
    return (
      <Badge variant="success">
        <CheckCircle2 aria-hidden="true" /> Active
      </Badge>
    );
  if (device.status === "pending")
    return (
      <Badge variant="warning">
        <Clock aria-hidden="true" /> Waiting for approval
      </Badge>
    );
  return <Badge variant="destructive">Revoked</Badge>;
}

function UnlockCard() {
  const { identity, unlock } = useE2ee();
  const [passphrase, setPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const usesPassphrase = identity?.unlock.method === "passphrase";
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      await unlock(usesPassphrase ? passphrase : undefined);
      setPassphrase("");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle>Unlock encryption on this device</CardTitle>
        <CardDescription>Encrypted chat and threads stay unreadable until you unlock. Keys are forgotten when you lock or close the tab.</CardDescription>
      </CardHeader>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {usesPassphrase ? (
          <Field label="Encryption passphrase" className="flex-1">
            <Input type="password" autoComplete="current-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
          </Field>
        ) : null}
        <Button type="submit" loading={busy}>
          <KeyRound aria-hidden="true" />
          {usesPassphrase ? "Unlock" : "Unlock with passkey"}
        </Button>
      </form>
    </Card>
  );
}

function RecoverWithKey() {
  const { recoverThisDevice, keysOpen, unlock, identity } = useE2ee();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      if (!keysOpen) await unlock(identity?.unlock.method === "passphrase" ? passphrase : undefined);
      await recoverThisDevice(value);
      toast.success("This device was activated with the recovery key. Replace the recovery key next.");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field label="Recovery key" description="All 14 groups from the paper copy. Spaces and dashes don't matter.">
        <Input className="font-mono uppercase" autoComplete="off" value={value} onChange={e => setValue(e.target.value)} />
      </Field>
      {!keysOpen && identity?.unlock.method === "passphrase" ? (
        <Field label="This device's passphrase">
          <Input type="password" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
        </Field>
      ) : null}
      <Button type="submit" variant="outline" loading={busy} disabled={value.replace(/[\s-]/g, "").length < 55}>
        Activate this device with the recovery key
      </Button>
    </form>
  );
}

function BootstrapWizard() {
  const { identity, keysOpen, unlock, prepareRecoveryKey, finishBootstrap } = useE2ee();
  const [prepared, setPrepared] = useState<PreparedRecovery | null>(null);
  const [busy, setBusy] = useState(false);

  if (!identity) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 1 of 3 · Create keys on this device</CardTitle>
          <CardDescription>Your passkey protects this device&apos;s keys. Nothing secret leaves this browser.</CardDescription>
        </CardHeader>
        <DeviceSetupForm />
      </Card>
    );
  }

  if (!prepared) {
    const start = async () => {
      setBusy(true);
      try {
        if (!keysOpen) await unlock();
        setPrepared(await prepareRecoveryKey());
      } catch (err) {
        toast.error(errorText(err));
      } finally {
        setBusy(false);
      }
    };
    return (
      <Card>
        <CardHeader>
          <CardTitle>Step 2 of 3 · Create the recovery key</CardTitle>
          <CardDescription>
            A recovery key is shown once. Two trustees each keep a paper copy. Without it, losing every admin device means losing
            all encrypted data.
          </CardDescription>
        </CardHeader>
        <Button onClick={start} loading={busy} className="self-start">
          Create recovery key
        </Button>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Step 3 of 3 · Save the recovery key</CardTitle>
      </CardHeader>
      <RecoveryKeyFlow
        prepared={prepared}
        submitLabel="Turn on end-to-end encryption"
        onSubmit={async trustees => {
          await finishBootstrap(prepared, trustees);
          toast.success("End-to-end encryption is on.");
        }}
      />
    </Card>
  );
}

function DevicesSection() {
  const { overview, identity, approveDevice, rotate } = useE2ee();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  if (!overview) return null;

  const pending = overview.devices.filter(d => d.status === "pending" && d.deviceId !== identity?.deviceId);
  const listed = overview.devices.filter(d => d.status !== "revoked");
  const canRevoke = (d: DeviceView) => d.deviceId !== identity?.deviceId && (d.uid === overview.me.uid || overview.me.superAdmin);

  const approve = async (d: DeviceView) => {
    setBusy(d.deviceId);
    try {
      await approveDevice(d.deviceId);
      toast.success(`Approved ${d.ownerName}’s ${d.name}`);
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  const revokeAndRotate = async (ids: string[]) => {
    const message = ids.length
      ? `Revoke ${ids.length} device(s) and create new keys? Those devices won't be able to read anything new.`
      : "Create new encryption keys now? Everyone's active devices get them automatically.";
    if (!window.confirm(message)) return;
    setBusy("rotate");
    try {
      await rotate(ids);
      setSelected([]);
      toast.success(ids.length ? "Devices revoked and keys rotated" : "Keys rotated");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <>
      {pending.length > 0 ? (
        <Card className="border-warning/50">
          <CardHeader>
            <CardTitle>Devices waiting for approval</CardTitle>
            <CardDescription>
              Before approving, call or meet the person and check that the code on their screen matches the code here exactly.
            </CardDescription>
          </CardHeader>
          <ul className="flex flex-col divide-y divide-border">
            {pending.map(d => (
              <li key={d.deviceId} className="flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {d.ownerName} · {d.name}
                  </p>
                  <SafetyCode code={d.safetyCode} large />
                </div>
                <label className="flex items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 accent-primary"
                    checked={!!confirmed[d.deviceId]}
                    onChange={e => setConfirmed(c => ({ ...c, [d.deviceId]: e.target.checked }))}
                  />
                  I compared this code with {d.ownerName} and it matches
                </label>
                <Button className="self-start" onClick={() => approve(d)} disabled={!confirmed[d.deviceId]} loading={busy === d.deviceId}>
                  Approve device
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Devices with encryption keys</CardTitle>
          <CardDescription>Revoke a lost device or one belonging to an admin who left. Keys are rotated so it can&apos;t read anything new.</CardDescription>
        </CardHeader>
        <ul className="flex flex-col divide-y divide-border">
          {listed.map(d => (
            <li key={d.deviceId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                {canRevoke(d) ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.name} to revoke`}
                    className="mt-1 size-4 accent-destructive"
                    checked={selected.includes(d.deviceId)}
                    onChange={e => setSelected(s => (e.target.checked ? [...s, d.deviceId] : s.filter(x => x !== d.deviceId)))}
                  />
                ) : (
                  <Smartphone className="mt-0.5 size-4 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {d.ownerName} · {d.name}
                    </p>
                    <StatusBadge device={d} />
                    {d.deviceId === identity?.deviceId ? <Badge variant="outline">This device</Badge> : null}
                    {!d.ownerActive ? <Badge variant="destructive">Owner no longer active</Badge> : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Added {dateFormat.format(new Date(d.createdAt))} · {d.unlock === "prf" ? "Passkey" : "Passphrase"} ·{" "}
                    <SafetyCode code={d.safetyCode} />
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row">
          <Button variant="destructive" disabled={selected.length === 0} loading={busy === "rotate" && selected.length > 0} onClick={() => revokeAndRotate(selected)}>
            <Trash2 aria-hidden="true" />
            Revoke selected and rotate keys
          </Button>
          <Button variant="outline" loading={busy === "rotate" && selected.length === 0} onClick={() => revokeAndRotate([])}>
            <RefreshCw aria-hidden="true" />
            Rotate keys now
          </Button>
        </div>
      </Card>
    </>
  );
}

function RecoverySection() {
  const { overview, checkRecoveryKey, prepareRecoveryKey, finishRecoveryReplacement } = useE2ee();
  const [drill, setDrill] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedRecovery | null>(null);
  if (!overview) return null;

  const runDrill = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    try {
      const epochs = await checkRecoveryKey(drill);
      toast.success(`Recovery key works: it opens all ${epochs} key generation(s). Nothing was changed.`);
      setDrill("");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recovery key</CardTitle>
        <CardDescription>
          Held on paper by {overview.state.trustees.map(t => t.name).join(" and ") || "nobody yet"}
          {overview.state.recoveryRotatedAt ? ` since ${dateFormat.format(new Date(overview.state.recoveryRotatedAt))}` : ""}.
          Test it once a year so you know the paper copies still work.
        </CardDescription>
      </CardHeader>
      <form onSubmit={runDrill} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Test a recovery key (changes nothing)" className="flex-1">
          <Input className="font-mono uppercase" autoComplete="off" value={drill} onChange={e => setDrill(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" loading={busy} disabled={drill.replace(/[\s-]/g, "").length < 55}>
          Test
        </Button>
      </form>
      {overview.me.superAdmin ? (
        <div className="border-t border-border pt-4">
          {prepared ? (
            <RecoveryKeyFlow
              prepared={prepared}
              submitLabel="Replace recovery key"
              onSubmit={async trustees => {
                await finishRecoveryReplacement(prepared, trustees);
                setPrepared(null);
                toast.success("Recovery key replaced. Destroy the old paper copies.");
              }}
            />
          ) : (
            <Button
              variant="outline"
              onClick={async () => {
                if (window.confirm("Create a new recovery key? The old paper copies will stop working.")) {
                  setPrepared(await prepareRecoveryKey());
                }
              }}
            >
              Replace recovery key
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/** Admin → Encryption: device keys, approvals, rotation and recovery (plan Phase 3). */
export default function EncryptionPanel() {
  const { status, error, overview, thisDevice, refresh, forgetThisDevice, lock } = useE2ee();

  if (status === "loading") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading encryption status…</span>
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }

  if (status === "error" || !overview) {
    return <EmptyState icon={<ShieldAlert />} title="Could not load encryption status" description={error ?? undefined} action={<Button onClick={refresh}>Try again</Button>} />;
  }

  if (status === "not-setup") {
    return overview.me.superAdmin ? (
      <div className="flex flex-col gap-4">
        <Alert variant="info">
          <ShieldCheck />
          <AlertTitle>End-to-end encryption is not on yet</AlertTitle>
          <AlertDescription>
            Once on, admin chat and other private records are encrypted on admins&apos; devices. Not even the server or Google can
            read them.
          </AlertDescription>
        </Alert>
        <BootstrapWizard />
      </div>
    ) : (
      <EmptyState icon={<ShieldCheck />} title="End-to-end encryption is not set up yet" description="A super admin needs to turn it on first." />
    );
  }

  if (status === "no-device") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up encryption on this device</CardTitle>
          <CardDescription>Then another admin approves it, or you use the recovery key.</CardDescription>
        </CardHeader>
        <DeviceSetupForm />
      </Card>
    );
  }

  if (status === "pending" && thisDevice) {
    return (
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Waiting for approval</CardTitle>
            <CardDescription>
              Ask another admin to open Admin → Encryption and approve “{thisDevice.name}”. Read them this code; it must match
              what they see.
            </CardDescription>
          </CardHeader>
          <SafetyCode code={thisDevice.safetyCode} large />
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Check again
            </Button>
            <Button variant="ghost" onClick={forgetThisDevice}>
              Withdraw this device
            </Button>
          </div>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Lost every device?</CardTitle>
            <CardDescription>Use the paper recovery key held by a trustee to activate this device yourself.</CardDescription>
          </CardHeader>
          <RecoverWithKey />
        </Card>
      </div>
    );
  }

  if (status === "revoked") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>This device was revoked</CardTitle>
          <CardDescription>Its keys no longer receive new data. Remove them from this browser and set the device up again if needed.</CardDescription>
        </CardHeader>
        <Button variant="outline" onClick={forgetThisDevice} className="self-start">
          Remove keys from this browser
        </Button>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-8 text-success" aria-hidden="true" />
            <div>
              <p className="font-semibold">End-to-end encryption is on</p>
              <p className="text-sm text-muted-foreground">
                Key generation {overview.state.currentEpoch} · {overview.devices.filter(d => d.status === "active").length} active device(s)
              </p>
            </div>
          </div>
          {status === "unlocked" ? (
            <Button variant="outline" onClick={lock}>
              <Lock aria-hidden="true" />
              Lock
            </Button>
          ) : null}
        </div>
      </Card>
      {status === "locked" ? <UnlockCard /> : null}
      {status === "unlocked" ? (
        <>
          <DevicesSection />
          <RecoverySection />
        </>
      ) : null}
    </div>
  );
}
