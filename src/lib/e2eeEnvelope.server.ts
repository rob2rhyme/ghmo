import { z } from "zod";
import { listDevices } from "./e2eeStore";

/** Same shape the Firestore rules accept for `isEnvelope`. */
export const envelopeSchema = z
  .object({
    v: z.literal(1),
    epoch: z.number().int().min(1),
    dev: z.string().min(16).max(64),
    iv: z.string().length(16),
    ct: z.string().min(22).max(200_000),
    sig: z.string().min(64).max(200)
  })
  .strict();

export type EnvelopeInput = z.infer<typeof envelopeSchema>;

/** The writing device must be an active device of the signed-in admin (as the rules require for direct writes). */
export async function deviceBelongsTo(envelope: EnvelopeInput, uid: string): Promise<boolean> {
  const devices = await listDevices();
  return devices.some(d => d.deviceId === envelope.dev && d.uid === uid && d.status === "active");
}
