"use client";

import { firebaseInitError, getFirebaseAuth, missingEnvKeys } from "@/src/lib/firebaseClient";
import { isSignInWithEmailLink, signInWithEmailLink, signOut } from "firebase/auth";
import type { Route } from "next";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { useAuthSession } from "@/src/hooks/useAuthSession";

function MemberLoginInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { session } = useAuthSession();
  const nextRoute = ((searchParams.get("next") as Route | null) ?? "/admin") as Route;

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    if (!session?.authenticated || !session?.isAdmin) return;
    if (pathname === nextRoute) return;
    router.replace(nextRoute);
  }, [router, session, pathname, nextRoute]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (firebaseInitError) return;

    let auth: ReturnType<typeof getFirebaseAuth>;
    try {
      auth = getFirebaseAuth();
    } catch (err) {
      console.error(err);
      setError("Firebase not available in this environment.");
      return;
    }

    if (!isSignInWithEmailLink(auth, window.location.href)) return;

    const complete = async () => {
      setLoading(true);
      setStatus("Completing sign-in...");
      setError(null);
      try {
        const storedEmail = localStorage.getItem("magiclink-email") || "";
        const emailForLink = storedEmail || window.prompt("Confirm your email to finish signing in") || "";
        if (!emailForLink) {
          setError("Email required to complete sign-in.");
          setStatus(null);
          return;
        }

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
          setError("Access not enabled.");
          setStatus(null);
          return;
        }

        const next = ((searchParams.get("next") as Route | null) ?? `/`) as Route;
        router.replace(next);
      } catch (err: any) {
        console.error(err);
        setError("Sign-in failed. Try requesting a new link.");
        setStatus(null);
      } finally {
        setLoading(false);
      }
    };

    void complete();
  }, [router, searchParams]);

  const handleSubmit = async () => {
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
    } catch (err: any) {
      console.error(err);
      setError("Could not send sign-in link. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">
            Enter your email to receive a magic sign-in link.
          </p>
        </div>
        {mounted && firebaseInitError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/50 dark:bg-red-900/30 dark:text-red-100">
            Firebase web config is missing. Add NEXT_PUBLIC_FIREBASE_* vars to .env.local and restart.
            {missingEnvKeys?.length ? (
              <div className="mt-1 text-xs text-red-700 dark:text-red-100">
                Missing: {missingEnvKeys.join(", ")}
              </div>
            ) : null}
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="member-email" className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Email
              </label>
              <input
                id="member-email"
                name="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="email"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            {status ? <p className="text-sm text-slate-600 dark:text-slate-300">{status}</p> : null}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading || !email}
              className="w-full rounded-md bg-primary px-4 py-2 text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Sending link..." : "Send sign-in link"}
            </button>
          </>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Admin?{" "}
          <a href={`/admin/login`} className="text-primary">
            Use admin login
          </a>
        </p>
      </div>
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
