import type { RecordLocation } from "./e2ee";

/**
 * Saved documents (document history). Template, category, creator and timestamps stay readable;
 * the inputs (names, ceremony details) and any finalized PDF are inside the `enc` envelope.
 */
export const DOCUMENTS_PATH = "organizations/ghmo/documents";
export const documentLoc = (id: string): RecordLocation => ({ path: DOCUMENTS_PATH, docId: id });

/** A random Firestore-style document id, chosen in the browser so ciphertext can be bound to it. */
export function newDocumentId() {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), byte => alphabet[byte % alphabet.length]).join("");
}
