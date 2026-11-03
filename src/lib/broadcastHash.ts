import crypto from "node:crypto";
import type { BroadcastContent } from "./broadcast.shared";

/**
 * The hash an approval is bound to. Node-only (node:crypto): never import it from a client component.
 * It is kept out of ./broadcast (marked server-only) so the browser tests can compute the same hash.
 */
export function hashBroadcast(content: BroadcastContent): string {
  return crypto.createHash("sha256").update(JSON.stringify({ v: 1, audience: "all", subject: content.subject, body: content.body })).digest("hex");
}
