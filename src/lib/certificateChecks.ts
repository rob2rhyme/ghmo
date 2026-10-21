export type SessionInfo = { certificateId?: string | null; role?: string | null };

/**
 * Before a certificate is issued, every signature must have been collected for this very
 * certificate and for the role it is placed under, and one signature can't fill two roles.
 */
export function checkSigningSessions(params: {
  certificateId: string | undefined;
  primarySessionId: string;
  signatures: Record<string, string | undefined> | undefined;
  sessions: Record<string, SessionInfo>;
}): string | null {
  const { certificateId, primarySessionId, signatures, sessions } = params;
  if (!certificateId?.trim()) return "A certificate number is required before issuing.";
  const entries = Object.entries(signatures ?? {}).filter((entry): entry is [string, string] => Boolean(entry[1]));
  if (!entries.some(([, id]) => id === primarySessionId)) return "The signing session isn't part of this certificate.";
  if (new Set(entries.map(([, id]) => id)).size !== entries.length) return "One signature can't be used for two roles.";
  for (const [role, id] of entries) {
    const session = sessions[id];
    if (!session) return `Session not found (${id})`;
    if (session.role !== role) return `A signature was collected for a different role than ${role}.`;
    if (session.certificateId !== certificateId) return "A signature was collected for a different certificate.";
  }
  return null;
}
