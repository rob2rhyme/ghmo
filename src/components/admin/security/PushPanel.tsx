"use client";

import { BellRing, RefreshCw, Smartphone } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";

type Device = { id: string; label: string; kinds: string[]; createdAt: number | null; lastSentAt: number | null };
type PushState = { configured: boolean; publicKey: string | null; kinds: string[]; devices: Device[] };

/** What each kind says, in the same words as the email list on this page. */
const KIND_LABELS: Record<string, string> = { chat: "New activity in Admin chat", thread: "New activity in Plans & Issues" };

const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/** The same short id the server gives a device, from its secret address (first 32 hex characters of the SHA-256). */
async function deviceIdFor(endpoint: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(endpoint));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 32);
}

function keyBytes(base64url: string): Uint8Array<ArrayBuffer> {
  const padded = base64url.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (base64url.length % 4)) % 4);
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const dayText = (millis: number) => new Date(millis).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

async function api(method: string, body?: unknown) {
  const res = await fetch("/api/admin/push", {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Could not save");
  return data as { devices: Device[] };
}

export default function PushPanel() {
  const [state, setState] = useState<PushState | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false);
  /** The id of this browser's own device, when it is subscribed here and known to the server. */
  const [thisId, setThisId] = useState<string | null>(null);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">("default");

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/push", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then(async (data: PushState | null) => {
        if (cancelled) return;
        if (!data) {
          setLoadFailed(true);
          return;
        }
        setState(data);
        if (!supported()) {
          setPermission("unsupported");
          return;
        }
        setPermission(Notification.permission);
        try {
          const registration = await navigator.serviceWorker.getRegistration();
          const subscription = registration ? await registration.pushManager.getSubscription() : null;
          const id = subscription ? await deviceIdFor(subscription.endpoint) : null;
          if (!cancelled) setThisId(id && data.devices.some(device => device.id === id) ? id : null);
        } catch {
          if (!cancelled) setThisId(null);
        }
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  const withBusy = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!state) {
    if (loadFailed) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your push settings</AlertTitle>
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
        <span className="sr-only">Loading push settings…</span>
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  const turnOnHere = () =>
    withBusy(async () => {
      if (!state.publicKey) throw new Error("Push notifications aren't set up on this site yet.");
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== "granted") throw new Error("Notifications are blocked for this site in your browser. Allow them in the browser's site settings, then try again.");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      const subscription = existing ?? (await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(state.publicKey) }));
      try {
        const data = await api("POST", { subscription: subscription.toJSON(), kinds: state.kinds });
        setState({ ...state, devices: data.devices });
        setThisId(await deviceIdFor(subscription.endpoint));
        toast.success("Push notifications are on for this device");
      } catch (error) {
        // The site refused it, so don't leave the browser holding a subscription nobody will send to.
        await subscription.unsubscribe().catch(() => undefined);
        throw error;
      }
    });

  const turnOff = (device: Device) =>
    withBusy(async () => {
      const data = await api("DELETE", { id: device.id });
      setState({ ...state, devices: data.devices });
      if (device.id === thisId) {
        const registration = await navigator.serviceWorker.getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        await subscription?.unsubscribe().catch(() => undefined);
        setThisId(null);
      }
      toast.success("Push notifications are off for that device");
    });

  const setKind = (device: Device, kind: string, on: boolean) =>
    withBusy(async () => {
      const kinds = on ? [...new Set([...device.kinds, kind])] : device.kinds.filter(existing => existing !== kind);
      const data = await api("PATCH", { id: device.id, kinds });
      setState({ ...state, devices: data.devices });
    });

  const hereOn = thisId !== null;

  return (
    <AdminSectionCard
      as="h3"
      icon={<BellRing aria-hidden="true" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Push notifications on this device
          {hereOn ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>}
        </span>
      }
      description="A short alert on your phone or computer when something needs you. It never shows names, messages or titles, only that there is something new, and you get at most one of each kind a minute."
    >
      <div className="flex flex-col gap-3">
        {!state.configured ? (
          <Alert>
            <AlertDescription>Push notifications aren&apos;t set up on this site yet, so nothing can be sent. Ask whoever manages the website to add the push keys.</AlertDescription>
          </Alert>
        ) : permission === "unsupported" ? (
          <Alert>
            <AlertDescription>This browser can&apos;t receive push notifications. On an iPhone or iPad, add this site to your Home Screen (Share, then Add to Home Screen) and open it from there. It needs iOS 16.4 or later.</AlertDescription>
          </Alert>
        ) : (
          <>
            {permission === "denied" && !hereOn ? (
              <Alert variant="destructive">
                <AlertDescription>Notifications are blocked for this site in your browser. Allow them in the browser&apos;s site settings, then come back and turn them on.</AlertDescription>
              </Alert>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {hereOn ? (
                <Button variant="outline" loading={busy} onClick={() => void turnOff(state.devices.find(device => device.id === thisId) as Device)}>
                  Turn off push on this device
                </Button>
              ) : (
                <Button loading={busy} onClick={() => void turnOnHere()}>
                  Turn on push on this device
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">On an iPhone or iPad this works only from the Home Screen app (iOS 16.4 or later). Android and computers work in the browser.</p>
          </>
        )}

        {state.devices.length > 0 ? (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Your devices</h4>
            <ul className="flex flex-col gap-3">
              {state.devices.map(device => (
                <li key={device.id} className="flex flex-col gap-2 rounded-lg border p-3" data-testid="push-device">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                      <Smartphone aria-hidden="true" className="size-4 text-muted-foreground" />
                      {device.label}
                      {device.id === thisId ? <Badge variant="secondary">This device</Badge> : null}
                    </span>
                    <Button variant="outline" size="row" disabled={busy} onClick={() => void turnOff(device)}>
                      Turn off
                      <span className="sr-only"> for {device.label}</span>
                    </Button>
                  </div>
                  <div className="flex flex-col gap-1">
                    {state.kinds.map(kind => (
                      <label key={kind} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 accent-primary"
                          checked={device.kinds.includes(kind)}
                          disabled={busy}
                          onChange={event => void setKind(device, kind, event.target.checked)}
                        />
                        {KIND_LABELS[kind] ?? kind}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {device.createdAt ? `Added ${dayText(device.createdAt)}. ` : ""}
                    {device.lastSentAt ? `Last alert sent ${dayText(device.lastSentAt)}.` : "No alert has been sent to it yet."}
                  </p>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </AdminSectionCard>
  );
}
