"use client";

import { Mail } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Badge } from "@/src/components/ui/badge";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Skeleton } from "@/src/components/ui/skeleton";

type Prefs = { email: boolean; configured: boolean; address: string | null };

export default function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);

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
  }, []);

  if (!prefs) {
    if (loadFailed) {
      return (
        <Alert variant="destructive">
          <AlertDescription>Could not load your email settings. Reload the page to try again.</AlertDescription>
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
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Mail aria-hidden="true" className="size-5 shrink-0 text-primary" /> Email notifications
          {prefs.email ? <Badge variant="success">On</Badge> : <Badge variant="secondary">Off</Badge>}
        </CardTitle>
        <CardDescription>
          Get an email when there is new activity in Admin Chat or Plans & Issues, or minutes need approval. The email never contains
          any content, only a link, and you get at most one of each kind every 30 minutes.
          {prefs.address ? ` Sent to ${prefs.address}.` : ""}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-3">
        {!prefs.configured ? <p className="text-sm text-muted-foreground">Email sending isn&apos;t set up on this site yet, so nothing will be sent.</p> : null}
        <div className="flex flex-wrap gap-2">
          <Button onClick={toggle} loading={busy} variant="outline">
            {prefs.email ? "Turn off email notifications" : "Turn on email notifications"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
