import { describe, expect, it } from "vitest";
import { exportPublicJwk, generateDeviceKeys, generateWorkspaceKey, wrapToPublicKey } from "@/src/lib/e2ee";
import { deviceIdSchema, keyWrapSchema, publicJwkSchema, wrapRecordSchema } from "@/src/lib/e2ee/schemas";

describe("E2EE API schemas", () => {
  it("accept real keys and wraps", async () => {
    const device = await generateDeviceKeys();
    const pub = await exportPublicJwk(device.ecdh.publicKey);
    expect(publicJwkSchema.safeParse(pub).success).toBe(true);
    const wrap = await wrapToPublicKey(generateWorkspaceKey(), pub, "ctx");
    expect(keyWrapSchema.safeParse(wrap).success).toBe(true);
    expect(wrapRecordSchema.safeParse({ epoch: 1, recipient: "recovery", wrap }).success).toBe(true);
  });

  it("reject private keys, other curves and oversized ciphertext", async () => {
    const device = await generateDeviceKeys();
    const pub = await exportPublicJwk(device.ecdh.publicKey);
    expect(publicJwkSchema.safeParse({ ...pub, crv: "P-384" }).success).toBe(false);
    expect(publicJwkSchema.strict().safeParse({ ...pub, d: "secret" }).success).toBe(false);
    const wrap = await wrapToPublicKey(generateWorkspaceKey(), pub, "ctx");
    expect(keyWrapSchema.safeParse({ ...wrap, ct: "A".repeat(600) }).success).toBe(false);
  });

  it("device ids: safe characters only, and 'recovery' is reserved", () => {
    expect(deviceIdSchema.safeParse("abcdefghijklmnop").success).toBe(true);
    expect(deviceIdSchema.safeParse("recovery").success).toBe(false);
    expect(deviceIdSchema.safeParse("../../admins/xxxxxxxx").success).toBe(false);
  });
});
