"use client";

import { Check, CheckCircle2, Clock, Lock, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, Smartphone, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { useE2ee, type DeviceView, type PreparedRecovery } from "@/src/lib/e2ee/client/E2eeProvider";
import { formatShortDate } from "@/src/lib/format";
import { cn } from "@/src/lib/utils";
import { DeviceSetupForm } from "./DeviceSetupForm";
import { MigrationSection } from "./MigrationSection";
import { errorText, UnlockCard } from "./UnlockCard";
import { RecoveryKeyFlow } from "./RecoveryKeyFlow";
import { EXPLAIN, WhatIsThis } from "./WhatIsThis";

const SETUP_STEPS = ["Set up this device", "Make a recovery key", "Give paper copies to 2 trusted people"];

/** The three setup steps, always visible, so the admin knows where they are and what comes next. */
function SetupSteps({ current }: { current: number }) {
  return (
    <ol aria-label="Setup steps" className="grid gap-2 sm:grid-cols-3">
      {SETUP_STEPS.map((label, index) => {
        const number = index + 1;
        const done = number < current;
        const active = number === current;
        return (
          <li
            key={label}
            aria-current={active ? "step" : undefined}
            className={cn(
              "flex min-w-0 items-center gap-3 rounded-xl border px-3 py-2.5 text-sm",
              active ? "border-primary bg-primary/10 font-semibold text-foreground" : "border-border bg-card text-muted-foreground"
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold tabular-nums",
                active ? "border-primary bg-primary text-primary-foreground" : done ? "border-primary text-primary" : "border-border"
              )}
            >
              {done ? <Check className="size-3.5" /> : number}
            </span>
            <span className="min-w-0">
              <span className="sr-only">{done ? "Done: " : active ? "Current step: " : "Next: "}</span>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
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
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="outline" loading={busy} disabled={value.replace(/[\s-]/g, "").length < 55}>
          Activate this device with the recovery key
        </Button>
      </div>
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
        <SetupSteps current={1} />
        <CardHeader>
          <CardTitle>Step 1 of 3 · Set up this device</CardTitle>
          <CardDescription>
            This makes the encryption keys for this computer or phone, protected by your passkey (or a passphrase). Nothing secret leaves
            this browser.
          </CardDescription>
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
        <SetupSteps current={2} />
        <CardHeader>
          <CardTitle>Step 2 of 3 · Make a recovery key</CardTitle>
          <CardDescription>
            A recovery key is shown once. Two trustees each keep a paper copy. Without it, losing every admin device means losing
            all encrypted data.
          </CardDescription>
        </CardHeader>
        <div className="flex flex-col gap-1">
          <WhatIsThis question="What is the recovery key?">{EXPLAIN.recoveryKey}</WhatIsThis>
          <WhatIsThis question="Who are trustees?">{EXPLAIN.trustees}</WhatIsThis>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="lg" onClick={start} loading={busy}>
            Create recovery key
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <SetupSteps current={3} />
      <CardHeader>
        <CardTitle>Step 3 of 3 · Save the recovery key and give paper copies to 2 trusted people</CardTitle>
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

/** Whether the server's key records match the signed device log, and the fingerprint that identifies the workspace. */
function IntegrityCard() {
  const { integrity, overview, sealRoster, status } = useE2ee();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (integrity.status === "none") return null;

  if (integrity.status === "verified") {
    return (
      <Card>
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-5 shrink-0 text-success" aria-hidden="true" />
          <CardHeader className="min-w-0">
            <CardTitle>Device list verified</CardTitle>
            <CardDescription>
              Every device and key here is covered by a signed, tamper-evident history ({integrity.entries} entries) that this browser checks against
              the server each time.
            </CardDescription>
          </CardHeader>
        </div>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-sm text-muted-foreground">Workspace fingerprint (it never changes)</p>
          <SafetyCode code={integrity.fingerprint} />
          <p className="text-sm text-muted-foreground">When you add a device, the new owner reads it to an admin, so the workspace they see is the real one.</p>
        </div>
        <div className="flex flex-col gap-1">
          <WhatIsThis question="What is the workspace fingerprint?">{EXPLAIN.fingerprint}</WhatIsThis>
          <WhatIsThis question="What is the device list?">{EXPLAIN.deviceList}</WhatIsThis>
        </div>
      </Card>
    );
  }

  if (integrity.status === "unsealed") {
    return (
      <Alert variant="warning">
        <ShieldAlert />
        <AlertTitle>The device list isn&apos;t sealed yet</AlertTitle>
        <AlertDescription>
          <p>
            This workspace was set up before devices were recorded in a signed history, so someone with access to the database could swap in keys
            without being noticed.
          </p>
          {overview?.me.superAdmin && status === "unlocked" ? (
            <>
              <p className="mt-2">
                Check the device list below with each owner (their safety codes must match), then seal it. From then on, every change is signed.
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button loading={busy} onClick={() => setConfirmOpen(true)}>
                  Seal the device list
                </Button>
              </div>
              <ConfirmDialog
                open={confirmOpen}
                onOpenChange={setConfirmOpen}
                title="Seal the device list?"
                description="Have you checked every device below with its owner? Sealing records exactly this list."
                confirmLabel="Yes, seal it"
                onConfirm={async () => {
                  setConfirmOpen(false);
                  setBusy(true);
                  try {
                    await sealRoster();
                    toast.success("Device list sealed");
                  } catch (err) {
                    toast.error(errorText(err));
                  } finally {
                    setBusy(false);
                  }
                }}
              />
            </>
          ) : (
            <p className="mt-2">A super admin should unlock this page and seal the list.</p>
          )}
        </AlertDescription>
      </Alert>
    );
  }
  return null;
}

function DevicesSection() {
  const { overview, identity, approveDevice, rotate, integrity } = useE2ee();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [rotateIds, setRotateIds] = useState<string[] | null>(null);
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
    setRotateIds(null);
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
          <WhatIsThis question="What is a safety code?">{EXPLAIN.safetyCode}</WhatIsThis>
          <ul className="flex flex-col divide-y divide-border">
            {pending.map(d => (
              <li key={d.deviceId} className="flex flex-col gap-3 py-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium">
                    {d.ownerName} · {d.name}
                  </p>
                  <SafetyCode code={d.safetyCode} large />
                </div>
                {integrity.status === "verified" ? (
                  <p className="text-sm text-muted-foreground">
                    Also ask {d.ownerName} to read the <strong>workspace fingerprint</strong> shown on their screen. It must be{" "}
                    <SafetyCode code={integrity.fingerprint} />.
                  </p>
                ) : null}
                <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm sm:min-h-0">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 shrink-0 accent-primary"
                    checked={!!confirmed[d.deviceId]}
                    onChange={e => setConfirmed(c => ({ ...c, [d.deviceId]: e.target.checked }))}
                  />
                  I compared this code{integrity.status === "verified" ? " and the workspace fingerprint" : ""} with {d.ownerName} and {integrity.status === "verified" ? "both match" : "it matches"}
                </label>
                <div className="flex flex-wrap gap-2">
                  <Button onClick={() => approve(d)} disabled={!confirmed[d.deviceId]} loading={busy === d.deviceId}>
                    Approve device
                  </Button>
                </div>
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
        <WhatIsThis question="What is this list?">{EXPLAIN.deviceList}</WhatIsThis>
        <ul className="flex flex-col divide-y divide-border">
          {listed.map(d => (
            <li key={d.deviceId} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                {canRevoke(d) ? (
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.name} to revoke`}
                    className="mt-1 size-4 shrink-0 accent-destructive"
                    checked={selected.includes(d.deviceId)}
                    onChange={e => setSelected(s => (e.target.checked ? [...s, d.deviceId] : s.filter(x => x !== d.deviceId)))}
                  />
                ) : (
                  <Smartphone className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                )}
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-medium">
                      {d.ownerName} · {d.name}
                    </p>
                    <StatusBadge device={d} />
                    {d.deviceId === identity?.deviceId ? <Badge variant="outline">This device</Badge> : null}
                    {!d.ownerActive ? <Badge variant="destructive">Owner no longer active</Badge> : null}
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Added {formatShortDate(d.createdAt)} · {d.unlock === "prf" ? "Passkey" : "Passphrase"} · Safety code{" "}
                    <SafetyCode code={d.safetyCode} />
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2 border-t border-border pt-4">
          <div className="flex flex-wrap gap-2">
            <Button variant="destructive" disabled={selected.length === 0} loading={busy === "rotate" && selected.length > 0} onClick={() => setRotateIds(selected)}>
              <Trash2 aria-hidden="true" />
              Revoke selected and rotate keys
            </Button>
            <Button variant="outline" loading={busy === "rotate" && selected.length === 0} onClick={() => setRotateIds([])}>
              <RefreshCw aria-hidden="true" />
              Rotate keys now
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">Tick the devices to revoke first. You can&apos;t revoke the device you&apos;re using now.</p>
          <WhatIsThis question="What does rotating keys do?">{EXPLAIN.rotation}</WhatIsThis>
        </div>
        <ConfirmDialog
          open={rotateIds !== null}
          onOpenChange={open => (open ? undefined : setRotateIds(null))}
          title={rotateIds?.length ? `Revoke ${rotateIds.length} device(s) and create new keys?` : "Create new encryption keys now?"}
          description={
            rotateIds?.length ? "Those devices won't be able to read anything new." : "Everyone's active devices get them automatically."
          }
          confirmLabel={rotateIds?.length ? "Revoke and rotate keys" : "Rotate keys"}
          destructive={Boolean(rotateIds?.length)}
          onConfirm={() => revokeAndRotate(rotateIds ?? [])}
        />
      </Card>
    </>
  );
}

function RecoverySection() {
  const { overview, checkRecoveryKey, prepareRecoveryKey, finishRecoveryReplacement } = useE2ee();
  const [drill, setDrill] = useState("");
  const [busy, setBusy] = useState(false);
  const [prepared, setPrepared] = useState<PreparedRecovery | null>(null);
  const [replaceOpen, setReplaceOpen] = useState(false);
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
          {overview.state.recoveryRotatedAt ? ` since ${formatShortDate(overview.state.recoveryRotatedAt)}` : ""}.
          Test it once a year so you know the paper copies still work.
        </CardDescription>
      </CardHeader>
      <WhatIsThis question="What is the recovery key?">{EXPLAIN.recoveryKey}</WhatIsThis>
      <form onSubmit={runDrill} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <Field label="Test a recovery key (changes nothing)" className="min-w-0 flex-1">
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
            <>
              <Button variant="outline" onClick={() => setReplaceOpen(true)}>
                Replace recovery key
              </Button>
              <ConfirmDialog
                open={replaceOpen}
                onOpenChange={setReplaceOpen}
                title="Create a new recovery key?"
                description="The old paper copies will stop working."
                confirmLabel="Create new recovery key"
                destructive
                onConfirm={async () => {
                  setReplaceOpen(false);
                  try {
                    setPrepared(await prepareRecoveryKey());
                  } catch (err) {
                    toast.error(errorText(err));
                  }
                }}
              />
            </>
          )}
        </div>
      ) : null}
    </Card>
  );
}

/** Admin → Encryption: device keys, approvals, rotation and recovery (plan Phase 3). */
export default function EncryptionPanel() {
  const { status, error, overview, thisDevice, refresh, forgetThisDevice, lock, integrity } = useE2ee();

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

  if (status === "integrity-error") {
    return (
      <Alert variant="destructive">
        <ShieldAlert />
        <AlertTitle>The device list failed its integrity check</AlertTitle>
        <AlertDescription>
          <p>{integrity.status === "failed" ? integrity.reason : "It could not be verified."}</p>
          <p className="mt-2">
            Encryption is paused on this device: nothing is unlocked, approved or written. This can mean the database was changed outside the app.
          </p>
          <p className="mt-2 font-medium text-foreground">
            Stop and contact your super admin; they have the incident guide. Tell the other admins, and compare device safety codes with their owners.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Check again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "not-setup") {
    return overview.me.superAdmin ? (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          <ShieldOff />
          <AlertTitle>End-to-end encryption is not on yet</AlertTitle>
          <AlertDescription>
            Once on, admin chat and other private records are encrypted on admins&apos; devices. Not even the server or Google can
            read them. Setting it up takes about 10 minutes and three steps.
          </AlertDescription>
        </Alert>
        <BootstrapWizard />
      </div>
    ) : (
      <EmptyState icon={<ShieldOff />} title="End-to-end encryption is not set up yet" description="A super admin needs to turn it on first." />
    );
  }

  if (status === "no-device") {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Set up encryption on this device</CardTitle>
          <CardDescription>
            Encryption is on for GHMO, but this computer or phone has no keys yet. Set it up here, then another admin approves it (or you use
            the recovery key).
          </CardDescription>
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
          <div className="flex flex-col gap-1">
            <p className="text-sm text-muted-foreground">Safety code for this device</p>
            <SafetyCode code={thisDevice.safetyCode} large />
          </div>
          {integrity.status === "verified" ? (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted-foreground">
                Also read them the <strong>workspace fingerprint</strong>. This is how you know the server is showing you the real workspace:
              </p>
              <SafetyCode code={integrity.fingerprint} large />
            </div>
          ) : null}
          <div className="flex flex-col gap-1">
            <WhatIsThis question="What is a safety code?">{EXPLAIN.safetyCode}</WhatIsThis>
            {integrity.status === "verified" ? (
              <WhatIsThis question="What is the workspace fingerprint?">{EXPLAIN.fingerprint}</WhatIsThis>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
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
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={forgetThisDevice}>
            Remove keys from this browser
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ShieldCheck className="size-8 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">End-to-end encryption is on</p>
              <p className="text-sm text-muted-foreground">
                {overview.devices.filter(d => d.status === "active").length} active device(s) · key generation {overview.state.currentEpoch}
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
      <IntegrityCard />
      {status === "locked" ? <UnlockCard /> : null}
      {status === "unlocked" ? (
        <>
          <DevicesSection />
          <RecoverySection />
          <MigrationSection />
        </>
      ) : null}
    </div>
  );
}
