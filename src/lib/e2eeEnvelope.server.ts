import { z } from "zod";
import { getState, listDevices } from "./e2eeStore";

/** Same shape the Firestore rules accept for `isEnvelope`. */
export const envelopeSchemaWithLimit = (maxCiphertext: number) =>
  z
    .object({
      v: z.literal(1),
      epoch: z.number().int().min(1),
      dev: z.string().min(16).max(64),
      iv: z.string().length(16),
      ct: z.string().min(22).max(maxCiphertext),
      sig: z.string().min(64).max(200),
    })
    .strict();

export const envelopeSchema = envelopeSchemaWithLimit(200_000);

/** For server-written documents only (they bypass the rules); a Firestore document is capped at 1 MiB. */
export const largeEnvelopeSchema = envelopeSchemaWithLimit(900_000);

export type EnvelopeInput = z.infer<typeof envelopeSchema>;

/** The writing device must be an active device of the signed-in admin (as the rules require for direct writes). */
export async function deviceBelongsTo(
  envelope: EnvelopeInput,
  uid: string,
): Promise<boolean> {
  // Only the current epoch counts: a device that missed a rotation (or a revoked device that still holds
  // an old key) can't keep adding records under the old key.
  const [devices, state] = await Promise.all([listDevices(), getState()]);
  if (envelope.epoch !== state.currentEpoch) return false;
  return devices.some(
    (d) =>
      d.deviceId === envelope.dev && d.uid === uid && d.status === "active",
  );
}
