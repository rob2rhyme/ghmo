import { describe, expect, it } from "vitest";
import { epochWrapContext, exportPublicJwk, generateDeviceKeys, generateWorkspaceKey, wrapToPublicKey } from "@/src/lib/e2ee";
import { unwrapEpochKeys, type WrapRecord } from "@/src/lib/e2ee/keyring";

const DEVICE = "device-000000000001";

async function setup() {
  const keys = await generateDeviceKeys();
  const pub = await exportPublicJwk(keys.ecdh.publicKey);
  const wrap = async (epoch: number, to = pub): Promise<WrapRecord> => ({
    epoch,
    recipient: DEVICE,
    wrap: await wrapToPublicKey(generateWorkspaceKey(), to, epochWrapContext(epoch, DEVICE))
  });
  return { keys, wrap, other: await exportPublicJwk((await generateDeviceKeys()).ecdh.publicKey) };
}

describe("unwrapEpochKeys", () => {
  it("opens every epoch it is given", async () => {
    const { keys, wrap } = await setup();
    const opened = await unwrapEpochKeys([await wrap(1), await wrap(2)], DEVICE, keys.ecdh.privateKey);
    expect([...opened.keys()].sort()).toEqual([1, 2]);
  });

  it("ignores epochs above the workspace's current one, so a server can't invent a newer key", async () => {
    const { keys, wrap } = await setup();
    const opened = await unwrapEpochKeys([await wrap(1), await wrap(2), await wrap(1000)], DEVICE, keys.ecdh.privateKey, { maxEpoch: 2 });
    expect([...opened.keys()].sort()).toEqual([1, 2]);
  });

  it("skips an unreadable older epoch but refuses when the newest cannot be opened", async () => {
    const { keys, wrap, other } = await setup();
    const olderBroken = await unwrapEpochKeys([await wrap(1, other), await wrap(2)], DEVICE, keys.ecdh.privateKey);
    expect([...olderBroken.keys()]).toEqual([2]);
    await expect(unwrapEpochKeys([await wrap(1), await wrap(2, other)], DEVICE, keys.ecdh.privateKey)).rejects.toThrow();
  });
});
