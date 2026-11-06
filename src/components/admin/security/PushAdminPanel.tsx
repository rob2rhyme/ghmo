"use client";

import { BellOff, BellRing, RefreshCw, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { ConfirmDialog } from "@/src/components/ui/confirm-dialog";
import { Skeleton } from "@/src/components/ui/skeleton";
import { pushKindLabel } from "@/src/lib/push";
import type { AdminDeviceRow } from "@/src/lib/pushAdmin";

type Settings = { enabled: boolean; updatedAt: number | null; updatedByName: string | null; configured: boolean };

const dayText = (millis: number) => new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function send<T>(url: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error || "Something went wrong");
  return data as T;
}

/**
 * Super-admin push controls (plan §21): a switch for the whole site, and everyone's push devices with a Turn off for each,
 * for example for a lost phone. The server shows names and times only, never a device's address or keys, and refuses
 * anyone who is not a super admin, so this panel is shown only to them.
 */
export default function PushAdminPanel() {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [devices, setDevices] = useState<AdminDeviceRow[] | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [removing, setRemoving] = useState<AdminDeviceRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch("/api/admin/push-settings", { cache: "no-store" }).then(res => (res.ok ? res.json() : Promise.reject(new Error("settings")))),
      fetch("/api/admin/push-devices", { cache: "no-store" }).then(res => (res.ok ? res.json() : Promise.reject(new Error("devices"))))
    ])
      .then(([nextSettings, list]) => {
        if (cancelled) return;
        setSettings(nextSettings as Settings);
        setDevices((list as { devices: AdminDeviceRow[] }).devices);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!settings || !devices) {
    if (loadFailed) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load the push controls</AlertTitle>
          <AlertDescription>
            <p>Check your internet connection and try again.</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={() => {
                  setLoadFailed(false);
                  setAttempt(n => n + 1);
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
    return (
      <div role="status">
        <span className="sr-only">Loading the push controls…</span>
        <Skeleton className="h-40 w-full rounded-xl" />
      </div>
    );
  }

  const switchTo = async (enabled: boolean) => {
    setBusy(true);
    try {
      setSettings(await send<Settings>("/api/admin/push-settings", "PUT", { enabled }));
      setConfirmingOff(false);
      toast.success(enabled ? "Push notifications turned on for the site" : "Push notifications turned off for the site");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change it");
    } finally {
      setBusy(false);
    }
  };

  const removeDevice = async (device: AdminDeviceRow) => {
    setBusy(true);
    try {
      const data = await send<{ devices: AdminDeviceRow[] }>(`/api/admin/push-devices/${encodeURIComponent(device.id)}`, "DELETE");
      setDevices(data.devices);
      setRemoving(null);
      toast.success("That device will no longer get alerts");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not turn it off");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <AdminSectionCard
        as="h3"
        icon={settings.enabled ? <BellRing aria-hidden="true" /> : <BellOff aria-hidden="true" />}
        title={
          <span className="flex flex-wrap items-center gap-2">
            Push for the whole site
            {settings.enabled ? <Badge variant="success">On</Badge> : <Badge variant="destructive">Off</Badge>}
          </span>
        }
        description="Turn push off to stop every alert on every phone and computer at once, for example if something is wrong. Email is not affected, and nobody has to set anything up again when you turn it back on."
        actions={
          settings.enabled ? (
            <Button variant="outline" size="row" onClick={() => setConfirmingOff(true)}>
              Turn push off…
            </Button>
          ) : (
            <Button size="row" loading={busy} onClick={() => void switchTo(true)}>
              Turn push on
            </Button>
          )
        }
      >
        <div className="flex flex-col gap-2 text-sm text-muted-foreground">
          {settings.updatedAt ? <p>{`Last changed${settings.updatedByName ? ` by ${settings.updatedByName}` : ""} on ${dayText(settings.updatedAt)}.`}</p> : <p>It has not been changed. Push is on whenever the push keys are set.</p>}
          {!settings.configured ? <p>The push keys are not set on this site yet, so nothing is sent either way.</p> : null}
        </div>
      </AdminSectionCard>

      <AdminSectionCard
        as="h3"
        icon={<Smartphone aria-hidden="true" />}
        title="Everyone's push devices"
        description="Use this to turn off a lost or stolen phone. You see whose it is, its name and when it last got an alert, never its address. Turning a device off does not change anyone's admin access; its owner can turn it on again from that device."
      >
        {devices.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nobody has turned push on yet.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {devices.map(device => (
              <li key={device.id} className="flex flex-col gap-2 rounded-lg border p-3" data-testid="all-push-device">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                    {device.adminName}
                    {!device.adminActive ? <Badge variant="secondary">Account turned off</Badge> : null}
                    <span className="font-normal text-muted-foreground">· {device.label}</span>
                  </span>
                  <Button variant="outline" size="row" disabled={busy} onClick={() => setRemoving(device)} aria-label={`Turn off ${device.label} for ${device.adminName}`}>
                    Turn off…
                  </Button>
                </div>
                <p className="text-sm text-muted-foreground">{device.kinds.length > 0 ? device.kinds.map(pushKindLabel).join(" · ") : "No alerts are turned on for it."}</p>
                <p className="text-xs text-muted-foreground">
                  {device.createdAt ? `Added ${dayText(device.createdAt)}. ` : ""}
                  {device.lastSentAt ? `Last alert sent ${dayText(device.lastSentAt)}.` : "No alert has been sent to it yet."}
                </p>
              </li>
            ))}
          </ul>
        )}
      </AdminSectionCard>

      <ConfirmDialog
        open={confirmingOff}
        onOpenChange={setConfirmingOff}
        title="Turn push off for everyone?"
        description="No phone or computer will get a push notification until you turn it back on. Email alerts are not affected, and nobody has to set anything up again."
        confirmLabel="Turn push off"
        destructive
        busy={busy}
        onConfirm={() => switchTo(false)}
      />
      <ConfirmDialog
        open={removing !== null}
        onOpenChange={open => !open && setRemoving(null)}
        title={removing ? `Turn off ${removing.label} for ${removing.adminName}?` : "Turn off this device?"}
        description="It stops getting alerts now. It does not change their admin access, and they can turn it on again from that device."
        confirmLabel="Turn off device"
        destructive
        busy={busy}
        onConfirm={() => (removing ? removeDevice(removing) : undefined)}
      />
    </>
  );
}
