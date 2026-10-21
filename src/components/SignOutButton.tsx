"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/src/lib/firebaseClient";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await fetch("/api/auth/session", { method: "DELETE" });
      try {
        // Also drop the browser's Firebase login (kept in IndexedDB) so this device
        // has no admin credentials left after signing out.
        await signOut(getFirebaseAuth());
      } catch {
        // Firebase client not configured on this page; server session is already gone.
      }
      setSignedOut(true);
      window.dispatchEvent(new Event("auth:changed"));
      router.push("/");
      router.refresh();
    } catch (err) {
      // silent fail; UI remains
    } finally {
      setLoading(false);
    }
  };

  if (signedOut) return null;

  return (
    <button
      onClick={handleSignOut}
      disabled={loading}
      className="rounded-md border border-border px-3 py-1 text-sm font-semibold text-foreground hover:border-primary/60 hover:text-primary disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:border-primary/60"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
