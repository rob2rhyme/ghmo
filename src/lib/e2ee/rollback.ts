/**
 * What a device should make of the server's encryption state before verifying the signed device log.
 * Encryption can't be switched off from the app, and the log only ever grows. So once this device has
 * pinned the log (seen it, with encryption on), "encryption is off" or an empty log means someone changed
 * the database directly (threat T4): fail closed instead of writing in plaintext or trusting the server.
 */
export type RollbackVerdict = { kind: "off" } | { kind: "unsealed" } | { kind: "verify" } | { kind: "failed"; reason: string };

export const ROLLED_BACK_OFF =
  "The server says encryption is off, but this device has seen it on. Encryption can't be switched off, so the database was changed.";
export const ROLLED_BACK_EMPTY = "The device list is missing, but this device has seen it before. The database was changed.";

export function rollbackVerdict({ enabled, logEntries, pinned }: { enabled: boolean; logEntries: number | null; pinned: boolean }): RollbackVerdict {
  if (!enabled) return pinned ? { kind: "failed", reason: ROLLED_BACK_OFF } : { kind: "off" };
  if (logEntries === 0) return pinned ? { kind: "failed", reason: ROLLED_BACK_EMPTY } : { kind: "unsealed" };
  return { kind: "verify" };
}
