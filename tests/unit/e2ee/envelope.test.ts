import { describe, expect, it } from "vitest";
import {
  aesKeyFromRaw,
  decryptRecord,
  encryptRecord,
  EnvelopeError,
  exportPublicJwk,
  generateDeviceKeys,
  generateWorkspaceKey,
  fromBase64Url,
  toBase64Url,
  type Envelope
} from "@/src/lib/e2ee";

async function setup() {
  const device = await generateDeviceKeys();
  const wdk = await aesKeyFromRaw(generateWorkspaceKey());
  const signer = await exportPublicJwk(device.ecdsa.publicKey);
  const location = { path: "organizations/ghmo/adminChatMessages", docId: "msg-1" };
  const envelope = await encryptRecord({
    data: { body: "Meet at 6pm", mentions: ["sita"] },
    location,
    epoch: 4,
    workspaceKey: wdk,
    deviceId: "dev-a",
    signingKey: device.ecdsa.privateKey
  });
  const keys = {
    workspaceKeyFor: (epoch: number) => (epoch === 4 ? wdk : null),
    signingKeyFor: (dev: string) => (dev === "dev-a" ? signer : null)
  };
  return { envelope, location, keys };
}

describe("record envelopes", () => {
  it("round-trips data and hides the plaintext", async () => {
    const { envelope, location, keys } = await setup();
    expect(JSON.stringify(envelope)).not.toContain("6pm");
    expect(envelope).toMatchObject({ v: 1, epoch: 4, dev: "dev-a" });
    expect(await decryptRecord(envelope, location, keys)).toEqual({ body: "Meet at 6pm", mentions: ["sita"] });
  });

  it("cannot be moved to another document or collection", async () => {
    const { envelope, location, keys } = await setup();
    await expect(decryptRecord(envelope, { ...location, docId: "msg-2" }, keys)).rejects.toThrow(EnvelopeError);
    await expect(decryptRecord(envelope, { path: "organizations/ghmo/commsThreads", docId: "msg-1" }, keys)).rejects.toThrow();
  });

  it("rejects tampered ciphertext, a swapped signer, or a relabelled epoch", async () => {
    const { envelope, location, keys } = await setup();
    const ct = fromBase64Url(envelope.ct);
    ct[0] ^= 1;
    await expect(decryptRecord({ ...envelope, ct: toBase64Url(ct) }, location, keys)).rejects.toThrow(/Signature/);

    const other = await generateDeviceKeys();
    const otherPub = await exportPublicJwk(other.ecdsa.publicKey);
    await expect(
      decryptRecord(envelope, location, { ...keys, signingKeyFor: () => otherPub })
    ).rejects.toThrow(/Signature/);

    const relabelled: Envelope = { ...envelope, epoch: 5 };
    await expect(decryptRecord(relabelled, location, keys)).rejects.toThrow(/Signature/);
  });

  it("reports unknown devices and missing epoch keys clearly", async () => {
    const { envelope, location, keys } = await setup();
    await expect(decryptRecord(envelope, location, { ...keys, signingKeyFor: () => null })).rejects.toThrow(/unknown device/);
    await expect(decryptRecord(envelope, location, { ...keys, workspaceKeyFor: () => null })).rejects.toThrow(/No key for epoch 4/);
    await expect(decryptRecord({ hello: "world" }, location, keys)).rejects.toThrow(/Not an encrypted record/);
  });
});
