import { z } from "zod";
import { MAX_SIGNATURE_BYTES } from "./signatureEncryption";
import { listEpochs, getState } from "./e2eeStore";
import type { PublicJwk } from "./e2ee";

const coordinate = z.string().min(40).max(50).regex(/^[A-Za-z0-9_-]+$/);

/** A signature sealed in the signer's browser (see sealSignature). The server only checks its shape and size. */
export const sealedSignatureSchema = z
  .object({
    v: z.literal(1),
    epoch: z.number().int().min(1),
    epk: z.object({ kty: z.literal("EC"), crv: z.literal("P-256"), x: coordinate, y: coordinate }).strict(),
    iv: z.string().length(16),
    // PNG bytes + 16-byte GCM tag, base64url.
    ct: z.string().min(24).max(Math.ceil(((MAX_SIGNATURE_BYTES + 16) * 4) / 3) + 4)
  })
  .strict();

export type SealedSignatureInput = z.infer<typeof sealedSignatureSchema>;

/** The key signers seal to, or null while encryption is off. */
export async function currentSealingKey(): Promise<{ epoch: number; publicJwk: PublicJwk } | null> {
  const state = await getState();
  if (!state.enabled) return null;
  const epoch = (await listEpochs()).find(e => e.epoch === state.currentEpoch);
  return epoch ? { epoch: epoch.epoch, publicJwk: epoch.sealingPublic as PublicJwk } : null;
}
