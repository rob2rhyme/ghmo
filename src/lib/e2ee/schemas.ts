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
