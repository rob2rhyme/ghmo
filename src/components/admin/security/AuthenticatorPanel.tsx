"use client";

import { Check, CheckCircle2, Copy, RefreshCw, ShieldCheck, Smartphone, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { AdminList, AdminListRow } from "@/src/components/admin/AdminList";
import { AuthenticatorSetup } from "@/app/(auth)/admin/login/AuthenticatorSteps";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { PASSKEYS_CHANGED_EVENT } from "./PasskeysPanel";

type Status = { totp: { state: "none" | "pending" | "active"; recoveryCodesLeft: number }; hasActivePasskey: boolean };
type OtherAdmin = { uid: string; name: string; email: string | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Something went wrong. Try again.");
  return data;
}

/** One sign-in method in the summary: a tick or a cross, said in words too. */
function MethodStatus({ label, on }: { label: string; on: boolean }) {
  return (
    <li>
      <Badge variant={on ? "success" : "outline"} className="gap-1.5 px-3 py-1 text-sm font-medium">
        {on ? <Check aria-hidden="true" className="size-3.5!" /> : <X aria-hidden="true" className="size-3.5! text-muted-foreground" />}
        {label}
        <span className="sr-only">{on ? ": set up" : ": not set up"}</span>
      </Badge>
    </li>
  );
}

/**
 * Your authenticator app: set it up, replace recovery codes, and (super admins) reset another admin's.
 * Also shows the sign-in summary at the top of the page, from the same status it already loads.
 */
export default function AuthenticatorPanel({ superAdmin }: { superAdmin: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [others, setOthers] = useState<OtherAdmin[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);
  const [confirmCodes, setConfirmCodes] = useState(false);
  const [resetTarget, setResetTarget] = useState<OtherAdmin | null>(null);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/auth/totp"));
      if (superAdmin) setOthers((await api<{ admins: OtherAdmin[] }>("/api/admin/totp")).admins);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load");
    }
  }, [superAdmin]);

  // Adding or removing a passkey below changes the summary, so reload the status then.
  useEffect(() => {
    const onChange = () => void load();
    window.addEventListener(PASSKEYS_CHANGED_EVENT, onChange);
    return () => window.removeEventListener(PASSKEYS_CHANGED_EVENT, onChange);
  }, [load]);

  useEffect(() => {
    let active = true;
    const first = api<Status>("/api/auth/totp");
    const list = superAdmin ? api<{ admins: OtherAdmin[] }>("/api/admin/totp") : Promise.resolve({ admins: [] as OtherAdmin[] });
    Promise.all([first, list])
      .then(([nextStatus, nextList]) => {
        if (!active) return;
        setStatus(nextStatus);
        setOthers(nextList.admins);
      })
      .catch(err => {
        if (active) setLoadError(err instanceof Error ? err.message : "Could not load");
      });
    return () => {
      active = false;
    };
  }, [superAdmin]);

  const regenerate = async () => {
    setConfirmCodes(false);
    setBusy("codes");
    try {
      setNewCodes((await api<{ recoveryCodes: string[] }>("/api/auth/totp/recovery-codes", { method: "POST", body: "{}" })).recoveryCodes);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not make new codes");
    } finally {
      setBusy(null);
    }
  };

  const reset = async (admin: OtherAdmin) => {
    setResetTarget(null);
    setBusy(admin.uid);
    try {
      await api(`/api/admin/totp/${encodeURIComponent(admin.uid)}`, { method: "DELETE" });
      toast.success(`Authenticator reset for ${admin.name}`);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset");
    } finally {
      setBusy(null);
    }
  };

  if (loadError) {
    return (
      <Alert variant="destructive">
        <AlertTitle>Couldn&apos;t load your sign-in methods</AlertTitle>
        <AlertDescription>
          <p>{loadError}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setLoadError(null);
                void load();
              }}
            >
              <RefreshCw aria-hidden="true" />
              Try again
            </Button>
          </div>
        </AlertDescription>
      </Alert>
    );
  }
  if (!status) {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Loading your sign-in methods…</span>
        <Skeleton className="h-28 w-full rounded-xl" />
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const active = status.totp.state === "active";
  const anyMethod = active || status.hasActivePasskey;
  return (
    <>
    <AdminSectionCard
      as="h3"
      icon={<ShieldCheck aria-hidden="true" />}
      title="Your sign-in at a glance"
      description={
        anyMethod
          ? "Most admins use the email link plus the authenticator app. A passkey is a quicker extra way in on devices that support it."
          : "Set up the authenticator app below so you can sign in next time. A passkey is a quicker extra way in."
      }
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-medium">You can sign in with:</span>
        <ul className="flex flex-wrap gap-2">
          <MethodStatus label="Authenticator app" on={active} />
          <MethodStatus label="Passkey" on={status.hasActivePasskey} />
        </ul>
      </div>
    </AdminSectionCard>
    <AdminSectionCard
      as="h3"
      icon={<Smartphone aria-hidden="true" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Authenticator app
          {active ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden="true" /> On
            </Badge>
          ) : (
            <Badge variant="warning">Not set up</Badge>
          )}
        </span>
      }
      description="A 6-digit code from an app on your phone, used after the email link. Apps like Google Authenticator or Authy work."
    >
      <div className="flex flex-col gap-4">
        {newCodes ? (
          <div className="flex flex-col gap-3">
            <Alert variant="warning">
              <AlertTitle>Your new recovery codes</AlertTitle>
              <AlertDescription>Each works once. They are shown only now; save them somewhere safe.</AlertDescription>
            </Alert>
            <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-muted p-3 font-mono text-sm">
              {newCodes.map(c => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(newCodes.join("\n")).then(() => toast.success("Codes copied"))}>
                <Copy aria-hidden="true" /> Copy codes
              </Button>
              <Button variant="ghost" onClick={() => setNewCodes(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}

        {active ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>Recovery codes left: {status.totp.recoveryCodesLeft}</span>
              <Button variant="outline" size="row" onClick={() => setConfirmCodes(true)} loading={busy === "codes"} disabled={busy !== null}>
                Make new recovery codes
              </Button>
            </div>
            <p className="text-sm text-muted-foreground">Recovery codes let you sign in if you lose your phone. Each one works once.</p>
            <ConfirmDialog
              open={confirmCodes}
              onOpenChange={setConfirmCodes}
              title="Make new recovery codes?"
              description="The old ones will stop working."
              confirmLabel="Make new codes"
              onConfirm={regenerate}
            />
          </div>
        ) : setupOpen ? (
          <>
            <AuthenticatorSetup
              onError={setSetupError}
              onDone={() => {
                setSetupOpen(false);
                toast.success("Authenticator app is on");
                void load();
              }}
            />
            {setupError ? (
              <Alert variant="destructive">
                <AlertDescription>{setupError}</AlertDescription>
              </Alert>
            ) : null}
          </>
        ) : (
          <div className="flex flex-wrap gap-2">
            <Button size="lg" onClick={() => setSetupOpen(true)}>
              Set up authenticator app
            </Button>
          </div>
        )}

        {superAdmin && others.length > 0 ? (
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-sm font-semibold">Reset another admin&apos;s authenticator</h3>
            <p className="text-sm text-muted-foreground">
              For an admin who lost their phone and recovery codes. Check it really is them first (a call is best).
            </p>
            <AdminList label="Other admins">
              {others.map(a => (
                <AdminListRow
                  key={a.uid}
                  title={a.name}
                  meta={a.email ? <span className="break-words">{a.email}</span> : undefined}
                  actions={
                    <Button
                      variant="ghost"
                      size="row"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      onClick={() => setResetTarget(a)}
                      loading={busy === a.uid}
                      disabled={busy !== null}
                    >
                      Reset
                    </Button>
                  }
                />
              ))}
            </AdminList>
            <ConfirmDialog
              open={resetTarget !== null}
              onOpenChange={open => (open ? undefined : setResetTarget(null))}
              title={`Reset the authenticator app for ${resetTarget?.name ?? ""}?`}
              description="They will be signed out and must set up a new app after their next email-link sign-in."
              confirmLabel="Reset authenticator"
              destructive
              onConfirm={() => (resetTarget ? reset(resetTarget) : undefined)}
            />
          </div>
        ) : null}
      </div>
    </AdminSectionCard>
    </>
  );
}
