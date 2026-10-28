export type MemberStatus = "active" | "disabled";

export function isMemberStatus(value?: string): value is MemberStatus {
  return value === "active" || value === "disabled";
}

export function normalizeMemberEmail(value?: string) {
  if (!value) return "";
  const trimmed = value.trim();
  return trimmed ? trimmed.toLowerCase() : "";
}

export function normalizeMemberName(value?: string | null) {
  if (value === undefined || value === null) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function sanitizeMemberRoles(value?: unknown) {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const roles: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    if (seen.has(trimmed)) continue;
    seen.add(trimmed);
    roles.push(trimmed);
  }
  return roles;
}

/** How a member's agreement to receive email was obtained (plan §10.2, D7). */
export const EMAIL_CONSENT_SOURCES = ["admin_on_request", "signed_up", "imported"] as const;
export type EmailConsentSource = (typeof EMAIL_CONSENT_SOURCES)[number];

export function isEmailConsentSource(value: unknown): value is EmailConsentSource {
  return typeof value === "string" && (EMAIL_CONSENT_SOURCES as readonly string[]).includes(value);
}

export const EMAIL_CONSENT_LABELS: Record<EmailConsentSource, string> = {
  admin_on_request: "Asked to be added",
  signed_up: "Signed up themselves",
  imported: "Imported with consent"
};

export type MemberEmailState = "ready" | "no_consent" | "opted_out" | "bounced" | "inactive";

type EmailFields = {
  status?: string;
  emailLower?: string;
  emailConsent?: { source?: unknown } | null;
  emailOptOutAt?: unknown;
  emailBounced?: unknown;
};

/**
 * Whether a member may receive broadcast email. Order matters: the first reason that applies is the one
 * shown to admins. Only "ready" members are ever emailed (plan §10.3).
 */
export function memberEmailState(member: EmailFields): MemberEmailState {
  if (member.status !== "active" || !member.emailLower?.includes("@")) return "inactive";
  if (member.emailOptOutAt) return "opted_out";
  if (member.emailBounced === true) return "bounced";
  if (!member.emailConsent || !isEmailConsentSource(member.emailConsent.source)) return "no_consent";
  return "ready";
}

export const MAX_IMPORT_ROWS = 500;

export type ParsedMemberRow = { email: string; name?: string };
export type MemberCsvResult = {
  rows: ParsedMemberRow[];
  /** Human-readable problems, one per skipped line (1-based line numbers). */
  problems: string[];
  /** True when the file had more rows than MAX_IMPORT_ROWS; the extra rows are ignored. */
  truncated: boolean;
};

const EMAIL_PATTERN = /^[^\s@,;"]+@[^\s@,;"]+\.[^\s@,;"]+$/;

/** Splits one CSV line, honouring double-quoted fields and "" escapes. */
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (quoted) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      out.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  out.push(current);
  return out.map(cell => cell.trim());
}

/**
 * Reads a pasted or uploaded member list. Accepts a header row with `email` (and optionally `name`)
 * columns, or plain "email" / "name,email" / "email,name" lines without a header. Duplicate addresses
 * inside the file are dropped. Nothing here touches the database.
 */
export function parseMemberCsv(text: string): MemberCsvResult {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/);
  const rows: ParsedMemberRow[] = [];
  const problems: string[] = [];
  const seen = new Set<string>();
  let truncated = false;
  let emailCol = -1;
  let nameCol = -1;
  let headerChecked = false;

  lines.forEach((raw, index) => {
    if (!raw.trim()) return;
    const cells = splitCsvLine(raw);
    const lineNumber = index + 1;

    if (!headerChecked) {
      headerChecked = true;
      const lower = cells.map(cell => cell.toLowerCase());
      const headerEmail = lower.findIndex(cell => cell === "email" || cell === "e-mail" || cell === "email address");
      if (headerEmail >= 0) {
        emailCol = headerEmail;
        nameCol = lower.findIndex(cell => cell === "name" || cell === "full name");
        return;
      }
    }

    let email = "";
    let name: string | undefined;
    if (emailCol >= 0) {
      email = cells[emailCol] ?? "";
      name = nameCol >= 0 ? cells[nameCol] : undefined;
    } else {
      const emailIndex = cells.findIndex(cell => EMAIL_PATTERN.test(cell));
      email = emailIndex >= 0 ? cells[emailIndex] : (cells[0] ?? "");
      name = cells.find((cell, i) => i !== emailIndex && cell) || undefined;
    }

    const emailLower = normalizeMemberEmail(email);
    if (!EMAIL_PATTERN.test(emailLower) || emailLower.length > 320) {
      problems.push(`Line ${lineNumber}: "${email.slice(0, 40)}" is not a valid email address.`);
      return;
    }
    if (seen.has(emailLower)) {
      problems.push(`Line ${lineNumber}: ${emailLower} appears more than once; kept the first.`);
      return;
    }
    if (rows.length >= MAX_IMPORT_ROWS) {
      truncated = true;
      return;
    }
    seen.add(emailLower);
    const cleanName = normalizeMemberName(name)?.slice(0, 120);
    rows.push(cleanName ? { email: emailLower, name: cleanName } : { email: emailLower });
  });

  return { rows, problems, truncated };
}
