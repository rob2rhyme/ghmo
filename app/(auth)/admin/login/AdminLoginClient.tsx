"use client";

import { browserSupportsWebAuthn, startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { Clock, KeyRound, Mail, ShieldCheck } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/src/components/ui/card";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";
import { Separator } from "@/src/components/ui/separator";

export type LoginStage = "signin" | "setup" | "pending";

type AdminLoginClientProps = {
  orgSlug: string;
  stage: LoginStage;
  nextPath: string;
  featureEmailLogin: boolean;
  devLoginAvailable: boolean;
  adminName?: string | null;
};

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string; message?: string };
  if (!res.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
}

/** Turns WebAuthn browser errors into plain language. */
function passkeyErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  if (name === "NotAllowedError") return "The passkey prompt was closed or timed out. Try again.";
  if (name === "InvalidStateError") return "This device already has a passkey for your account. Sign in with it instead.";
  return error instanceof Error ? error.message : "Something went wrong. Try again.";
}

const noopSubscribe = () => () => {};

async function signInWithPasskey() {
  const { options, challengeId } = await postJson<{ options: Parameters<typeof startAuthentication>[0]["optionsJSON"]; challengeId: string }>(
    "/api/auth/passkey/login/options",
    {}
  );
  const response = await startAuthentication({ optionsJSON: options });
  await postJson("/api/auth/passkey/login/verify", { challengeId, response });
}

export default function AdminLoginClient({
  orgSlug,
  stage,
  nextPath,
  featureEmailLogin,
  devLoginAvailable,
  adminName
}: AdminLoginClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Read once on the client; the server assumes support to avoid a hydration mismatch.
  const supported = useSyncExternalStore(noopSubscribe, browserSupportsWebAuthn, () => true);
  const [busy, setBusy] = useState<null | "passkey" | "register" | "email" | "verify" | "dev">(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [deviceName, setDeviceName] = useState("");
  const [devToken, setDevToken] = useState("");
  const verifiedCode = useRef<string | null>(null);

  const finishSignIn = () => {
    window.dispatchEvent(new Event("auth:changed"));
    router.replace(nextPath as Parameters<typeof router.replace>[0]);
    router.refresh();
  };

  // Landing from the emailed magic link: verify it, then the server shows the passkey setup step.
  const oobCode = searchParams.get("oobCode");
  useEffect(() => {
    if (!featureEmailLogin || !oobCode || searchParams.get("mode") !== "signIn") return;
    if (verifiedCode.current === oobCode) return;
    verifiedCode.current = oobCode;
    setBusy("verify");
    postJson("/api/auth/email/verify", {
      orgSlug,
      email: searchParams.get("email") ?? undefined,
      oobCode,
      emailLink: window.location.href
    })
      .then(() => {
        window.dispatchEvent(new Event("auth:changed"));
        router.replace("/admin/login");
        router.refresh();
      })
      .catch(err => setError(err instanceof Error ? err.message : "Link validation failed"))
      .finally(() => setBusy(null));
  }, [featureEmailLogin, oobCode, orgSlug, router, searchParams]);

  const handlePasskeySignIn = async () => {
    setError(null);
    setBusy("passkey");
    try {
      await signInWithPasskey();
      finishSignIn();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleRegister = async () => {
    setError(null);
    setBusy("register");
    try {
      const { options, challengeId } = await postJson<{
        options: Parameters<typeof startRegistration>[0]["optionsJSON"];
        challengeId: string;
      }>("/api/auth/passkey/register/options", {});
      const response = await startRegistration({ optionsJSON: options });
      const result = await postJson<{ status: "active" | "pending" }>("/api/auth/passkey/register/verify", {
        challengeId,
        name: deviceName.trim() || undefined,
        response
      });
      if (result.status === "pending") {
        router.refresh();
        return;
      }
      // Prove the new passkey works and upgrade to a passkey session.
      await signInWithPasskey();
      finishSignIn();
    } catch (err) {
      setError(passkeyErrorMessage(err));
    } finally {
      setBusy(null);
    }
  };

  const handleEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setNotice(null);
    setBusy("email");
    try {
      const data = await postJson<{ message?: string }>("/api/auth/email/start", { orgSlug, email: email.trim() });
      setNotice(data.message ?? "If your admin access is enabled, a sign-in link is on its way.");
      setEmail("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to send the sign-in link.");
    } finally {
      setBusy(null);
    }
  };

  const handleDevLogin = async () => {
    setError(null);
    setBusy("dev");
    try {
      const res = await fetch("/api/auth/dev/admin-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-dev-login-token": devToken },
        body: JSON.stringify({ orgSlug, email: email.trim() })
      });
      if (!res.ok) throw new Error("Dev login failed");
      finishSignIn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Dev login failed");
    } finally {
      setBusy(null);
    }
  };

  const signOut = async () => {
    await fetch("/api/auth/session", { method: "DELETE" });
    window.dispatchEvent(new Event("auth:changed"));
    router.replace("/admin/login");
    router.refresh();
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6">
      <Card className="w-full max-w-md">
        {stage === "signin" ? (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Admin sign in</CardTitle>
              <CardDescription>Use the passkey on your phone or computer (fingerprint, face or device PIN).</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {busy === "verify" ? (
                <Alert variant="info">
                  <Mail />
                  <AlertTitle>Checking your sign-in link…</AlertTitle>
                </Alert>
              ) : null}
              <Button size="lg" onClick={handlePasskeySignIn} loading={busy === "passkey"} disabled={!supported || busy !== null}>
                <KeyRound aria-hidden="true" />
                Sign in with passkey
              </Button>
              {!supported ? (
                <p className="text-sm text-muted-foreground">
                  This browser does not support passkeys. Use an up-to-date browser on your phone or computer.
                </p>
              ) : null}

              {featureEmailLogin ? (
                <>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <Separator className="flex-1" />
                    First time, or lost your device?
                    <Separator className="flex-1" />
                  </div>
                  <form onSubmit={handleEmail} className="flex flex-col gap-3">
                    <Field label="Admin email" description="We'll email a one-time link so you can set up a passkey.">
                      <Input
                        type="email"
                        autoComplete="email"
                        inputMode="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="you@example.org"
                      />
                    </Field>
                    <Button type="submit" variant="outline" loading={busy === "email"} disabled={busy !== null}>
                      <Mail aria-hidden="true" />
                      Email me a sign-in link
                    </Button>
                  </form>
                </>
              ) : null}
            </CardContent>
          </>
        ) : null}

        {stage === "setup" ? (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Set up your passkey</CardTitle>
              <CardDescription>
                {adminName ? `Welcome, ${adminName}. ` : null}
                Admins sign in with a passkey: it stays on your device and works with your fingerprint, face or device PIN.
                It can&apos;t be phished or guessed.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Field label="Name this device" description="So you can recognise it later, e.g. “Sita’s iPhone”.">
                <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} maxLength={60} placeholder="My phone" />
              </Field>
              <Button size="lg" onClick={handleRegister} loading={busy === "register"} disabled={!supported || busy !== null}>
                <ShieldCheck aria-hidden="true" />
                Create passkey
              </Button>
              <Button variant="ghost" onClick={handlePasskeySignIn} loading={busy === "passkey"} disabled={!supported || busy !== null}>
                I already have a passkey on this device
              </Button>
              <p className="text-xs text-muted-foreground">
                If you already have a passkey on another device, this new one has to be approved by another admin before it
                works.
              </p>
            </CardContent>
          </>
        ) : null}

        {stage === "pending" ? (
          <>
            <CardHeader>
              <CardTitle className="text-2xl">Waiting for approval</CardTitle>
              <CardDescription>
                Your new passkey was saved. Because you already had one, another admin must approve it in{" "}
                <strong>Admin → Security</strong> before it works. This protects you if someone gets into your email.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <Alert variant="info">
                <Clock />
                <AlertTitle>Ask another admin to approve it</AlertTitle>
                <AlertDescription>Once approved, come back here and sign in with the passkey.</AlertDescription>
              </Alert>
              <Button size="lg" onClick={handlePasskeySignIn} loading={busy === "passkey"} disabled={!supported || busy !== null}>
                <KeyRound aria-hidden="true" />
                Sign in with passkey
              </Button>
            </CardContent>
          </>
        ) : null}

        {notice ? (
          <Alert variant="info" role="status">
            <Mail />
            <AlertDescription>{notice}</AlertDescription>
          </Alert>
        ) : null}
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        {stage !== "signin" ? (
          <Button variant="link" className="self-start px-0" onClick={signOut}>
            Sign out
          </Button>
        ) : null}

        {devLoginAvailable && stage === "signin" ? (
          <div className="flex flex-col gap-2 rounded-md border border-warning/40 bg-warning/10 p-4 text-sm">
            <p className="font-semibold">Dev login (local only)</p>
            <Field label="Dev token">
              <Input type="password" value={devToken} onChange={e => setDevToken(e.target.value)} autoComplete="off" />
            </Field>
            <p className="text-xs text-muted-foreground">Uses the admin email above.</p>
            <Button variant="outline" onClick={handleDevLogin} loading={busy === "dev"} disabled={!devToken || !email.trim()}>
              Start dev session
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
