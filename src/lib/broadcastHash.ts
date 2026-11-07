import crypto from "node:crypto";
import { audienceKey, type BroadcastContent } from "./broadcast.shared";

/**
 * The hash an approval is bound to. Node-only (node:crypto): never import it from a client component.
 * It is kept out of ./broadcast (marked server-only) so the browser tests can compute the same hash.
 * The audience is part of it (plan §30, D92), so changing who it goes to needs approval again; "everyone"
 * hashes exactly as it did before groups existed, so older approvals still match.
 */
export function hashBroadcast(content: BroadcastContent): string {
  return crypto.createHash("sha256").update(JSON.stringify({ v: 1, audience: audienceKey(content.audience), subject: content.subject, body: content.body })).digest("hex");
}
