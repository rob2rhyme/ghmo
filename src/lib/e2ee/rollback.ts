/**
 * What a device should make of the server's encryption state before verifying the signed device log.
 * Encryption can't be switched off from the app, and the log only ever grows. So once this device has
 * pinned the log (seen it, with encryption on), "encryption is off" or an empty log means someone changed
 * the database directly (threat T4): fail closed instead of writing in plaintext or trusting the server.
 */
export type RollbackVerdict = { kind: "off" } | { kind: "unsealed" } | { kind: "verify" } | { kind: "failed"; reason: string };

export const ROLLED_BACK_OFF =
  "The server now says encryption is off, but this device saw it turned on before. Encryption can't be turned off in the app, so the stored settings were changed outside it.";
export const ROLLED_BACK_EMPTY = "The signed device list is now missing, but this device saw it before. It was removed outside the app.";

/**
 * `pinned`: this browser has pinned the signed device log. `sawEnabled`: it has seen encryption on (also true when
 * pinned), which is enough to refuse "encryption off" even on a workspace whose list was never sealed.
 */
export function rollbackVerdict({
  enabled,
  logEntries,
  pinned,
  sawEnabled = pinned
}: {
  enabled: boolean;
  logEntries: number | null;
  pinned: boolean;
  sawEnabled?: boolean;
}): RollbackVerdict {
  if (!enabled) return pinned || sawEnabled ? { kind: "failed", reason: ROLLED_BACK_OFF } : { kind: "off" };
  if (logEntries === 0) return pinned ? { kind: "failed", reason: ROLLED_BACK_EMPTY } : { kind: "unsealed" };
  return { kind: "verify" };
}
