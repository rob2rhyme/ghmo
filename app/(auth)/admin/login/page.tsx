"use client";

import { firebaseInitError, getFirebaseAuth } from "@/src/lib/firebaseClient";
import { signInWithCustomToken } from "firebase/auth";
import type { Route } from "next";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

function AdminLoginInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const auth = getFirebaseAuth();
      const res = await fetch("/api/auth/pin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestedRole: "admin", pin })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      const cred = await signInWithCustomToken(auth, data.customToken);
      const idToken = await cred.user.getIdToken();
      await fetch("/api/auth/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idToken })
      });
      window.dispatchEvent(new Event("auth:changed"));

      const next = ((searchParams.get("next") as Route | null) ?? `/admin`) as Route;
      router.replace(next);
    } catch (err: any) {
      setError(err.message || "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5 rounded-lg border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900 dark:text-slate-50">Sign in</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">Admins sign in with their PIN.</p>
        </div>
        {mounted && firebaseInitError ? (
          <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-400/50 dark:bg-red-900/30 dark:text-red-100">
            Firebase web config is missing. Add NEXT_PUBLIC_FIREBASE_* vars to .env.local and restart.
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <label htmlFor="admin-pin" className="text-sm font-medium text-slate-800 dark:text-slate-200">
                Admin PIN
              </label>
              <input
                id="admin-pin"
                name="pin"
                type="password"
                value={pin}
                onChange={e => setPin(e.target.value)}
                placeholder="Enter admin PIN"
                autoComplete="one-time-code"
                inputMode="numeric"
                className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-slate-900 outline-none transition focus:border-primary dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            {error ? <p className="text-sm text-red-500">{error}</p> : null}
            <button
              type="button"
              onClick={handleSubmit}
              disabled={loading}
              className="w-full rounded-md bg-primary px-4 py-2 text-white shadow-sm transition hover:bg-primary/90 disabled:opacity-60"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Member?{" "}
          <a href={`/login`} className="text-primary">
            Use member login
          </a>
        </p>
      </div>
    </div>
  );
}

export default function AdminLogin() {
  return (
    <Suspense fallback={null}>
      <AdminLoginInner />
    </Suspense>
  );
}
