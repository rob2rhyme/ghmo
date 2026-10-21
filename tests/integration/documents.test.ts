import { beforeEach, describe, expect, it } from "vitest";
import { createDocument, DocumentLockedError } from "@/src/features/docgen/firestore/docRepo";
import { getAdminDb } from "@/src/lib/firebaseAdmin";

const PROJECT = process.env.FIREBASE_ADMIN_PROJECT_ID!;

const base = {
  templateId: "weddingCertificate",
  templateTitle: "Wedding Certificate",
  category: "Certificates",
  inputs: { groom: "A", bride: "B" },
  createdByUid: "admin-1",
  createdByRoles: ["admin"]
};

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE"
  });
});

describe("createDocument with an existing docId", () => {
  it("updates a draft document", async () => {
    const first = await createDocument(base);
    const updated = await createDocument({ ...base, inputs: { groom: "C", bride: "B" }, docId: first.id });
    expect(updated.inputs).toMatchObject({ groom: "C" });
  });

  it("refuses to change a finalized (signed) certificate", async () => {
    const first = await createDocument(base);
    const snapshot = await getAdminDb().collectionGroup("documents").get();
    const ref = snapshot.docs.find(d => d.id === first.id)!.ref;
    await ref.set({ status: "finalized" }, { merge: true });

    await expect(createDocument({ ...base, inputs: { groom: "Mallory", bride: "B" }, docId: first.id })).rejects.toBeInstanceOf(
      DocumentLockedError
    );
    expect((await ref.get()).data()?.inputs).toMatchObject({ groom: "A" });
  });
});
