import { describe, expect, it } from "vitest";
import {
  base32Decode,
  base32Encode,
  decryptTotpSecret,
  encryptTotpSecret,
  findRecoveryCode,
  formatSecretForDisplay,
  generateRecoveryCodes,
  generateTotpSecret,
  hashRecoveryCode,
  hotp,
  keyId,
  normalizeRecoveryCode,
  normalizeTotpInput,
  otpauthUri,
  totpCode,
  totpStep,
  verifyTotp
} from "@/src/lib/totp";

// RFC 6238 appendix B (SHA-1, 8 digits). The secret is the ASCII string "12345678901234567890".
const RFC_SECRET = Buffer.from("12345678901234567890");
const RFC_VECTORS: Array<[number, string]> = [
  [59, "94287082"],
  [1111111109, "07081804"],
  [1111111111, "14050471"],
  [1234567890, "89005924"],
  [2000000000, "69279037"],
  [20000000000, "65353130"]
];

describe("TOTP (RFC 6238)", () => {
  it.each(RFC_VECTORS)("matches the published test vector at t=%i", (seconds, expected) => {
    expect(totpCode(RFC_SECRET, seconds * 1000, 8)).toBe(expected);
  });

  it("matches RFC 4226 HOTP vectors", () => {
    expect([0, 1, 2, 9].map(counter => hotp(RFC_SECRET, counter))).toEqual(["755224", "287082", "359152", "520489"]);
  });

  it("accepts the current code and one step either side, but not further", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now), now)).toBe(step);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now)).toBe(step - 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now + 30_000), now)).toBe(step + 1);
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 90_000), now)).toBeNull();
  });

  it("refuses a code from a step that was already used", () => {
    const now = 1_700_000_000_000;
    const step = totpStep(now);
    const code = totpCode(RFC_SECRET, now);
    expect(verifyTotp(RFC_SECRET, code, now, step)).toBeNull();
    expect(verifyTotp(RFC_SECRET, code, now, step - 1)).toBe(step);
    // An older code is also refused once a newer step has been used.
    expect(verifyTotp(RFC_SECRET, totpCode(RFC_SECRET, now - 30_000), now, step)).toBeNull();
  });

  it("rejects wrong, malformed and empty input", () => {
    const now = 1_700_000_000_000;
    const good = totpCode(RFC_SECRET, now);
    const wrong = good === "000000" ? "000001" : "000000";
    expect(verifyTotp(RFC_SECRET, wrong, now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "12345", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "1234567", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "abcdef", now)).toBeNull();
    expect(verifyTotp(RFC_SECRET, "", now)).toBeNull();
  });

  it("accepts a code typed with a space or dash", () => {
    const now = 1_700_000_000_000;
    const code = totpCode(RFC_SECRET, now);
    expect(normalizeTotpInput(`${code.slice(0, 3)} ${code.slice(3)}`)).toBe(code);
    expect(verifyTotp(RFC_SECRET, `${code.slice(0, 3)}-${code.slice(3)}`, now)).toBe(totpStep(now));
  });
});

describe("base32 and the authenticator URI", () => {
  it("round-trips and matches RFC 4648 examples", () => {
    expect(base32Encode(Buffer.from("foobar"))).toBe("MZXW6YTBOI");
    expect(base32Decode("MZXW6YTBOI").toString()).toBe("foobar");
    const secret = generateTotpSecret();
    expect(secret).toHaveLength(20);
    expect(base32Decode(base32Encode(secret)).equals(secret)).toBe(true);
    expect(base32Decode(formatSecretForDisplay(secret)).equals(secret)).toBe(true);
  });

  it("rejects text that is not base32", () => {
    expect(() => base32Decode("not*base32")).toThrow();
  });

  it("builds an otpauth URI an authenticator app understands", () => {
    const uri = otpauthUri({ secret: RFC_SECRET, account: "sita@example.org", issuer: "GHMO Admin" });
    const url = new URL(uri);
    expect(url.protocol).toBe("otpauth:");
    expect(url.host).toBe("totp");
    expect(decodeURIComponent(url.pathname)).toBe("/GHMO Admin:sita@example.org");
    expect(url.searchParams.get("secret")).toBe(base32Encode(RFC_SECRET));
    expect(url.searchParams.get("issuer")).toBe("GHMO Admin");
    expect(url.searchParams.get("digits")).toBe("6");
    expect(url.searchParams.get("period")).toBe("30");
  });
});

describe("secret encryption at rest", () => {
  const master = Buffer.alloc(32, 7);
  const secret = generateTotpSecret();

  it("round-trips for the same admin", () => {
    const blob = encryptTotpSecret(secret, master, "alice");
    expect(blob.kid).toBe(keyId(master));
    expect(decryptTotpSecret(blob, [master], "alice").equals(secret)).toBe(true);
  });

  it("does not decrypt for a different admin or with a tampered blob", () => {
    const blob = encryptTotpSecret(secret, master, "alice");
    expect(() => decryptTotpSecret(blob, [master], "bob")).toThrow();
    const flipped = Buffer.from(blob.ct, "base64");
    flipped[0] ^= 1;
    expect(() => decryptTotpSecret({ ...blob, ct: flipped.toString("base64") }, [master], "alice")).toThrow();
  });

  it("finds the right key during rotation and fails for an unknown one", () => {
    const oldKey = Buffer.alloc(32, 1);
    const blob = encryptTotpSecret(secret, oldKey, "alice");
    expect(decryptTotpSecret(blob, [master, oldKey], "alice").equals(secret)).toBe(true);
    expect(() => decryptTotpSecret(blob, [master], "alice")).toThrow(/Unknown/);
  });

  it("uses a fresh random nonce each time", () => {
    expect(encryptTotpSecret(secret, master, "alice").iv).not.toBe(encryptTotpSecret(secret, master, "alice").iv);
  });
});

describe("recovery codes", () => {
  it("generates the requested number of distinct, readable codes", () => {
    const codes = generateRecoveryCodes();
    expect(codes).toHaveLength(8);
    expect(new Set(codes).size).toBe(8);
    for (const code of codes) expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}$/);
  });

  it("finds a code regardless of case, dash or spaces, and only for the right admin", () => {
    const codes = generateRecoveryCodes(3);
    const hashes = codes.map(code => hashRecoveryCode(code, "alice"));
    expect(findRecoveryCode(codes[1].toLowerCase(), "alice", hashes)).toBe(1);
    expect(findRecoveryCode(codes[2].replace("-", " "), "alice", hashes)).toBe(2);
    expect(findRecoveryCode(codes[0], "bob", hashes)).toBe(-1);
  });

  it("rejects malformed input", () => {
    expect(normalizeRecoveryCode("too-short")).toBeNull();
    expect(normalizeRecoveryCode("0O1I0-O1I0O")).toBeNull();
    expect(findRecoveryCode("nope", "alice", ["x"])).toBe(-1);
    expect(() => hashRecoveryCode("nope", "alice")).toThrow();
  });
});
