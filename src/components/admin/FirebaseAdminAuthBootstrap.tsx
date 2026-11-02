"use client";

import { useEffect, useMemo, useState } from "react";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { WifiOff } from "lucide-react";
import { firebaseInitError } from "@/src/lib/firebaseClient";
import { Alert, AlertDescription, AlertTitle } from "@/src/components/ui/alert";
import { Button } from "@/src/components/ui/button";
import { Skeleton } from "@/src/components/ui/skeleton";

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
    // After an error, wait for "Try again" instead of retrying in a loop.
    if (state === "loading" || state === "ready" || state === "error") return;
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

  if (state === "error") {
    if (process.env.NODE_ENV !== "production" && error) console.warn("Live connection failed:", error);
    return (
      <Alert variant="destructive">
        <WifiOff />
        <AlertTitle>Couldn&apos;t connect</AlertTitle>
        <AlertDescription className="flex flex-col items-start gap-3">
          <span>This page needs a live connection. Check your internet, then try again.</span>
          <Button variant="outline" onClick={() => setState("idle")}>
            Try again
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (state !== "ready") {
    return (
      <div role="status" className="flex flex-col gap-3">
        <span className="sr-only">Connecting…</span>
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return <>{children}</>;
}
