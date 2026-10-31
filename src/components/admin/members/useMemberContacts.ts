"use client";

import { useCallback, useEffect, useState } from "react";
import { useE2ee } from "@/src/lib/e2ee/client/E2eeProvider";
import { memberContactLoc, type MemberContact } from "@/src/lib/members";

/** A decrypted contact, or why it could not be read on this device. */
export type ContactView = { ok: true; contact: MemberContact } | { ok: false; error: string };

type WithContact = { id: string; contact?: unknown };

/**
 * Decrypts members' contact envelopes on an unlocked device and keeps them in memory only (plan §12).
 * Returns the views by member id, whether numbers can be handled right now, and setters the pages
 * use after they save a contact themselves.
 */
export function useMemberContacts(members: WithContact[]) {
  const e2ee = useE2ee();
  const { decrypt } = e2ee;
  const ready = e2ee.enabled && e2ee.status === "unlocked";
  const [contacts, setContacts] = useState<Map<string, ContactView>>(() => new Map());

  const decryptContact = useCallback(
    async (member: WithContact): Promise<ContactView> => {
      try {
        return { ok: true, contact: await decrypt<MemberContact>(member.contact, memberContactLoc(member.id)) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Could not decrypt" };
      }
    },
    [decrypt]
  );

  useEffect(() => {
    if (!ready) return;
    const pending = members.filter(member => member.contact && !contacts.has(member.id));
    if (pending.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries = await Promise.all(pending.map(async member => [member.id, await decryptContact(member)] as const));
      if (cancelled) return;
      setContacts(current => {
        const next = new Map(current);
        for (const [id, view] of entries) next.set(id, view);
        return next;
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, members, contacts, decryptContact]);

  // Lock or sign-out: forget the plaintext so nothing shows until the next unlock.
  const [wasReady, setWasReady] = useState(ready);
  if (wasReady !== ready) {
    setWasReady(ready);
    if (!ready) setContacts(new Map());
  }

  const remember = useCallback((id: string, contact: MemberContact | null) => {
    setContacts(current => {
      const next = new Map(current);
      if (contact) next.set(id, { ok: true, contact });
      else next.delete(id);
      return next;
    });
  }, []);

  return { contacts, ready, remember, e2ee };
}
