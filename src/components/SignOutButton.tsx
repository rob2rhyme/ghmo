"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/src/components/ui/button";
import { signOut } from "firebase/auth";
import { getFirebaseAuth } from "@/src/lib/firebaseClient";
import { clearLocalDrafts } from "@/src/lib/localDrafts";

export default function SignOutButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [signedOut, setSignedOut] = useState(false);

  const handleSignOut = async () => {
    try {
      setLoading(true);
      clearLocalDrafts();
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
    <Button type="button" variant="outline" onClick={handleSignOut} loading={loading}>
      {loading ? "Signing out…" : "Sign out"}
    </Button>
  );
}
