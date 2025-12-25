"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      await fetch("/api/auth/session", { method: "DELETE" });
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
      className="rounded-md border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-800 hover:border-primary/60 hover:text-primary disabled:opacity-60 dark:border-slate-700 dark:text-slate-200 dark:hover:border-primary/60"
    >
      {loading ? "Signing out…" : "Sign out"}
    </button>
  );
}
