import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment
} from "@firebase/rules-unit-testing";
import { addDoc, collection, doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, it } from "vitest";

const ORG = "organizations/ghmo";
const CLAIMS = { orgSlug: "ghmo", role: "admin", admin: true, authMethod: "passkey" };
const ALICE_DEVICE = "alice-device-0000001";
const BOB_DEVICE = "bob-device-000000001";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: "demo-ghmo", firestore: { rules: readFileSync("firestore.rules", "utf8") } });
});
afterAll(async () => env?.cleanup());

/** A structurally valid envelope written by `dev` (the rules check shape and device ownership, not the crypto). */
const envelope = (dev: string, ct = "A".repeat(40)) => ({ v: 1, epoch: 1, dev, iv: "A".repeat(16), ct, sig: "B".repeat(86) });

async function seed({ e2ee }: { e2ee: boolean }) {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async ctx => {
    const db = ctx.firestore();
    await setDoc(doc(db, `${ORG}/admins/alice`), { status: "active" });
    await setDoc(doc(db, `${ORG}/admins/bob`), { status: "active" });
    if (e2ee) {
      await setDoc(doc(db, `${ORG}/e2ee/state`), { enabled: true });
      await setDoc(doc(db, `${ORG}/e2ee/state/devices/${ALICE_DEVICE}`), { uid: "alice", status: "active" });
      await setDoc(doc(db, `${ORG}/e2ee/state/devices/${BOB_DEVICE}`), { uid: "bob", status: "active" });
      await setDoc(doc(db, `${ORG}/e2ee/state/devices/revoked-device-00001`), { uid: "alice", status: "revoked" });
    }
  });
}

const as = (uid: string) => env.authenticatedContext(uid, CLAIMS).firestore();

describe("before encryption is turned on, plaintext still works", () => {
  beforeEach(() => seed({ e2ee: false }));

  it("accepts plaintext chat and threads, and refuses envelopes", async () => {
    await assertSucceeds(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { body: "hi", createdBy: { uid: "alice" }, createdAt: serverTimestamp() }));
    await assertSucceeds(
      addDoc(collection(as("alice"), `${ORG}/commsThreads`), {
        title: "T", body: "B", status: "open", createdBy: { uid: "alice" }, createdAt: serverTimestamp(), lastActivityAt: serverTimestamp()
      })
    );
    await assertFails(
      addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: envelope(ALICE_DEVICE), createdBy: { uid: "alice" }, createdAt: serverTimestamp() })
    );
  });
});

describe("once encryption is on", () => {
  beforeEach(() => seed({ e2ee: true }));

  describe("admin chat", () => {
    it("accepts an envelope from the author's own active device", async () => {
      await assertSucceeds(
        addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: envelope(ALICE_DEVICE), createdBy: { uid: "alice" }, createdAt: serverTimestamp() })
      );
    });

    it("refuses plaintext bodies, extra plaintext fields and mixed documents", async () => {
      const base = { createdBy: { uid: "alice" }, createdAt: serverTimestamp() };
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { body: "secret", ...base }));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: envelope(ALICE_DEVICE), body: "secret", ...base }));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: envelope(ALICE_DEVICE), preview: "secret", ...base }));
    });

    it("refuses an envelope written by someone else's device, a revoked device or an unknown device", async () => {
      const base = { createdBy: { uid: "alice" }, createdAt: serverTimestamp() };
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: envelope(BOB_DEVICE), ...base }));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: envelope("revoked-device-00001"), ...base }));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: envelope("nobody-device-000001"), ...base }));
    });

    it("refuses malformed envelopes", async () => {
      const base = { createdBy: { uid: "alice" }, createdAt: serverTimestamp() };
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: { ...envelope(ALICE_DEVICE), v: 2 }, ...base }));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: { ...envelope(ALICE_DEVICE), iv: "short" }, ...base }));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: { ...envelope(ALICE_DEVICE), extra: "x" }, ...base }));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/adminChatMessages`), { enc: "not-a-map", ...base }));
    });
  });

  describe("Plans & Issues", () => {
    const newThread = () => ({
      enc: envelope(ALICE_DEVICE),
      status: "open",
      priority: "normal",
      pinned: false,
      commentCount: 0,
      createdBy: { uid: "alice", name: "Alice" },
      createdAt: serverTimestamp(),
      lastActivityAt: serverTimestamp()
    });

    it("creates encrypted threads, never plaintext titles or bodies", async () => {
      await assertSucceeds(addDoc(collection(as("alice"), `${ORG}/commsThreads`), newThread()));
      await assertFails(addDoc(collection(as("alice"), `${ORG}/commsThreads`), { ...newThread(), title: "Secret plan" }));
      const { enc: _enc, ...withoutEnc } = newThread();
      await assertFails(addDoc(collection(as("alice"), `${ORG}/commsThreads`), { ...withoutEnc, title: "T", body: "B" }));
    });

    it("lets another admin bump counters without touching the author's envelope", async () => {
      const ref = await addDoc(collection(as("alice"), `${ORG}/commsThreads`), newThread());
      await assertSucceeds(updateDoc(doc(as("bob"), ref.path), { commentCount: 1, lastActivityAt: serverTimestamp() }));
    });

    it("refuses swapping in a forged envelope, or someone else's device, on update", async () => {
      const ref = await addDoc(collection(as("alice"), `${ORG}/commsThreads`), newThread());
      await assertFails(updateDoc(doc(as("bob"), ref.path), { enc: envelope(ALICE_DEVICE, "C".repeat(40)) }));
      await assertSucceeds(updateDoc(doc(as("bob"), ref.path), { enc: envelope(BOB_DEVICE, "C".repeat(40)) }));
    });

    it("refuses to downgrade an encrypted thread back to plaintext", async () => {
      const ref = await addDoc(collection(as("alice"), `${ORG}/commsThreads`), newThread());
      await assertFails(updateDoc(doc(as("alice"), ref.path), { title: "T", body: "B" }));
    });

    it("keeps legacy plaintext threads usable until migrated, and lets the migration encrypt them", async () => {
      await env.withSecurityRulesDisabled(async ctx => {
        await setDoc(doc(ctx.firestore(), `${ORG}/commsThreads/legacy`), {
          title: "Old", body: "Old body", status: "open", createdBy: { uid: "alice" }, commentCount: 0, lastActivityAt: new Date()
        });
      });
      await assertSucceeds(updateDoc(doc(as("bob"), `${ORG}/commsThreads/legacy`), { commentCount: 1 }));
      await assertFails(updateDoc(doc(as("bob"), `${ORG}/commsThreads/legacy`), { title: "Edited in plaintext" }));
      // Migration: add the envelope and remove the plaintext fields in one update.
      const { deleteField } = await import("firebase/firestore");
      await assertSucceeds(
        updateDoc(doc(as("alice"), `${ORG}/commsThreads/legacy`), { enc: envelope(ALICE_DEVICE), title: deleteField(), body: deleteField() })
      );
    });

    it("conclusions are envelopes too: proposing needs one, plaintext is refused", async () => {
      const ref = await addDoc(collection(as("alice"), `${ORG}/commsThreads`), newThread());
      const propose = (conclusion: Record<string, unknown>) =>
        updateDoc(doc(as("alice"), ref.path), { status: "closing", conclusion: { ...conclusion, proposedBy: { uid: "alice" } } });
      await assertFails(propose({ text: "We decided X" }));
      await assertSucceeds(propose({ enc: envelope(ALICE_DEVICE, "D".repeat(40)) }));
    });

    it("comments: envelope required, plaintext refused", async () => {
      const ref = await addDoc(collection(as("alice"), `${ORG}/commsThreads`), newThread());
      const base = { createdBy: { uid: "bob" }, createdAt: serverTimestamp() };
      await assertSucceeds(addDoc(collection(as("bob"), `${ref.path}/comments`), { enc: envelope(BOB_DEVICE), ...base }));
      await assertFails(addDoc(collection(as("bob"), `${ref.path}/comments`), { body: "plaintext", ...base }));
      await assertFails(addDoc(collection(as("bob"), `${ref.path}/comments`), { enc: envelope(ALICE_DEVICE), ...base }));
    });

    it("anyone but admins still can't read", async () => {
      const ref = await addDoc(collection(as("alice"), `${ORG}/commsThreads`), newThread());
      await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), ref.path)));
    });
  });
});
