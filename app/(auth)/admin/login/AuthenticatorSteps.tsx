"use client";

import QRCode from "qrcode";
import { Copy, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { postJson } from "./postJson";

/** Second step after the email link: the 6-digit code from the app, or a recovery code. */
export function AuthenticatorCodeForm({ onDone, onError }: { onDone: () => void; onError: (message: string | null) => void }) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [warning, setWarning] = useState<string | null>(null);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    onError(null);
    setBusy(true);
    try {
      const result = await postJson<{ usedRecoveryCode?: boolean; recoveryCodesLeft?: number }>("/api/auth/totp/verify", { code });
      if (result.usedRecoveryCode) {
        setWarning(
          `You signed in with a recovery code. ${result.recoveryCodesLeft ?? 0} left. Once you are in, open Admin → Security to make new ones.`
        );
        // Give the person a moment to read it before the page changes.
        setTimeout(onDone, 2500);
      } else {
        onDone();
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not check that code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {recovery ? (
        <Field label="Recovery code" description="One of the codes you saved when you set up the app. Each works once.">
          <Input
            value={code}
            onChange={e => setCode(e.target.value)}
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="ABCDE-FGHJK"
            required
          />
        </Field>
      ) : (
        <Field label="6-digit code" description="Open your authenticator app and type the code shown for GHMO Admin.">
          <Input
            value={code}
            onChange={e => setCode(e.target.value)}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={7}
            placeholder="123 456"
            required
            autoFocus
          />
        </Field>
      )}
      <Button type="submit" size="lg" loading={busy} disabled={!code.trim()}>
        <ShieldCheck aria-hidden="true" />
        Sign in
      </Button>
      <Button
        type="button"
        variant="ghost"
        onClick={() => {
          setRecovery(r => !r);
          setCode("");
          onError(null);
        }}
      >
        {recovery ? "Use the code from my app instead" : "I lost my phone: use a recovery code"}
      </Button>
      {warning ? (
        <Alert variant="warning" role="status">
          <AlertDescription>{warning}</AlertDescription>
        </Alert>
      ) : null}
    </form>
  );
}

/** Set up the authenticator app: show the QR code, check the first code, then show the recovery codes once. */
export function AuthenticatorSetup({ onDone, onError }: { onDone: () => void; onError: (message: string | null) => void }) {
  const [setup, setSetup] = useState<{ uri: string; secret: string } | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<null | "start" | "confirm">(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!setup) return;
    let active = true;
    QRCode.toDataURL(setup.uri, { margin: 1, width: 220, errorCorrectionLevel: "M" })
      .then(url => active && setQr(url))
      .catch(() => active && setQr(null));
    return () => {
      active = false;
    };
  }, [setup]);

  const start = async () => {
    onError(null);
    setBusy("start");
    try {
      setSetup(await postJson<{ uri: string; secret: string }>("/api/auth/totp/setup", {}));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not start setup");
    } finally {
      setBusy(null);
    }
  };

  const confirm = async (event: React.FormEvent) => {
    event.preventDefault();
    onError(null);
    setBusy("confirm");
    try {
      const result = await postJson<{ recoveryCodes: string[] }>("/api/auth/totp/confirm", { code });
      setRecoveryCodes(result.recoveryCodes);
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not check that code");
    } finally {
      setBusy(null);
    }
  };

  if (recoveryCodes) {
    return (
      <div className="flex flex-col gap-4">
        <Alert variant="warning">
          <AlertTitle>Save your recovery codes</AlertTitle>
          <AlertDescription>
            If you lose your phone, each of these codes lets you sign in once. They are shown only now. Write them down or keep
            them in a password manager, not in your email.
          </AlertDescription>
        </Alert>
        <ul aria-label="Recovery codes" className="grid grid-cols-2 gap-2 rounded-md border bg-muted p-3 font-mono text-sm">
          {recoveryCodes.map(c => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <Button type="button" variant="outline" onClick={() => void navigator.clipboard?.writeText(recoveryCodes.join("\n"))}>
          <Copy aria-hidden="true" />
          Copy codes
        </Button>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" className="mt-1" checked={saved} onChange={e => setSaved(e.target.checked)} />I have saved these codes
        </label>
        <Button size="lg" onClick={onDone} disabled={!saved}>
          Continue
        </Button>
      </div>
    );
  }

  if (!setup) {
    return (
      <Button size="lg" onClick={start} loading={busy === "start"} disabled={busy !== null}>
        <Smartphone aria-hidden="true" />
        Set up authenticator app
      </Button>
    );
  }

  return (
    <form onSubmit={confirm} className="flex flex-col gap-4">
      <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground">
        <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator, Authy or 1Password).</li>
        <li>In the app choose “Add account” and scan this code.</li>
        <li>Type the 6-digit code the app shows.</li>
      </ol>
      <div className="flex flex-col items-center gap-2">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element -- a data: URL made in this browser
          <img src={qr} width={220} height={220} alt="QR code to add GHMO Admin to your authenticator app" className="rounded-md border bg-white p-1" />
        ) : null}
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Can&apos;t scan? Type the key instead</summary>
          <p className="mt-2 break-all rounded-md bg-muted p-2 font-mono" data-testid="totp-secret">
            {setup.secret}
          </p>
        </details>
      </div>
      <Field label="6-digit code">
        <Input
          value={code}
          onChange={e => setCode(e.target.value)}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={7}
          placeholder="123 456"
          required
        />
      </Field>
      <Button type="submit" size="lg" loading={busy === "confirm"} disabled={!code.trim()}>
        <ShieldCheck aria-hidden="true" />
        Turn on authenticator sign-in
      </Button>
    </form>
  );
}
