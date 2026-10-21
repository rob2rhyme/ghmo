import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgDocumentsCollectionPath } from "@/src/lib/firestorePaths";

const documentsCollectionPath = orgDocumentsCollectionPath(COMMUNITY_SLUG);

function getDocumentsCollection() {
  return getAdminDb().collection(documentsCollectionPath);
}

function toDate(value: unknown): Date | undefined {
  if (!value) return undefined;
  if (value instanceof Date) return value;
  if (typeof value === "object" && value && "toDate" in value && typeof (value as any).toDate === "function") {
    return (value as any).toDate();
  }
  return undefined;
}

function mapDocRecord(doc: FirebaseFirestore.DocumentSnapshot<FirebaseFirestore.DocumentData>) {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    templateId: data.templateId as string,
    templateTitle: data.templateTitle as string,
    category: data.category as string,
    inputs: (data.inputs as Record<string, string>) ?? {},
    /** Encrypted inputs (and PDF) when the document was saved with encryption on. */
    enc: (data.enc as Record<string, unknown> | undefined) ?? undefined,
    createdByUid: data.createdByUid as string,
    createdByEmail: data.createdByEmail as string | undefined,
    createdByName: data.createdByName as string | undefined,
    createdByRoles: Array.isArray(data.createdByRoles) ? (data.createdByRoles as string[]) : undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt)
  };
}

export type SavedDocumentRecord = ReturnType<typeof mapDocRecord>;

export type CreateDocumentInput = {
  templateId: string;
  templateTitle: string;
  category: string;
  inputs?: Record<string, string>;
  enc?: Record<string, unknown>;
  createdByUid: string;
  createdByEmail?: string;
  createdByName?: string;
  createdByRoles?: string[];
  docId?: string;
};

/** Thrown when trying to change a finalized (signed) document. */
export class DocumentLockedError extends Error {
  constructor() {
    super("Finalized documents cannot be changed");
    this.name = "DocumentLockedError";
  }
}

export async function createDocument(payload: CreateDocumentInput) {
  const documentData = {
    templateId: payload.templateId,
    templateTitle: payload.templateTitle,
    category: payload.category,
    ...(payload.enc
      ? // Encrypted content replaces any plaintext inputs saved earlier.
        { enc: payload.enc, inputs: FieldValue.delete() }
      : { inputs: payload.inputs ?? {} }),
    createdByUid: payload.createdByUid,
    createdByEmail: payload.createdByEmail ?? null,
    createdByName: payload.createdByName ?? null,
    createdByRoles: payload.createdByRoles,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  let docRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  if (payload.docId) {
    const ref = getDocumentsCollection().doc(payload.docId);
    docRef = ref;
    // Signed certificates are immutable: their inputs must keep matching the signed PDF.
    await ref.firestore.runTransaction(async tx => {
      const existing = await tx.get(ref);
      if (existing.exists && existing.data()?.status === "finalized") throw new DocumentLockedError();
      tx.set(ref, documentData, { merge: true });
    });
  } else {
    docRef = await getDocumentsCollection().add(documentData);
  }

  const snapshot = await docRef.get();
  return mapDocRecord(snapshot);
}

export async function listDocuments() {
  const snapshot = await getDocumentsCollection().orderBy("createdAt", "desc").limit(100).get();
  return snapshot.docs.map(mapDocRecord);
}

export async function getDocument(docId: string) {
  const snapshot = await getDocumentsCollection().doc(docId).get();
  if (!snapshot.exists) {
    return null;
  }
  return mapDocRecord(snapshot);
}
