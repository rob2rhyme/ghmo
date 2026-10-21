import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/signing-sessions/[sessionId]/sign/route";
import { getAdminDb } from "@/src/lib/firebaseAdmin";
import { decryptSignature, toPngDataUrl } from "@/src/lib/signatureEncryption";

const PROJECT = process.env.FIREBASE_ADMIN_PROJECT_ID!;
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), crypto.randomBytes(128)]);
let ipCounter = 0;

function sign(sessionId: string, body: unknown) {
  ipCounter += 1;
  return POST(
    new NextRequest(`http://localhost/api/signing-sessions/${sessionId}/sign`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": `10.1.0.${ipCounter}` },
      body: JSON.stringify(body)
    }),
    { params: Promise.resolve({ sessionId }) }
  );
}

async function createSession(overrides: Record<string, unknown> = {}) {
  const id = crypto.randomBytes(32).toString("hex");
  await getAdminDb()
    .collection("signingSessions")
    .doc(id)
    .set({ status: "pending", role: "witness", expiresAt: new Date(Date.now() + 60_000), ...overrides });
  return id;
}

beforeAll(() => {
  process.env.DOCGEN_SIGNATURE_ENC_KEY_BASE64 = crypto.randomBytes(32).toString("base64");
});

beforeEach(async () => {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${PROJECT}/databases/(default)/documents`, {
    method: "DELETE"
  });
});

describe("POST /api/signing-sessions/[id]/sign", () => {
  it("stores an encrypted signature bound to the session, and only once", async () => {
    const id = await createSession();
    const first = await sign(id, { dataUrl: toPngDataUrl(PNG), signerName: "Ram" });
    expect(first.status).toBe(200);

    const stored = (await getAdminDb().collection("signingSessions").doc(id).get()).data()!;
    expect(stored.status).toBe("signed");
    expect(stored.signatureEnc.v).toBe(2);
    expect(decryptSignature(stored.signatureEnc, id).equals(PNG)).toBe(true);

    const second = await sign(id, { dataUrl: toPngDataUrl(PNG) });
    expect(second.status).toBe(409);
  });

  it("refuses expired sessions and marks them expired", async () => {
    const id = await createSession({ expiresAt: new Date(Date.now() - 1000) });
    expect((await sign(id, { dataUrl: toPngDataUrl(PNG) })).status).toBe(410);
    const stored = (await getAdminDb().collection("signingSessions").doc(id).get()).data()!;
    expect(stored.status).toBe("expired");
  });

  it("rejects malformed session IDs without touching Firestore", async () => {
    expect((await sign("not-a-session", { dataUrl: toPngDataUrl(PNG) })).status).toBe(404);
  });

  it("rejects non-PNG data", async () => {
    const id = await createSession();
    expect((await sign(id, { dataUrl: toPngDataUrl(Buffer.from("hello")) })).status).toBe(400);
    expect((await sign(id, { dataUrl: "data:image/svg+xml;base64,PHN2Zz4=" })).status).toBe(400);
  });

  it("returns 404 for unknown sessions", async () => {
    expect((await sign(crypto.randomBytes(32).toString("hex"), { dataUrl: toPngDataUrl(PNG) })).status).toBe(404);
  });
});
