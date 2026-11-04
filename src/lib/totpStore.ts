import "server-only";
import { FieldValue } from "firebase-admin/firestore";
import { COMMUNITY_SLUG } from "./community";
import { getAdminDb } from "./firebaseAdmin";
import { orgAdminDocPath } from "./firestorePaths";
import { serverEncryptionKeys } from "./signatureEncryption";
import {
  type EncryptedTotpSecret,
  decryptTotpSecret,
  encryptTotpSecret,
  findRecoveryCode,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  otpauthUri,
  verifyTotp
} from "./totp";

/**
 * Authenticator-app sign-in state, one document per admin:
 *   organizations/ghmo/admins/{uid}/totp/main
 * The seed is encrypted with a key derived from the server's data-encryption key and bound to
 * the admin, recovery codes are stored only as hashes, and clients can never read this document
 * (firestore.rules has no rule for it, so it is denied).
 */

export const TOTP_ISSUER = "GHMO Admin";

type StoredTotp = {
  status: "pending" | "active";
  secret: EncryptedTotpSecret;
  /** Last time step that signed in; a code from that step or earlier is refused. */
  lastStep: number;
  /** SHA-256 hashes of the unused recovery codes. */
  recovery: string[];
  /** Set after too many wrong codes in a day; sign-in with codes stays refused until a super admin resets it. */
  lockedAt?: unknown;
};

const totpRef = (uid: string) => getAdminDb().doc(`${orgAdminDocPath(COMMUNITY_SLUG, uid)}/totp/main`);

export type TotpStatus = { state: "none" | "pending" | "active"; recoveryCodesLeft: number; locked: boolean };

export async function getTotpStatus(uid: string): Promise<TotpStatus> {
  const snap = await totpRef(uid).get();
  if (!snap.exists) return { state: "none", recoveryCodesLeft: 0, locked: false };
  const data = snap.data() as StoredTotp;
  return { state: data.status, recoveryCodesLeft: data.status === "active" ? data.recovery.length : 0, locked: Boolean(data.lockedAt) };
}

export async function hasActiveTotp(uid: string): Promise<boolean> {
  return (await getTotpStatus(uid)).state === "active";
}

export class TotpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

/** Starts (or restarts) setup. The seed is kept encrypted until the first code proves the app works. */
export async function beginTotpEnrollment(uid: string, account: string): Promise<{ secretBytes: Buffer; uri: string }> {
  const secretBytes = generateTotpSecret();
  const stored: StoredTotp = {
    status: "pending",
    secret: encryptTotpSecret(secretBytes, serverEncryptionKeys()[0], uid),
    lastStep: -1,
    recovery: []
  };
  await getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(totpRef(uid));
    if (snap.exists && (snap.data() as StoredTotp).status === "active") {
      throw new TotpError(409, "An authenticator app is already set up for this account");
    }
    tx.set(totpRef(uid), { ...stored, createdAt: FieldValue.serverTimestamp() });
  });
  return { secretBytes, uri: otpauthUri({ secret: secretBytes, account, issuer: TOTP_ISSUER }) };
}

/** Activates the pending seed when the first code is right, and returns the one-time recovery codes. */
export async function confirmTotpEnrollment(uid: string, code: string, now = Date.now()): Promise<string[]> {
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(totpRef(uid));
    const data = snap.exists ? (snap.data() as StoredTotp) : null;
    if (!data || data.status !== "pending") throw new TotpError(409, "Start the authenticator setup first");
    const secret = decryptTotpSecret(data.secret, serverEncryptionKeys(), uid);
    const step = verifyTotp(secret, code, now);
    if (step === null) throw new TotpError(400, "That code didn't match. Type the newest code from your app.");
    const codes = generateRecoveryCodes();
    tx.update(totpRef(uid), {
      status: "active",
      lastStep: step,
      recovery: codes.map(c => hashRecoveryCode(c, uid)),
      activatedAt: FieldValue.serverTimestamp()
    });
    return codes;
  });
}

export type TotpLoginResult = { ok: true; method: "totp" | "recovery"; recoveryCodesLeft: number } | { ok: false; locked?: true };

/** Checks an authenticator code, or a recovery code. A code works once. */
export async function verifyTotpLogin(uid: string, input: string, now = Date.now()): Promise<TotpLoginResult> {
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(totpRef(uid));
    const data = snap.exists ? (snap.data() as StoredTotp) : null;
    if (!data || data.status !== "active") return { ok: false };
    if (data.lockedAt) return { ok: false, locked: true };

    const secret = decryptTotpSecret(data.secret, serverEncryptionKeys(), uid);
    const step = verifyTotp(secret, input, now, data.lastStep);
    if (step !== null) {
      tx.update(totpRef(uid), { lastStep: step, lastUsedAt: FieldValue.serverTimestamp() });
      return { ok: true, method: "totp", recoveryCodesLeft: data.recovery.length };
    }

    const index = findRecoveryCode(input, uid, data.recovery);
    if (index >= 0) {
      const remaining = data.recovery.filter((_, i) => i !== index);
      tx.update(totpRef(uid), { recovery: remaining, lastUsedAt: FieldValue.serverTimestamp() });
      return { ok: true, method: "recovery", recoveryCodesLeft: remaining.length };
    }
    return { ok: false };
  });
}

/** Locks code sign-in for this admin (too many wrong codes). A super admin's reset removes the record and the lock. */
export async function lockTotp(uid: string): Promise<void> {
  await totpRef(uid).update({ lockedAt: FieldValue.serverTimestamp() });
}

/** Replaces the recovery codes (the old ones stop working). */
export async function regenerateRecoveryCodes(uid: string): Promise<string[]> {
  return getAdminDb().runTransaction(async tx => {
    const snap = await tx.get(totpRef(uid));
    if (!snap.exists || (snap.data() as StoredTotp).status !== "active") {
      throw new TotpError(409, "Set up the authenticator app first");
    }
    const codes = generateRecoveryCodes();
    tx.update(totpRef(uid), { recovery: codes.map(c => hashRecoveryCode(c, uid)) });
    return codes;
  });
}

/** Removes the authenticator app (the admin sets up a new one after the next email-link sign-in). */
export async function removeTotp(uid: string): Promise<boolean> {
  const ref = totpRef(uid);
  const snap = await ref.get();
  if (!snap.exists) return false;
  await ref.delete();
  return true;
}
