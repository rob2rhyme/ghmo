import "server-only";
import crypto from "node:crypto";
import { FieldValue, Timestamp } from "firebase-admin/firestore";
import type { NextRequest } from "next/server";
import { getAppOrigin } from "./appUrl";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgAdminDocPath, orgAdminsCollectionPath, orgDocPath } from "./firestorePaths";
import { wrongAddressMessage } from "./security/appHost";

/**
 * Passkey (WebAuthn) storage for admins (plan Phase 2, decision D2).
 *
 * Firestore layout (server-only; rules deny all client access):
 *   organizations/ghmo/admins/{uid}/passkeys/{credentialId}   the credential
 *   organizations/ghmo/passkeyIndex/{credentialId}            -> { uid } for sign-in lookup
 *   organizations/ghmo/webauthnChallenges/{challengeId}       single-use, 5-minute challenges
 */

export const RP_NAME = "GHMO Admin";
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

export type PasskeyStatus = "active" | "pending";

export type StoredPasskey = {
  credentialId: string;
  publicKey: string; // base64url COSE public key
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: boolean;
  /** The authenticator supports the WebAuthn PRF extension (used to unlock E2EE keys in Phase 3). */
  prfEnabled: boolean;
  name: string;
  status: PasskeyStatus;
  createdVia: "passkey" | "magic_link";
  createdAt?: Timestamp;
  lastUsedAt?: Timestamp | null;
  approvedBy?: string | null;
  approvedAt?: Timestamp | null;
};

export type WebAuthnConfig = { rpID: string; rpName: string; origin: string };

/** A plain-language error when the site is opened at an address passkeys are not set up for, else null. */
export function passkeyAddressError(req: NextRequest): string | null {
  return wrongAddressMessage(getAppOrigin(req), req.headers);
}

export function getWebAuthnConfig(req: NextRequest): WebAuthnConfig {
  const origin = getAppOrigin(req);
  return { rpID: new URL(origin).hostname, rpName: RP_NAME, origin };
}

const passkeysCollection = (uid: string) => getAdminDb().collection(`${orgAdminDocPath(COMMUNITY_SLUG, uid)}/passkeys`);
const indexDoc = (credentialId: string) => getAdminDb().doc(`${orgDocPath(COMMUNITY_SLUG)}/passkeyIndex/${credentialId}`);
const challengeDoc = (id: string) => getAdminDb().doc(`${orgDocPath(COMMUNITY_SLUG)}/webauthnChallenges/${id}`);

/** Credential IDs are base64url; anything else is refused before touching Firestore paths. */
export function isValidCredentialId(id: string): boolean {
  return /^[A-Za-z0-9_-]{16,1024}$/.test(id);
}

export async function saveChallenge(purpose: "register" | "authenticate", challenge: string, uid: string | null) {
  const id = crypto.randomBytes(24).toString("base64url");
  await challengeDoc(id).set({
    challenge,
    purpose,
    uid,
    expiresAt: Timestamp.fromMillis(Date.now() + CHALLENGE_TTL_MS)
  });
  return id;
}

/** Reads and deletes a challenge in one transaction, so each can be used exactly once. */
export async function consumeChallenge(
  id: string,
  purpose: "register" | "authenticate",
  uid: string | null
): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(id)) return null;
  const ref = challengeDoc(id);
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    const data = snap.data() as { challenge: string; purpose: string; uid: string | null; expiresAt: Timestamp };
    if (data.purpose !== purpose) return null;
    if (data.uid !== uid) return null;
    if (data.expiresAt.toMillis() < Date.now()) return null;
    return data.challenge;
  });
}

export async function listPasskeys(uid: string): Promise<StoredPasskey[]> {
  const snap = await passkeysCollection(uid).get();
  return snap.docs.map(doc => doc.data() as StoredPasskey);
}

export async function findPasskey(credentialId: string): Promise<{ uid: string; passkey: StoredPasskey } | null> {
  if (!isValidCredentialId(credentialId)) return null;
  const index = await indexDoc(credentialId).get();
  const uid = index.exists ? (index.data() as { uid?: string }).uid : undefined;
  if (!uid) return null;
  const doc = await passkeysCollection(uid).doc(credentialId).get();
  if (!doc.exists) return null;
  return { uid, passkey: doc.data() as StoredPasskey };
}

/**
 * Decides whether a newly registered passkey is active immediately.
 * - Registered from a passkey session: the admin already proved possession of a passkey.
 * - The admin's first passkey (first-time setup by magic link).
 * - Recovery when no OTHER active admin with a passkey exists (nobody could approve).
 * Otherwise it stays pending until another admin approves it, so a stolen email
 * inbox alone cannot add a passkey to an existing admin.
 */
export async function decideNewPasskeyStatus(uid: string, via: "passkey" | "magic_link"): Promise<PasskeyStatus> {
  if (via === "passkey") return "active";
  const existing = await listPasskeys(uid);
  if (!existing.some(p => p.status === "active")) return "active";
  return (await otherAdminCanApprove(uid)) ? "pending" : "active";
}

async function otherAdminCanApprove(uid: string): Promise<boolean> {
  const admins = await getAdminDb().collection(orgAdminsCollectionPath(COMMUNITY_SLUG)).where("status", "==", "active").get();
  for (const admin of admins.docs) {
    if (admin.id === uid) continue;
    const keys = await passkeysCollection(admin.id).where("status", "==", "active").limit(1).get();
    if (!keys.empty) return true;
  }
  return false;
}

export async function storePasskey(uid: string, passkey: Omit<StoredPasskey, "createdAt" | "lastUsedAt">) {
  const batch = getAdminDb().batch();
  batch.set(passkeysCollection(uid).doc(passkey.credentialId), {
    ...passkey,
    createdAt: FieldValue.serverTimestamp(),
    lastUsedAt: null
  });
  batch.set(indexDoc(passkey.credentialId), { uid });
  await batch.commit();
}

export async function recordPasskeyUse(uid: string, credentialId: string, counter: number) {
  await passkeysCollection(uid).doc(credentialId).update({ counter, lastUsedAt: FieldValue.serverTimestamp() });
}

export async function approvePasskey(ownerUid: string, credentialId: string, approverUid: string): Promise<boolean> {
  const ref = passkeysCollection(ownerUid).doc(credentialId);
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (!snap.exists || (snap.data() as StoredPasskey).status !== "pending") return false;
    tx.update(ref, { status: "active", approvedBy: approverUid, approvedAt: FieldValue.serverTimestamp() });
    return true;
  });
}

export async function deletePasskey(ownerUid: string, credentialId: string) {
  const batch = getAdminDb().batch();
  batch.delete(passkeysCollection(ownerUid).doc(credentialId));
  batch.delete(indexDoc(credentialId));
  await batch.commit();
}

/** Pending passkeys of other active admins, for the approval list. */
export async function listPendingPasskeysForApproval(approverUid: string) {
  const admins = await getAdminDb().collection(orgAdminsCollectionPath(COMMUNITY_SLUG)).where("status", "==", "active").get();
  const pending: { ownerUid: string; ownerName: string; passkey: StoredPasskey }[] = [];
  for (const admin of admins.docs) {
    if (admin.id === approverUid) continue;
    const keys = await passkeysCollection(admin.id).where("status", "==", "pending").get();
    for (const key of keys.docs) {
      pending.push({
        ownerUid: admin.id,
        ownerName: (admin.data().name as string | undefined) ?? "Admin",
        passkey: key.data() as StoredPasskey
      });
    }
  }
  return pending;
}
