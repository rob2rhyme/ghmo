"use client";

import { Fingerprint, KeyRound } from "lucide-react";
import { useState } from "react";
import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { PrfUnavailableError } from "@/src/lib/e2ee/client/prf";

/** Creates this browser's encryption keys, locked with a passkey (preferred) or a passphrase. */
export function DeviceSetupForm({ onDone }: { onDone?: () => void }) {
  const { createDevice } = useE2ee();
  const [name, setName] = useState("");
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [passphrase, setPassphrase] = useState("");
  const [confirmPassphrase, setConfirmPassphrase] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (usePassphrase && (passphrase.length < 12 || passphrase !== confirmPassphrase)) {
      setError(passphrase.length < 12 ? "Use at least 12 characters." : "The passphrases don't match.");
      return;
    }
    setBusy(true);
    try {
      await createDevice({ name: name.trim() || "This device", method: usePassphrase ? "passphrase" : "prf", passphrase });
      onDone?.();
    } catch (err) {
      if (err instanceof PrfUnavailableError) {
        setUsePassphrase(true);
        setError(err.message);
      } else {
        const errorName = (err as { name?: string })?.name;
        setError(errorName === "NotAllowedError" ? "The passkey prompt was closed. Try again." : err instanceof Error ? err.message : "Setup failed");
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <Field label="Name this device" description="So other admins can recognise it, e.g. “Sita’s laptop”.">
        <Input value={name} onChange={e => setName(e.target.value)} maxLength={60} placeholder="My laptop" />
      </Field>
      {usePassphrase ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Encryption passphrase" description="At least 12 characters. Needed each time you unlock.">
            <Input type="password" autoComplete="new-password" value={passphrase} onChange={e => setPassphrase(e.target.value)} />
          </Field>
          <Field label="Repeat passphrase">
            <Input type="password" autoComplete="new-password" value={confirmPassphrase} onChange={e => setConfirmPassphrase(e.target.value)} />
          </Field>
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button type="submit" loading={busy}>
          {usePassphrase ? <KeyRound aria-hidden="true" /> : <Fingerprint aria-hidden="true" />}
          {usePassphrase ? "Create keys with passphrase" : "Create keys with my passkey"}
        </Button>
        {!usePassphrase ? (
          <Button type="button" variant="ghost" onClick={() => setUsePassphrase(true)}>
            Use a passphrase instead
          </Button>
        ) : null}
      </div>
    </form>
  );
}
