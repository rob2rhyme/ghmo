"use client";

import { Mail, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import AdminSectionCard from "@/src/components/admin/AdminSectionCard";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";

type Prefs = { email: boolean; configured: boolean; address: string | null };

export default function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/notifications", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (cancelled) return;
        if (data) setPrefs(data);
        else setLoadFailed(true);
      })
      .catch(() => {
        if (!cancelled) setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [attempt]);

  if (!prefs) {
    if (loadFailed) {
      return (
        <Alert variant="destructive">
          <AlertTitle>Couldn&apos;t load your email settings</AlertTitle>
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
        <span className="sr-only">Loading email settings…</span>
        <Skeleton className="h-36 w-full rounded-xl" />
      </div>
    );
  }

  const toggle = async () => {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: !prefs.email })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not save");
      setPrefs({ ...prefs, email: data.email });
      toast.success(data.email ? "Email notifications on" : "Email notifications off");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminSectionCard
      as="h3"
      icon={<Mail aria-hidden="true" />}
      title={
        <span className="flex flex-wrap items-center gap-2">
          Email notifications
          {prefs.email ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>}
        </span>
      }
      description={
        <>
          An email never contains any content, only a link, and you get at most one of each kind every 30 minutes.
          {prefs.address ? ` Sent to ${prefs.address}.` : ""}
        </>
      }
    >
      <div className="flex flex-col gap-3">
        {/* Every kind in src/lib/notifications.ts (R4 C12). Outside the description, which is a <p>. */}
        <div className="text-sm">
          <p>When they are on, you get an email when:</p>
          <ul className="mt-1 list-disc pl-5 text-muted-foreground">
            <li>there is new activity in Admin chat or Plans &amp; Issues</li>
            <li>meeting minutes are waiting for approval</li>
            <li>a broadcast to members is waiting for a second admin&apos;s approval</li>
            <li>a call campaign has calls for you to make (and a reminder while some are left)</li>
            <li>an admin&apos;s authenticator app is locked after too many wrong codes</li>
          </ul>
        </div>
        {!prefs.configured ? <p className="text-sm text-muted-foreground">Email sending isn&apos;t set up on this site yet, so nothing will be sent.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={toggle} loading={busy} variant="outline">
            {prefs.email ? "Turn off email notifications" : "Turn on email notifications"}
          </Button>
        </div>
      </div>
    </AdminSectionCard>
  );
}
