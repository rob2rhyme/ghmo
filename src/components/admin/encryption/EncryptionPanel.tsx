"use client";

import { CheckCircle2, ChevronDown, Clock, Lock, MonitorSmartphone, RefreshCw, ShieldAlert, ShieldCheck, ShieldOff, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card } from "@/src/components/ui/card";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { EmptyState } from "@/src/components/ui/empty-state";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Skeleton } from "@/src/components/ui/skeleton";
import { Steps } from "@/src/components/ui/steps";
import { useE2ee, type DeviceView, type PreparedRecovery } from "@/src/lib/e2ee/client/E2eeProvider";
import { formatShortDate } from "@/src/lib/format";
import { DeviceSetupForm } from "./DeviceSetupForm";
import { MigrationSection } from "./MigrationSection";
import { PAUSED_BODY, PAUSED_NEXT_STEP, PAUSED_TITLE, PausedDetails } from "./PausedNotice";
import { errorText, UnlockCard } from "./UnlockCard";
import { RecoveryKeyFlow } from "./RecoveryKeyFlow";
import { EXPLAIN, WhatIsThis } from "./WhatIsThis";

const SETUP_STEPS = ["Set up this device", "Make a recovery key", "Give a paper copy to each of 2 trustees"];

/** The three setup steps, always visible, so the admin knows where they are and what comes next. */
function SetupSteps({ current }: { current: number }) {
  return (
    <Steps
      label="Setup steps"
      steps={SETUP_STEPS.map((title, index) => ({
        title,
        state: index + 1 < current ? "done" : index + 1 === current ? "current" : "todo"
      }))}
    />
  );
}

/** "1 approved device", "2 approved devices". */
const plural = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

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
  return <Badge variant="destructive">Removed</Badge>;
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
      <Field
        label="Recovery key"
        description="All 14 groups from the paper copy. Spaces and dashes don't matter. The button turns on once every group is typed."
      >
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
      <div className="flex flex-col gap-4">
        <SetupSteps current={1} />
        <AdminSectionCard
          title={SETUP_STEPS[0]}
          description="This makes the encryption keys for this computer or phone, protected by your passkey (or a passphrase). Nothing secret leaves this browser."
        >
          <DeviceSetupForm />
        </AdminSectionCard>
      </div>
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
      <div className="flex flex-col gap-4">
        <SetupSteps current={2} />
        <AdminSectionCard
          title={SETUP_STEPS[1]}
          description="A recovery key is shown once. Two trustees (people you trust) each keep a paper copy. Without it, losing every admin device means losing all encrypted data."
        >
          <div className="flex flex-col gap-1">
            <WhatIsThis question="What is the recovery key?">{EXPLAIN.recoveryKey}</WhatIsThis>
            <WhatIsThis question="Who are trustees?">{EXPLAIN.trustees}</WhatIsThis>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={start} loading={busy}>
              Create recovery key
            </Button>
          </div>
        </AdminSectionCard>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <SetupSteps current={3} />
      <AdminSectionCard title={SETUP_STEPS[2]} description="Save the recovery key, check your copy, then name the two people who keep the paper copies.">
        <RecoveryKeyFlow
          prepared={prepared}
          submitLabel="Turn on end-to-end encryption"
          onSubmit={async trustees => {
            await finishBootstrap(prepared, trustees);
            toast.success("End-to-end encryption is on.");
          }}
        />
      </AdminSectionCard>
    </div>
  );
}

/**
 * One line under the status: the device list matched its signed history. The detail (how many changes,
 * the workspace fingerprint) sits in a disclosure; a failed check is the page's loud destructive alert instead.
 */
function IntegrityLine() {
  const { integrity } = useE2ee();
  if (integrity.status !== "verified") return null;
  return (
    <details className="group border-t border-border pt-3 text-sm">
      <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring sm:min-h-8 [&::-webkit-details-marker]:hidden">
        <span className="flex items-center gap-2 font-medium text-foreground">
          <ShieldCheck className="size-4 shrink-0 text-success" aria-hidden="true" />
          <span>
            Device list checked <span className="text-success">✓</span>
          </span>
        </span>
        <span className="inline-flex items-center gap-1 font-medium text-primary group-hover:underline">
          Details
          <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden="true" />
        </span>
      </summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-muted-foreground">
          Checked against a signed record of every change ({plural(integrity.entries, "change", "changes")}). This browser repeats the check each time
          the page loads.
        </p>
        <div className="flex flex-col gap-1 rounded-xl border border-border bg-muted/40 p-3">
          <p className="text-muted-foreground">Workspace fingerprint</p>
          <SafetyCode code={integrity.fingerprint} />
          <p className="text-muted-foreground">
            It never changes. Whoever sets up a new device reads it to an admin, so you both know it&apos;s the real workspace.
          </p>
        </div>
        <WhatIsThis question="What is the workspace fingerprint?">{EXPLAIN.fingerprint}</WhatIsThis>
      </div>
    </details>
  );
}

/** Warns when the workspace predates the signed device history, and lets a super admin seal it. */
function UnsealedAlert() {
  const { integrity, overview, sealRoster, status } = useE2ee();
  const [busy, setBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  if (integrity.status !== "unsealed") return null;

  return (
    <Alert variant="warning">
      <ShieldAlert />
      <AlertTitle>One more step: seal the device list</AlertTitle>
      <AlertDescription>
        <p>
          Sealing records today&apos;s list of approved devices in a signed history. From then on, every device added or removed is signed by an
          existing device, so a device added behind your back gets noticed.
        </p>
        {overview?.me.superAdmin && status === "unlocked" ? (
          <>
            <p className="mt-2">
              Check the device list below with each owner (their safety codes must match), then seal it.
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

/** Devices waiting for approval: the safety-code (and fingerprint) comparison, then approve. */
function PendingDevicesSection() {
  const { overview, identity, approveDevice, integrity } = useE2ee();
  const [confirmed, setConfirmed] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  if (!overview) return null;

  const pending = overview.devices.filter(d => d.status === "pending" && d.deviceId !== identity?.deviceId);
  if (pending.length === 0) return null;

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

  return (
    <AdminSectionCard
      className="border-warning/50"
      title="Devices waiting for approval"
      description="Before approving, call or meet the person and check that the code on their screen matches the code here exactly."
    >
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
              I compared this code{integrity.status === "verified" ? " and the workspace fingerprint" : ""} with {d.ownerName} and{" "}
              {integrity.status === "verified" ? "both match" : "it matches"}
            </label>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => approve(d)} disabled={!confirmed[d.deviceId]} loading={busy === d.deviceId}>
                Approve device
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </AdminSectionCard>
  );
}

function DevicesSection() {
  const { overview, identity, rotate } = useE2ee();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [rotateIds, setRotateIds] = useState<string[] | null>(null);
  if (!overview) return null;

  const listed = overview.devices.filter(d => d.status !== "revoked");
  const canRevoke = (d: DeviceView) => d.deviceId !== identity?.deviceId && (d.uid === overview.me.uid || overview.me.superAdmin);
  const anyRevocable = listed.some(canRevoke);
  const onlyOwn = listed.every(d => d.deviceId === identity?.deviceId);

  const revokeAndRotate = async (ids: string[]) => {
    setRotateIds(null);
    setBusy(true);
    try {
      await rotate(ids);
      setSelected([]);
      toast.success(ids.length ? "Devices removed and new keys made" : "New keys made");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSectionCard
      title="Devices with encryption keys"
      description="Remove a lost device or one belonging to an admin who left. New keys are made so it can't read anything new."
    >
      <WhatIsThis question="What is this list?">{EXPLAIN.deviceList}</WhatIsThis>
      <AdminList bare label="Devices with encryption keys">
        {listed.map(d => (
          <AdminListRow
            key={d.deviceId}
            leading={
              <span className="flex size-9 items-center justify-center rounded-full bg-muted text-muted-foreground">
                <MonitorSmartphone className="size-4" aria-hidden="true" />
              </span>
            }
            title={`${d.ownerName} · ${d.name}`}
            badges={
              <>
                <StatusBadge device={d} />
                {d.deviceId === identity?.deviceId ? <Badge variant="outline">This device</Badge> : null}
                {!d.ownerActive ? <Badge variant="destructive">Owner no longer active</Badge> : null}
              </>
            }
            meta={
              <>
                Added {formatShortDate(d.createdAt)} · {d.unlock === "prf" ? "Passkey" : "Passphrase"} · Safety code <SafetyCode code={d.safetyCode} />
              </>
            }
            actions={
              canRevoke(d) ? (
                <label className="flex h-11 cursor-pointer items-center gap-2 rounded-md border border-input bg-card px-3 text-sm font-medium shadow-xs hover:bg-accent sm:h-10">
                  <input
                    type="checkbox"
                    aria-label={`Select ${d.name} to remove`}
                    className="size-4 shrink-0 accent-destructive"
                    checked={selected.includes(d.deviceId)}
                    onChange={e => setSelected(s => (e.target.checked ? [...s, d.deviceId] : s.filter(x => x !== d.deviceId)))}
                  />
                  Select
                </label>
              ) : undefined
            }
          />
        ))}
      </AdminList>
      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Button variant="outline" loading={busy && selected.length === 0} onClick={() => setRotateIds([])}>
            <RefreshCw aria-hidden="true" />
            Make new keys now
          </Button>
          {anyRevocable ? (
            <Button
              variant="ghost"
              className="text-destructive hover:bg-destructive/10 hover:text-destructive"
              disabled={selected.length === 0}
              loading={busy && selected.length > 0}
              onClick={() => setRotateIds(selected)}
            >
              <Trash2 aria-hidden="true" />
              Remove selected and make new keys
            </Button>
          ) : null}
        </div>
        <p className="text-sm text-muted-foreground">
          {anyRevocable
            ? "Select the devices to remove first. You can't remove the device you're using now."
            : onlyOwn
              ? "Only your own device is listed."
              : "Only a super admin can remove other admins' devices. You can't remove the device you're using now."}
        </p>
        <WhatIsThis question="What does making new keys do?">{EXPLAIN.rotation}</WhatIsThis>
      </div>
      <ConfirmDialog
        open={rotateIds !== null}
        onOpenChange={open => (open ? undefined : setRotateIds(null))}
        title={rotateIds?.length ? `Remove ${plural(rotateIds.length, "device", "devices")} and make new keys?` : "Make new encryption keys now?"}
        description={rotateIds?.length ? "Those devices won't be able to read anything new." : "Everyone's active devices get them automatically."}
        confirmLabel={rotateIds?.length ? "Remove and make new keys" : "Make new keys"}
        destructive={Boolean(rotateIds?.length)}
        onConfirm={() => revokeAndRotate(rotateIds ?? [])}
      />
    </AdminSectionCard>
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
      toast.success(
        epochs === 1
          ? "Recovery key works: it opens the encryption keys. Nothing was changed."
          : `Recovery key works: it opens all ${epochs} sets of encryption keys, old and new. Nothing was changed.`
      );
      setDrill("");
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSectionCard
      title="Recovery key"
      description={
        <>
          Held on paper by {overview.state.trustees.map(t => t.name).join(" and ") || "nobody yet"}
          {overview.state.recoveryRotatedAt ? ` since ${formatShortDate(overview.state.recoveryRotatedAt)}` : ""}. Test it once a year so you
          know the paper copies still work.
        </>
      }
    >
      <WhatIsThis question="What is the recovery key?">{EXPLAIN.recoveryKey}</WhatIsThis>
      <form onSubmit={runDrill} className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <Field
          label="Test a recovery key (changes nothing)"
          description="Type all 14 groups from a paper copy; spaces and dashes don't matter. Test turns on once every group is in."
          className="min-w-0 flex-1"
        >
          <Input className="font-mono uppercase" autoComplete="off" value={drill} onChange={e => setDrill(e.target.value)} />
        </Field>
        <Button type="submit" variant="outline" className="sm:mt-5.5" loading={busy} disabled={drill.replace(/[\s-]/g, "").length < 55}>
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
            <div className="flex flex-col items-start gap-2">
              <Button variant="outline" onClick={() => setReplaceOpen(true)}>
                Replace recovery key
              </Button>
              <p className="text-sm text-muted-foreground">
                Do this when a trustee steps down or a paper copy may be lost or seen by someone else. The old copies stop working.
              </p>
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
            </div>
          )}
        </div>
      ) : null}
    </AdminSectionCard>
  );
}

/** Admin → Encryption: device keys, approvals, new keys and recovery (plan Phase 3). */
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
    return (
      <Alert variant="destructive">
        <ShieldAlert />
        <AlertTitle>Couldn&apos;t load the encryption status</AlertTitle>
        <AlertDescription>
          <p>{error ?? "Check your internet connection and try again."}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button variant="outline" onClick={refresh}>
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }

  if (status === "integrity-error") {
    return (
      <Alert variant="destructive">
        <ShieldAlert />
        <AlertTitle>{PAUSED_TITLE}</AlertTitle>
        <AlertDescription>
          <p>{PAUSED_BODY}</p>
          <p className="mt-2 font-medium text-foreground">{PAUSED_NEXT_STEP}</p>
          <PausedDetails reason={integrity.status === "failed" ? integrity.reason : null} />
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
          <AlertTitle>Encryption is off</AlertTitle>
          <AlertDescription>
            Once on, admin chat and other private records are encrypted on admins&apos; devices. Not even the server or Google can read them.
            Setting it up takes about 10 minutes and three steps.
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
      <AdminSectionCard
        title="Set up encryption on this device"
        description="Encryption is on for GHMO, but this computer or phone has no keys yet. Set it up here, then another admin approves it (or you use the recovery key)."
      >
        <DeviceSetupForm />
      </AdminSectionCard>
    );
  }

  if (status === "pending" && thisDevice) {
    return (
      <div className="flex flex-col gap-6">
        <AdminSectionCard
          title="Waiting for approval"
          description={`Ask another admin to open Admin → Encryption and approve “${thisDevice.name}”. Read them this code; it must match what they see.`}
        >
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
            {integrity.status === "verified" ? <WhatIsThis question="What is the workspace fingerprint?">{EXPLAIN.fingerprint}</WhatIsThis> : null}
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
        </AdminSectionCard>
        <AdminSectionCard title="Lost every device?" description="Use the paper recovery key held by a trustee to activate this device yourself.">
          <RecoverWithKey />
        </AdminSectionCard>
      </div>
    );
  }

  if (status === "revoked") {
    return (
      <AdminSectionCard
        title="This device was removed"
        description="It no longer gets new keys, so nothing written since then opens here. Clear its keys from this browser, then set the device up again if you still use it."
      >
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={forgetThisDevice}>
            Remove keys from this browser
          </Button>
        </div>
      </AdminSectionCard>
    );
  }

  const approved = overview.devices.filter(d => d.status === "active").length;

  return (
    <div className="flex flex-col gap-6">
      <Card className="gap-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <ShieldCheck className="size-8 shrink-0 text-success" aria-hidden="true" />
            <div className="min-w-0">
              <p className="font-semibold">End-to-end encryption is on</p>
              <p className="text-sm text-muted-foreground">{plural(approved, "approved device", "approved devices")}</p>
            </div>
          </div>
          {status === "unlocked" ? (
            <Button variant="outline" onClick={lock}>
              <Lock aria-hidden="true" />
              Lock
            </Button>
          ) : null}
        </div>
        <IntegrityLine />
      </Card>
      {status === "locked" ? <UnlockCard /> : null}
      <UnsealedAlert />
      {status === "unlocked" ? (
        <>
          <PendingDevicesSection />
          <MigrationSection />
          <DevicesSection />
          <RecoverySection />
        </>
      ) : null}
    </div>
  );
}
