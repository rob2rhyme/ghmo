/** Zod schemas for E2EE data crossing the API (ciphertext and public keys only). */
import { z } from "zod";

const b64url = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_-]+$/);

export const publicJwkSchema = z.object({
  kty: z.literal("EC"),
  crv: z.literal("P-256"),
  x: b64url(64),
  y: b64url(64)
});

export const sealedBytesSchema = z.object({ iv: b64url(32), ct: b64url(8192) });

export const keyWrapSchema = z.object({ epk: publicJwkSchema, iv: b64url(32), ct: b64url(512) });

export const deviceIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-]{16,64}$/)
  .refine(id => id !== "recovery", "reserved");

export const epochNumberSchema = z.number().int().min(1).max(1_000_000);

export const wrapRecordSchema = z.object({
  epoch: epochNumberSchema,
  recipient: z.union([deviceIdSchema, z.literal("recovery")]),
  wrap: keyWrapSchema
});

export const epochRecordSchema = z.object({
  epoch: epochNumberSchema,
  sealingPublic: publicJwkSchema,
  sealingPrivate: sealedBytesSchema,
  createdByDevice: deviceIdSchema
});

export const trusteeSchema = z.object({ name: z.string().trim().min(1).max(80) });

/** Proof-of-possession for the recovery key: a token wrapped to it, and the token's hash. */
export const recoveryCheckSchema = z.object({
  wrap: keyWrapSchema,
  tokenHash: z.string().regex(/^[0-9a-f]{64}$/)
});

// ---------- signed device log (see roster.ts) ----------

const rosterKeySchema = z.object({ x: b64url(64), y: b64url(64) }).strict();
const rosterDeviceSchema = z.object({ id: deviceIdSchema, uid: z.string().min(1).max(128), ecdh: rosterKeySchema, ecdsa: rosterKeySchema }).strict();
const rosterDigestSchema = z
  .object({ epoch: epochNumberSchema, recipient: z.union([deviceIdSchema, z.literal("recovery")]), h: z.string().regex(/^[0-9a-f]{64}$/) })
  .strict();
const rosterBase = {
  v: z.literal(1),
  seq: z.number().int().min(1).max(1_000_000),
  prev: z.string().regex(/^([0-9a-f]{64})?$/),
  by: z.union([deviceIdSchema, z.literal("recovery")]),
  at: z.string().max(40),
  sig: b64url(200)
};
const digests = z.array(rosterDigestSchema).max(5_000);

export const rosterEntrySchema = z.discriminatedUnion("type", [
  z
    .object({
      ...rosterBase,
      type: z.literal("genesis"),
      body: z
        .object({
          devices: z.array(rosterDeviceSchema).min(1).max(500),
          recovery: rosterKeySchema,
          epochs: z.array(z.object({ epoch: epochNumberSchema, sealing: rosterKeySchema }).strict()).min(1).max(1000),
          wraps: digests
        })
        .strict()
    })
    .strict(),
  z
    .object({
      ...rosterBase,
      type: z.literal("add"),
      body: z.object({ device: rosterDeviceSchema, via: z.enum(["device", "recovery"]), wraps: digests }).strict()
    })
    .strict(),
  z
    .object({
      ...rosterBase,
      type: z.literal("rotate"),
      body: z
        .object({
          epoch: epochNumberSchema,
          sealing: rosterKeySchema,
          revoked: z.array(deviceIdSchema).max(500),
          devices: z.array(deviceIdSchema).max(500),
          wraps: digests
        })
        .strict()
    })
    .strict(),
  z
    .object({ ...rosterBase, type: z.literal("recovery"), body: z.object({ recovery: rosterKeySchema, wraps: digests }).strict() })
    .strict()
]);
