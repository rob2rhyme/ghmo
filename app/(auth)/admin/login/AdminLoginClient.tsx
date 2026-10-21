"use client";

import { firebaseInitError } from "@/src/lib/firebaseClient";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type AdminLoginClientProps = {
  featureEmailLogin: boolean;
  orgSlug: string;
};

const emailMessaging = {
  default: "Submit your admin email to receive a safe sign-in link.",
  sending: "Sending link…",
  sent: "Check your inbox for the email; the link expires in 10 minutes.",
  error: "Unable to send the sign-in link.",
};

export default function AdminLoginClient({
  featureEmailLogin,
  orgSlug,
}: AdminLoginClientProps) {
  const [email, setEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<string>(
    emailMessaging.default
  );
  const [isMagicLinkModalOpen, setIsMagicLinkModalOpen] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState<string | null>(
    null
  );
  const verificationAttemptRef = useRef<string | null>(null);
  const [verificationTriggered, setVerificationTriggered] = useState(false);
  const [devLoginToken, setDevLoginToken] = useState("");
  const [devLoginStatus, setDevLoginStatus] = useState<string | null>(null);
  const [devLoginLoading, setDevLoginLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const routerRef = useRef(router);
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");
  const emailParam = searchParams.get("email");
  const normalizedEmail = email.trim();
  const devLoginEnabled =
    process.env.NEXT_PUBLIC_ALLOW_DEV_ADMIN_LOGIN === "true";
  const enableMemberLogin =
    process.env.NEXT_PUBLIC_ENABLE_MEMBER_LOGIN === "true";

  useEffect(() => {
    setMounted(true);
  }, []);

  const mode = searchParams.get("mode");

  useEffect(() => {
    if (!featureEmailLogin || verificationTriggered) return;
    if (!oobCode || mode !== "signIn") return;
    if (verificationAttemptRef.current === oobCode) return;
    verificationAttemptRef.current = oobCode;
    setVerificationTriggered(true);
    setVerificationStatus("Signing you in…");

    const verifyLink = async () => {
      try {
        const payload: Record<string, unknown> = { orgSlug };
        if (emailParam) payload.email = emailParam;
        payload.oobCode = oobCode;
        if (typeof window !== "undefined") {
          payload.emailLink = window.location.href;
        }
        const res = await fetch("/api/auth/email/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Verification failed");
        }
        await res.json();
        window.dispatchEvent(new Event("auth:changed"));

        const meRes = await fetch("/api/auth/me", { cache: "no-store" });
        const meData = await meRes.json().catch(() => ({}));
        if (meData.authenticated && meData.isAdmin) {
          router.replace("/admin");
        } else {
          setVerificationStatus(
            "Signed in, but you are not authorized as an admin."
          );
        }
      } catch (err: any) {
        setVerificationStatus(err.message || "Link validation failed");
      }
    };

    verifyLink();
  }, [
    featureEmailLogin,
    orgSlug,
    router,
    oobCode,
    emailParam,
    mode,
    verificationTriggered,
  ]);

  const didProbeRef = useRef(false);
  useEffect(() => {
    if (didProbeRef.current) return;
    didProbeRef.current = true;
    const controller = new AbortController();
    let redirected = false;
    const checkAdminSession = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json().catch(() => ({}));
        if (controller.signal.aborted) return;
        if (data.authenticated && data.isAdmin && !redirected) {
          redirected = true;
          if (
            typeof window !== "undefined" &&
            window.location.pathname !== "/admin"
          ) {
            routerRef.current?.replace("/admin");
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        // ignore other errors
      }
    };
    checkAdminSession();
    return () => {
      controller.abort();
    };
  }, []);

  const handleEmailStart = async () => {
    const emailForStart = email.trim();
    if (!emailForStart) {
      setEmailStatus("Email is required");
      return;
    }
    setEmailStatus(emailMessaging.sending);
    try {
      const res = await fetch("/api/auth/email/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orgSlug, email: emailForStart }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.code === "QUOTA_EXCEEDED") {
          setEmailStatus(
            "Daily email quota exceeded. Try again tomorrow, or use Dev Login locally."
          );
          return;
        }
        setEmailStatus(data.error || data.message || emailMessaging.error);
        return;
      }
      setEmailStatus(data.message || emailMessaging.sent);
      setEmail("");
      setIsMagicLinkModalOpen(true);
    } catch (err: any) {
      setEmailStatus(err.message || emailMessaging.error);
    }
  };

  const handleDevLogin = async () => {
    if (!devLoginToken) {
      setDevLoginStatus("Dev login token is required");
      return;
    }
    if (!normalizedEmail) {
      setDevLoginStatus("Email is required for dev login");
      return;
    }
    setDevLoginLoading(true);
    setDevLoginStatus("Signing you in...");
    try {
      const res = await fetch("/api/auth/dev/admin-session", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-dev-login-token": devLoginToken,
        },
        body: JSON.stringify({ orgSlug, email: normalizedEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Dev login failed");
      window.dispatchEvent(new Event("auth:changed"));
      const meRes = await fetch("/api/auth/me", { cache: "no-store" });
      const meData = await meRes.json().catch(() => ({}));
      if (meData.authenticated && meData.isAdmin) {
        router.replace("/admin");
      } else {
        setDevLoginStatus("Dev session established, but auth check failed.");
      }
    } catch (err: any) {
      setDevLoginStatus(err.message || "Dev login failed");
    } finally {
      setDevLoginLoading(false);
    }
  };

  return (
    <>
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
        <div className="w-full max-w-md space-y-5 rounded-lg border border-border bg-card p-6 shadow-xs dark:border-slate-800 dark:bg-slate-900">
          <div>
            <h1 className="text-2xl font-semibold text-foreground dark:text-slate-50">
              Sign in
            </h1>
            <p className="mt-1 text-sm text-muted-foreground dark:text-slate-300">
              Admins authenticate an emailed link.
            </p>
          </div>
          {featureEmailLogin ? (
            <div className="space-y-2 rounded-md border border-border bg-background p-4 text-sm">
              <p className="font-semibold text-foreground dark:text-slate-200">
                Email Magic Link
              </p>
              <p className="text-xs text-muted-foreground dark:text-slate-400">
                {emailStatus}
              </p>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                type="email"
                placeholder="you@example.com"
                className="w-full rounded-md border border-border px-3 py-2 text-sm text-foreground outline-hidden transition focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleEmailStart}
                className="w-full rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90"
              >
                Send Magic Link
              </button>
              {verificationStatus ? (
                <p className="text-xs text-muted-foreground">{verificationStatus}</p>
              ) : null}
            </div>
          ) : null}
          {devLoginEnabled && (
            <div className="mt-4 space-y-2 rounded-md border border-yellow-200 bg-yellow-50 p-4 text-sm dark:border-yellow-600 dark:bg-yellow-900/40">
              <p className="font-semibold text-yellow-800 dark:text-yellow-200">
                Dev login (local only)
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                Use your allowlisted admin email plus the dev token when
                email delivery or quotas block magic links.
              </p>
              <input
                value={devLoginToken}
                onChange={(e) => setDevLoginToken(e.target.value)}
                type="password"
                placeholder="Dev login token"
                className="w-full rounded-md border border-yellow-200 bg-card px-3 py-2 text-sm text-foreground outline-hidden transition focus:border-yellow-400 dark:border-yellow-600 dark:bg-yellow-800 dark:text-slate-100"
              />
              <button
                type="button"
                onClick={handleDevLogin}
                disabled={
                  devLoginLoading || !devLoginToken || !normalizedEmail
                }
                className="w-full rounded-md bg-yellow-500 px-4 py-2 text-sm font-semibold text-white shadow-xs transition hover:bg-yellow-600 disabled:opacity-60"
              >
                {devLoginLoading
                  ? "Starting dev session…"
                  : "Start dev session"}
              </button>
              {devLoginStatus && (
                <p className="text-xs text-yellow-700 dark:text-yellow-300">
                  {devLoginStatus}
                </p>
              )}
            </div>
          )}
          {!featureEmailLogin && !devLoginEnabled ? (
            <p className="text-sm text-muted-foreground">
              Admin login is currently disabled; reach out to your admin to
              unblock.
            </p>
          ) : null}
          {mounted && firebaseInitError ? (
            <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-destructive dark:border-red-400/50 dark:bg-red-900/30 dark:text-red-100">
              Firebase web config is missing. Add NEXT_PUBLIC_FIREBASE_* vars to
              .env.local and restart.
            </div>
          ) : null}
          {enableMemberLogin && (
            <p className="text-sm text-muted-foreground dark:text-slate-400">
              Member?{" "}
              <a href={`/login`} className="text-primary">
                Use member login
              </a>
            </p>
          )}
        </div>
      </div>
      {isMagicLinkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-6 sm:px-8">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-xs"
            aria-hidden="true"
          />
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-2xl shadow-black/60"
          >
            <h2 className="text-xl font-semibold text-white">
              Check your email
            </h2>
            <p className="mt-4 text-sm text-slate-300 leading-relaxed">
              If your admin access is enabled, you&apos;ll receive an email with a
              sign-in link shortly. Please check your email.
            </p>
            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-slate-200/90 shadow-inner shadow-black/10">
              <p>
                Note: If you do not receive a link, it means your email is not
                currently authorized for admin access.
              </p>
            </div>
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={() => setIsMagicLinkModalOpen(false)}
                className="inline-flex items-center rounded-full bg-primary px-5 py-2 text-sm font-semibold text-white shadow-lg shadow-primary/40 transition hover:bg-primary/90 focus-visible:outline-solid focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
