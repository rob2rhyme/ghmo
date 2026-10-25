"use client";

import { CheckCircle2, Copy, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AuthenticatorSetup } from "@/app/(auth)/admin/login/AuthenticatorSteps";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";

type Status = { totp: { state: "none" | "pending" | "active"; recoveryCodesLeft: number }; hasActivePasskey: boolean };
type OtherAdmin = { uid: string; name: string; email: string | null };

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) } });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

/** Your authenticator app: set it up, replace recovery codes, and (super admins) reset another admin's. */
export default function AuthenticatorPanel({ superAdmin }: { superAdmin: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [others, setOthers] = useState<OtherAdmin[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);
  const [newCodes, setNewCodes] = useState<string[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [setupOpen, setSetupOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      setStatus(await api<Status>("/api/auth/totp"));
      if (superAdmin) setOthers((await api<{ admins: OtherAdmin[] }>("/api/admin/totp")).admins);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load");
    }
  }, [superAdmin]);

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
    if (!window.confirm("Make new recovery codes? The old ones will stop working.")) return;
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
    if (!window.confirm(`Reset the authenticator app for ${admin.name}? They will be signed out and must set up a new app after their next email-link sign-in.`)) return;
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
        <AlertDescription>{loadError}</AlertDescription>
      </Alert>
    );
  }
  if (!status) return <Skeleton className="h-40 w-full" />;

  const active = status.totp.state === "active";
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Smartphone aria-hidden="true" className="size-5" /> Authenticator app
          {active ? (
            <Badge variant="success">
              <CheckCircle2 aria-hidden="true" /> On
            </Badge>
          ) : (
            <Badge variant="warning">Not set up</Badge>
          )}
        </CardTitle>
        <CardDescription>
          After your email link you enter a 6-digit code from an app like Google Authenticator or Authy. Passkeys are optional.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {newCodes ? (
          <div className="flex flex-col gap-3">
            <Alert variant="warning">
              <AlertTitle>Your new recovery codes</AlertTitle>
              <AlertDescription>Each works once. They are shown only now; save them somewhere safe.</AlertDescription>
            </Alert>
            <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
              {newCodes.map(c => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => void navigator.clipboard?.writeText(newCodes.join("\n"))}>
                <Copy aria-hidden="true" /> Copy codes
              </Button>
              <Button variant="ghost" onClick={() => setNewCodes(null)}>
                Done
              </Button>
            </div>
          </div>
        ) : null}

        {active ? (
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span>Recovery codes left: {status.totp.recoveryCodesLeft}</span>
            <Button variant="outline" size="sm" onClick={regenerate} loading={busy === "codes"} disabled={busy !== null}>
              Make new recovery codes
            </Button>
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
          <div>
            <Button onClick={() => setSetupOpen(true)}>Set up authenticator app</Button>
          </div>
        )}

        {superAdmin && others.length > 0 ? (
          <div className="flex flex-col gap-2 border-t pt-4">
            <h3 className="text-sm font-semibold">Reset another admin&apos;s authenticator</h3>
            <p className="text-sm text-muted-foreground">
              For an admin who lost their phone and recovery codes. Check it really is them first (a call is best).
            </p>
            <ul className="flex flex-col gap-2">
              {others.map(a => (
                <li key={a.uid} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                  <span>
                    {a.name}
                    {a.email ? <span className="text-muted-foreground"> · {a.email}</span> : null}
                  </span>
                  <Button variant="destructive" size="sm" onClick={() => reset(a)} loading={busy === a.uid} disabled={busy !== null}>
                    Reset
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
