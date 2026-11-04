import "server-only";
import type { Firestore } from "firebase-admin/firestore";
import { CERTIFICATES_COLLECTION } from "./certificates.server";
import { orgDocPath } from "./firestorePaths";

/**
 * Automatic certificate numbers: "GHMO-<year>-<NNN>", three digits (more after 999), counted per year in
 * Harrisburg's time zone. The counter is a document under the organization, advanced in a transaction, so two
 * admins can't be handed the same number. A number someone typed by hand is never handed out again: before a
 * number is returned, the issued certificates and the signature requests are checked for it.
 */

export const CERTIFICATE_NUMBER_PREFIX = "GHMO";
const NUMBER_TIME_ZONE = "America/New_York";
/** How many taken numbers in a row are skipped before giving up (only typed numbers can be taken). */
const MAX_SKIPS = 50;

export function formatCertificateNumber(year: number, sequence: number): string {
  return `${CERTIFICATE_NUMBER_PREFIX}-${year}-${String(sequence).padStart(3, "0")}`;
}

/** The calendar year in Harrisburg at `now` (on New Year's Eve evening, UTC is already in the next year). */
export function certificateYear(now: Date = new Date()): number {
  const year = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: NUMBER_TIME_ZONE }).format(now);
  return Number(year);
}

export function certificateCounterPath(orgSlug: string, year: number): string {
  return `${orgDocPath(orgSlug)}/counters/certificates-${year}`;
}

/** Reads the counter's last number; anything unexpected counts as none. */
export function lastSequence(data: unknown): number {
  const last = (data as { last?: unknown } | undefined)?.last;
  return typeof last === "number" && Number.isInteger(last) && last > 0 ? last : 0;
}

export class CertificateNumberError extends Error {}

/** Allocates the next free number for this year. */
export async function allocateCertificateNumber(db: Firestore, orgSlug: string, actorUid: string, now: Date = new Date()): Promise<string> {
  const year = certificateYear(now);
  const counterRef = db.doc(certificateCounterPath(orgSlug, year));
  return db.runTransaction(async tx => {
    const counter = await tx.get(counterRef);
    let sequence = lastSequence(counter.data());
    for (let skips = 0; skips <= MAX_SKIPS; skips++) {
      sequence += 1;
      const candidate = formatCertificateNumber(year, sequence);
      const [issued, requested] = await Promise.all([
        tx.get(db.collection(CERTIFICATES_COLLECTION).where("certificateId", "==", candidate).limit(1)),
        tx.get(db.collection("signingSessions").where("certificateId", "==", candidate).limit(1))
      ]);
      if (issued.empty && requested.empty) {
        tx.set(counterRef, { year, last: sequence, updatedAt: now, updatedByUid: actorUid }, { merge: true });
        return candidate;
      }
    }
    throw new CertificateNumberError("No free certificate number was found.");
  });
}
