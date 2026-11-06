import { z } from "zod";
import { envelopeSchema } from "./e2eeEnvelope.server";

/**
 * Server side of a member's encrypted contact record (plan §12, 9-A). The browser encrypts
 * {phone, altPhone, language, household, notes} into one envelope bound to the member id and sends it
 * with the plaintext `hasPhone` flag the list pages filter on. The server stores both as they are: it can
 * check who wrote the envelope (an active device of the signed-in admin) but never read it.
 */
export const contactInputSchema = z.object({ enc: envelopeSchema, hasPhone: z.boolean() }).strict();
export type ContactInput = z.infer<typeof contactInputSchema>;

/** Firestore doc IDs only: no "/" so an id cannot reach another collection. Also what the browser generates. */
export const MEMBER_ID_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;

export const PHONE_CONSENT_INPUT = z.object({ source: z.enum(["admin_on_request", "signed_up"]) });

/**
 * Member data for an audit entry. The ciphertext is replaced by a marker so the log stays small, and the email address is
 * replaced by whether there is one: every admin can read the log, and it is never edited, so an address written there
 * would outlive the member's own record if they were later deleted (plan §20). The name stays, so an entry still says who.
 */
export function memberAuditView(data: Record<string, unknown>): Record<string, unknown> {
  const { contact, email, emailLower, ...rest } = data;
  const view: Record<string, unknown> = { ...rest };
  if ("email" in data || "emailLower" in data) view.hasEmail = Boolean((typeof emailLower === "string" && emailLower) || (typeof email === "string" && email));
  if ("contact" in data) view.contact = contact ? "[encrypted]" : null;
  return view;
}
