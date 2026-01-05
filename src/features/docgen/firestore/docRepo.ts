import { adminDb } from "@/src/lib/firebaseAdmin";
import { FieldValue } from "firebase-admin/firestore";
import { COMMUNITY_SLUG } from "@/src/lib/community";
import { orgDocumentsCollectionPath } from "@/src/lib/firestorePaths";

const documentsCollection = adminDb.collection(orgDocumentsCollectionPath(COMMUNITY_SLUG));

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
    createdByUid: data.createdByUid as string,
    createdByEmail: data.createdByEmail as string | undefined,
    createdAt: toDate(data.createdAt),
    updatedAt: toDate(data.updatedAt)
  };
}

export type SavedDocumentRecord = ReturnType<typeof mapDocRecord>;

export type CreateDocumentInput = {
  templateId: string;
  templateTitle: string;
  category: string;
  inputs: Record<string, string>;
  createdByUid: string;
  createdByEmail?: string;
  docId?: string;
};

export async function createDocument(payload: CreateDocumentInput) {
  const documentData = {
    templateId: payload.templateId,
    templateTitle: payload.templateTitle,
    category: payload.category,
    inputs: payload.inputs,
    createdByUid: payload.createdByUid,
    createdByEmail: payload.createdByEmail,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  };

  let docRef: FirebaseFirestore.DocumentReference<FirebaseFirestore.DocumentData>;
  if (payload.docId) {
    docRef = documentsCollection.doc(payload.docId);
    await docRef.set(documentData, { merge: true });
  } else {
    docRef = await documentsCollection.add(documentData);
  }

  const snapshot = await docRef.get();
  return mapDocRecord(snapshot);
}

export async function listDocuments() {
  const snapshot = await documentsCollection.orderBy("createdAt", "desc").limit(100).get();
  return snapshot.docs.map(mapDocRecord);
}

export async function getDocument(docId: string) {
  const snapshot = await documentsCollection.doc(docId).get();
  if (!snapshot.exists) {
    return null;
  }
  return mapDocRecord(snapshot);
}
