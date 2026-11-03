"use client";

import { KeyRound, Lock } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/src/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";

export function errorText(err: unknown) {
  const name = (err as { name?: string })?.name;
  if (name === "NotAllowedError") return "The passkey prompt was closed. Try again.";
  return err instanceof Error ? err.message : "Something went wrong";
}

/**
 * Unlocks this device's keys with its passkey (or passphrase). On the Encryption page it stands alone;
 * on an encrypted page (`what` given) it is that page's whole locked state, one card with one button.
 */
export function UnlockCard({ what, detail }: { what?: string; detail?: string } = {}) {
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
      <CardHeader className="flex-row items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Lock className="size-5" aria-hidden="true" />
        </span>
        <span className="flex min-w-0 flex-col gap-1">
          <CardTitle>{what ? `Unlock to see ${what}` : "Unlock encryption on this device"}</CardTitle>
          <CardDescription>
            {what
              ? (detail ?? "Only approved admin devices can read it.") + " It locks again when you close the tab."
              : "Private records stay unreadable until you unlock. The keys are forgotten again when you lock or close the tab."}
          </CardDescription>
        </span>
      </CardHeader>
      <form onSubmit={submit} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {usesPassphrase ? (
          <Field label="Encryption passphrase" className="min-w-0 flex-1">
            <Input type="password" autoComplete="current-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
          </Field>
        ) : null}
        <Button type="submit" size="lg" loading={busy}>
          <KeyRound aria-hidden="true" />
          {usesPassphrase ? "Unlock" : "Unlock with passkey"}
        </Button>
      </form>
    </Card>
  );
}
