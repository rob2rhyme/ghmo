"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { firebaseInitError } from "@/src/lib/firebaseClient";

type FirebaseAdminAuthBootstrapProps = {
  children: React.ReactNode;
};

type BootstrapState = "idle" | "loading" | "ready" | "error";

export default function FirebaseAdminAuthBootstrap({ children }: FirebaseAdminAuthBootstrapProps) {
  const [state, setState] = useState<BootstrapState>("idle");
  const [error, setError] = useState<string | null>(null);

  const auth = useMemo(() => {
    try {
      return getAuth();
    } catch (err) {
      return null;
    }
  }, []);

  useEffect(() => {
    if (state === "loading" || state === "ready") return;
    if (firebaseInitError) {
      setError(firebaseInitError);
      setState("error");
      return;
    }
    if (!auth) {
      setError("Firebase Auth is unavailable.");
      setState("error");
      return;
    }
    if (auth.currentUser) {
      setState("ready");
      return;
    }

    const runBootstrap = async () => {
      setState("loading");
      setError(null);
      try {
        const res = await fetch("/api/auth/firebase-custom-token", {
          method: "GET",
          credentials: "include",
          cache: "no-store"
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || "Failed to fetch Firebase token");
        }
        const data = (await res.json()) as { token?: string };
        if (!data.token) {
          throw new Error("Missing Firebase token");
        }
        await signInWithCustomToken(auth, data.token);
        await auth.currentUser?.getIdToken(true);

        if (process.env.NODE_ENV !== "production") {
          const claims = await auth.currentUser?.getIdTokenResult();
          console.debug("Firebase admin auth", {
            uid: auth.currentUser?.uid,
            claims: claims?.claims
          });
        }

        setState("ready");
      } catch (err: any) {
        setError(err?.message || "Unable to sign in to Firebase");
        setState("error");
      }
    };

    void runBootstrap();
  }, [auth, state]);

  if (state !== "ready") {
    return (
      <div className="flex min-h-[40vh] items-center justify-center rounded-2xl border border-border bg-card px-6 py-10 text-center shadow-xs">
        <div>
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-border border-t-primary" />
          <p className="mt-3 text-sm font-semibold text-foreground/80">Securing admin session…</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {state === "error" ? error || "Unable to connect to Firebase." : "Connecting to Firestore."}
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
