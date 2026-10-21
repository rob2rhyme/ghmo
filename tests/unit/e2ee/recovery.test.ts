import { describe, expect, it } from "vitest";
import {
  epochWrapContext,
  formatRecoveryKey,
  generateRecoveryKey,
  generateWorkspaceKey,
  importRecoveryPrivateKey,
  normalizeRecoveryKeyInput,
  parseRecoveryKey,
  pickVerificationGroups,
  randomBytes,
  unwrapWithPrivateKey,
  wrapToPublicKey
} from "@/src/lib/e2ee";

describe("recovery key format", () => {
  it("prints 14 groups of 4 from an unambiguous alphabet", async () => {
    const { printable } = await generateRecoveryKey();
    expect(printable).toMatch(/^([0-9A-HJKMNP-TV-Z]{4}-){13}[0-9A-HJKMNP-TV-Z]{3}$/);
  });

  it("parses what it prints, ignoring case, spaces and look-alike letters", async () => {
    const d = randomBytes(32);
    const printable = await formatRecoveryKey(d);
    expect(await parseRecoveryKey(printable)).toEqual(d);
    expect(await parseRecoveryKey(printable.toLowerCase().replace(/-/g, " "))).toEqual(d);
    const withLookAlikes = printable.replace(/0/g, "O").replace(/1/g, "l");
    expect(normalizeRecoveryKeyInput(withLookAlikes)).toBe(printable.replace(/-/g, ""));
  });

  it("catches a typo in any single character", async () => {
    const printable = await formatRecoveryKey(randomBytes(32));
    const chars = printable.split("");
    const index = chars.findIndex((c, i) => i > 10 && c !== "-");
    chars[index] = chars[index] === "A" ? "B" : "A";
    await expect(parseRecoveryKey(chars.join(""))).rejects.toThrow(/typo/);
    await expect(parseRecoveryKey(printable.slice(0, -2))).rejects.toThrow(/55 characters/);
  });

  it("picks two distinct groups to verify", () => {
    const groups = pickVerificationGroups();
    expect(groups).toHaveLength(2);
    expect(new Set(groups).size).toBe(2);
    groups.forEach(g => expect(g).toBeGreaterThanOrEqual(0));
    groups.forEach(g => expect(g).toBeLessThan(14));
  });
});

describe("recovery key unwraps workspace keys", () => {
  it("restores a workspace key from the paper copy and stored public key", async () => {
    const recovery = await generateRecoveryKey();
    const wdk = generateWorkspaceKey();
    const wrap = await wrapToPublicKey(wdk, recovery.publicJwk, epochWrapContext(1, "recovery"));
    const privateKey = await importRecoveryPrivateKey(recovery.printable, recovery.publicJwk);
    expect(await unwrapWithPrivateKey(wrap, privateKey, epochWrapContext(1, "recovery"))).toEqual(wdk);
  });

  it("a different recovery key cannot unwrap", async () => {
    const recovery = await generateRecoveryKey();
    const other = await generateRecoveryKey();
    const wrap = await wrapToPublicKey(generateWorkspaceKey(), recovery.publicJwk, epochWrapContext(1, "recovery"));
    // Either the import notices the mismatch, or the unwrap fails; never a wrong key.
    const attempt = importRecoveryPrivateKey(other.printable, recovery.publicJwk).then(key =>
      unwrapWithPrivateKey(wrap, key, epochWrapContext(1, "recovery"))
    );
    await expect(attempt).rejects.toThrow();
    await expect(importRecoveryPrivateKey(other.printable, recovery.publicJwk)).rejects.toThrow(/doesn't belong/);
  });
});
