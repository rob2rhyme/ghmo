"use client";

import { firebaseInitError, getFirebaseAuth, missingEnvKeys } from "@/src/lib/firebaseClient";
import { isSignInWithEmailLink, signInWithEmailLink, signOut } from "firebase/auth";
import type { Route } from "next";
import { safeRedirectPath } from "@/src/lib/security/redirect";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Mail } from "lucide-react";
import { useAuthSession } from "@/src/hooks/useAuthSession";
import { Alert, AlertDescription } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader } from "@/src/components/ui/card";
import { Field } from "@/src/components/ui/field";
import { Input } from "@/src/components/ui/input";

function MemberLoginInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuthSession();
  const nextRoute = safeRedirectPath(searchParams.get("next"), "/admin") as Route;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  // The sign-in link was opened in a browser that doesn't remember the email: ask for it in the card, not a browser prompt.
  const [needsEmail, setNeedsEmail] = useState(false);
  const [confirmEmail, setConfirmEmail] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [confirmedEmail, setConfirmedEmail] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.authenticated || !session?.isAdmin) return;
    if (pathname === nextRoute) return;
    router.replace(nextRoute);
  }, [router, session, pathname, nextRoute]);

  useEffect(() => {
    setMounted(true);
    // Visitors see a plain outage message; the technical cause stays in the console.
    if (firebaseInitError) console.error("Sign-in unavailable:", firebaseInitError, missingEnvKeys);
  }, []);

  useEffect(() => {
    if (firebaseInitError) return;

    let auth: ReturnType<typeof getFirebaseAuth>;
    try {
      auth = getFirebaseAuth();
    } catch (err) {
      console.error(err);
      setError("Sign-in is temporarily unavailable. Please try again later.");
      return;
    }

    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const complete = async (emailForLink: string) => {
      setLoading(true);
      setStatus("Completing sign-in…");
      setError(null);
      try {
        const cred = await signInWithEmailLink(auth, emailForLink, window.location.href);
        localStorage.setItem("magiclink-email", emailForLink);
        const idToken = await cred.user.getIdToken();

        await fetch("/api/auth/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ idToken })
        });
        if (typeof window !== "undefined") {
          window.dispatchEvent(new Event("auth:changed"));
        }

        const postAuthRes = await fetch(`/api/auth/post-auth`, {
          method: "POST",
          headers: { Authorization: `Bearer ${idToken}` }
        });
        const postAuth = await postAuthRes.json();
        if (!postAuth.ok) {
          await signOut(auth);
          setError("This email doesn't have access yet. If you think it should, ask a GHMO board member.");
          setStatus(null);
          return;
        }

        const next = safeRedirectPath(searchParams.get("next"), "/") as Route;
        router.replace(next);
      } catch (err) {
        console.error(err);
        setError("Sign-in failed. Try requesting a new link.");
        setStatus(null);
      } finally {
        setLoading(false);
      }
    };

    let storedEmail = "";
    try {
      storedEmail = localStorage.getItem("magiclink-email") || "";
    } catch {
      storedEmail = "";
    }
    if (storedEmail) {
      void complete(storedEmail);
      return;
    }
    if (!confirmedEmail) {
      setNeedsEmail(true);
      return;
    }
    void complete(confirmedEmail);
  }, [router, searchParams, confirmedEmail]);

  const handleConfirmEmail = (event: React.FormEvent) => {
    event.preventDefault();
    const value = confirmEmail.trim();
    if (!value) {
      setConfirmError("Enter the email address the link was sent to");
      return;
    }
    setConfirmError(null);
    setNeedsEmail(false);
    setConfirmedEmail(value);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!email.trim()) {
      setEmailError("Enter your email");
      return;
    }
    setEmailError(null);
    setLoading(true);
    setError(null);
    setStatus(null);
    try {
      const res = await fetch(`/api/auth/send-login-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email })
      });
      await res.json();
      localStorage.setItem("magiclink-email", email.trim());
      setStatus("If your access is enabled, you'll receive a sign-in email.");
    } catch (err) {
      console.error(err);
      setError("Could not send sign-in link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center py-6">
      <Card className="w-full max-w-md">
        <CardHeader>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">Member sign in</h1>
          <CardDescription className="text-base">
            For GHMO members on the board&apos;s member list. We&apos;ll email you a link to sign in.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {mounted && firebaseInitError ? (
            <Alert variant="warning">
              <AlertTriangle />
              <AlertDescription className="text-foreground">Sign-in is temporarily unavailable. Please try again later.</AlertDescription>
            </Alert>
          ) : needsEmail ? (
            <form onSubmit={handleConfirmEmail} noValidate className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                This browser doesn&apos;t remember which email the link was sent to. Confirm it to finish signing in.
              </p>
              <Field label="Confirm your email" error={confirmError}>
                <Input
                  id="confirm-email"
                  name="confirmEmail"
                  type="email"
                  inputMode="email"
                  value={confirmEmail}
                  onChange={e => {
                    setConfirmEmail(e.target.value);
                    if (confirmError) setConfirmError(null);
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                  autoFocus
                />
              </Field>
              <Button type="submit" size="lg" className="w-full">
                Finish signing in
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
              <Field label="Email" error={emailError}>
                <Input
                  id="member-email"
                  name="email"
                  type="email"
                  inputMode="email"
                  value={email}
                  onChange={e => {
                    setEmail(e.target.value);
                    if (emailError) setEmailError(null);
                  }}
                  placeholder="you@example.com"
                  autoComplete="email"
                />
              </Field>
              {status ? (
                <Alert variant="info" role="status">
                  <Mail />
                  <AlertDescription className="text-foreground">{status}</AlertDescription>
                </Alert>
              ) : null}
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription className="text-foreground">{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button type="submit" size="lg" className="w-full" loading={loading}>
                {loading ? "Sending link…" : "Send sign-in link"}
              </Button>
            </form>
          )}
          <p className="text-sm text-muted-foreground">
            On the board?{" "}
            <Link href="/admin/login" className="font-semibold text-primary underline-offset-4 hover:underline">
              Use board member sign in
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function MemberLogin() {
  return (
    <Suspense fallback={null}>
      <MemberLoginInner />
    </Suspense>
  );
}
