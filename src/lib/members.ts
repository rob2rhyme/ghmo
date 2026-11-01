import type { RecordLocation } from "./e2ee/envelope";

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

// ---- Phone numbers and call contact (plan §12, Phase 9-A) -----------------------------------------
//
// The number, language, household and notes of a member live in ONE end-to-end encrypted envelope
// (`contact`) on the member document, so the server never sees a number (decision D12). Beside it the
// document keeps plaintext flags that list pages can filter on: `hasPhone`, `phoneConsent`, `callOptOutAt`.

export const MEMBERS_PATH = "organizations/ghmo/members";
/** Location of a member's contact envelope: bound to the member id, separate from any future envelope. */
export const memberContactLoc = (memberId: string): RecordLocation => ({ path: MEMBERS_PATH, docId: `${memberId}#contact` });

export type MemberContact = {
  /** E.164, for example +17175550100. */
  phone?: string;
  altPhone?: string;
  /** Free text, for example "Nepali" or "English". */
  language?: string;
  /** Free text that groups people who share one phone or one home, so one call covers them (9-B). */
  household?: string;
  notes?: string;
};

export const CONTACT_LIMITS = { language: 40, household: 80, notes: 1000 } as const;

/**
 * Turns what people type into E.164, or null when it is not a phone number. US numbers (10 digits, or 11
 * starting with 1) get +1; anything else must start with + and have 8 to 15 digits (ITU E.164).
 */
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return null;
  if (!hasPlus) {
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
    return null;
  }
  if (digits.length < 8 || digits.length > 15) return null;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

/** Display form: US numbers as (717) 555-0100, others as typed in E.164. */
export function formatPhone(e164: string): string {
  const match = /^\+1(\d{3})(\d{3})(\d{4})$/.exec(e164);
  return match ? `(${match[1]}) ${match[2]}-${match[3]}` : e164;
}

/** What a list shows until the admin taps "Show": only the last digits. */
export function maskPhone(e164: string): string {
  const digits = e164.replace(/\D/g, "");
  return `•••-•••-${digits.slice(-4)}`;
}

/** Normalizes a contact form; returns the clean contact and whether anything is in it. */
export function normalizeContact(input: Partial<Record<keyof MemberContact, string | null | undefined>>): { contact: MemberContact; hasPhone: boolean; problems: string[] } {
  const contact: MemberContact = {};
  const problems: string[] = [];
  for (const key of ["phone", "altPhone"] as const) {
    const raw = input[key];
    if (raw === undefined || raw === null || !raw.trim()) continue;
    const normalized = normalizePhone(raw);
    if (normalized) contact[key] = normalized;
    else problems.push(key === "phone" ? "The phone number is not recognised. Use 10 digits for US numbers, or +country code for others." : "The second number is not recognised.");
  }
  for (const key of ["language", "household", "notes"] as const) {
    const raw = input[key];
    if (raw === undefined || raw === null) continue;
    const trimmed = raw.trim();
    if (trimmed) contact[key] = trimmed.slice(0, CONTACT_LIMITS[key]);
  }
  return { contact, hasPhone: Boolean(contact.phone), problems };
}

export const PHONE_CONSENT_SOURCES = ["admin_on_request", "signed_up", "imported"] as const;
export type PhoneConsentSource = (typeof PHONE_CONSENT_SOURCES)[number];
export function isPhoneConsentSource(value: unknown): value is PhoneConsentSource {
  return typeof value === "string" && (PHONE_CONSENT_SOURCES as readonly string[]).includes(value);
}

export type MemberCallState = "ready" | "no_phone" | "no_consent" | "opted_out" | "inactive";

type CallFields = {
  status?: string;
  hasPhone?: unknown;
  phoneConsent?: { source?: unknown } | null;
  callOptOutAt?: unknown;
};

/** Whether a BOD caller may be given this member's number in a campaign (9-B/9-C). First reason wins. */
export function memberCallState(member: CallFields): MemberCallState {
  if (member.status !== "active") return "inactive";
  if (member.hasPhone !== true) return "no_phone";
  if (member.callOptOutAt) return "opted_out";
  if (!member.phoneConsent || !isPhoneConsentSource(member.phoneConsent.source)) return "no_consent";
  return "ready";
}

export const MAX_IMPORT_ROWS = 500;

export type ParsedMemberRow = { email: string; name?: string; phone?: string };
export type MemberCsvResult = {
  rows: ParsedMemberRow[];
  /** Human-readable problems, one per skipped line (1-based line numbers). */
  problems: string[];
  /** True when the file had more rows than MAX_IMPORT_ROWS; the extra rows are ignored. */
  truncated: boolean;
};

const EMAIL_PATTERN = /^[^\s@,;"]+@[^\s@,;"]+\.[^\s@,;"]+$/;
const PHONE_HEADERS = ["phone", "phone number", "mobile", "cell", "cellphone", "telephone", "tel"];
/** A headerless cell is taken as a phone when it is mostly digits with at least ten of them. */
const looksLikePhone = (cell: string) => /^[+\d][\d\s().-]{8,}$/.test(cell.trim()) && cell.replace(/\D/g, "").length >= 10;

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
  let phoneCol = -1;
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
        phoneCol = lower.findIndex(cell => PHONE_HEADERS.includes(cell));
        return;
      }
    }

    let email = "";
    let name: string | undefined;
    let phoneCell: string | undefined;
    if (emailCol >= 0) {
      email = cells[emailCol] ?? "";
      name = nameCol >= 0 ? cells[nameCol] : undefined;
      phoneCell = phoneCol >= 0 ? cells[phoneCol] : undefined;
    } else {
      const emailIndex = cells.findIndex(cell => EMAIL_PATTERN.test(cell));
      email = emailIndex >= 0 ? cells[emailIndex] : (cells[0] ?? "");
      const phoneIndex = cells.findIndex((cell, i) => i !== emailIndex && looksLikePhone(cell));
      phoneCell = phoneIndex >= 0 ? cells[phoneIndex] : undefined;
      name = cells.find((cell, i) => i !== emailIndex && i !== phoneIndex && cell) || undefined;
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
    const row: ParsedMemberRow = { email: emailLower };
    if (cleanName) row.name = cleanName;
    if (phoneCell?.trim()) {
      const phone = normalizePhone(phoneCell);
      if (phone) row.phone = phone;
      else problems.push(`Line ${lineNumber}: "${phoneCell.slice(0, 24)}" is not a phone number; ${emailLower} is imported without one.`);
    }
    rows.push(row);
  });

  return { rows, problems, truncated };
}

/** A Firestore-style id the browser chooses before encrypting a contact, because the envelope is bound to it. */
export function newMemberId(): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), byte => alphabet[byte % alphabet.length]).join("");
}
