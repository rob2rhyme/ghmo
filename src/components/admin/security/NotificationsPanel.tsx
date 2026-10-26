"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";

type Prefs = { email: boolean; configured: boolean; address: string | null };

export default function NotificationsPanel() {
  const [prefs, setPrefs] = useState<Prefs | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/notifications", { cache: "no-store" })
      .then(res => (res.ok ? res.json() : null))
      .then(data => {
        if (!cancelled && data) setPrefs(data);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!prefs) return null;

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
        <CardTitle>Email notifications</CardTitle>
        <CardDescription>
          Get an email when there is new activity in Admin Chat or Plans & Issues, or minutes need approval. The email never contains
          any content, only a link, and you get at most one of each kind every 30 minutes.
          {prefs.address ? ` Sent to ${prefs.address}.` : ""}
        </CardDescription>
      </CardHeader>
      <div className="flex flex-col gap-2">
        {!prefs.configured ? <p className="text-sm text-muted-foreground">Email sending isn&apos;t set up on this site yet, so nothing will be sent.</p> : null}
        <Button onClick={toggle} loading={busy} variant={prefs.email ? "outline" : "default"} className="self-start">
          {prefs.email ? "Turn off email notifications" : "Turn on email notifications"}
        </Button>
      </div>
    </Card>
  );
}
