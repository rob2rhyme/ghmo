import { formatPhone, type MemberCallState, type MemberContact, type MemberEmailState } from "./members";

/**
 * The member list as a spreadsheet file. Pure: nothing here reads or writes anything.
 *
 * What goes in: the plain facts on the list (name, email, status, member since, city and state, groups, officer titles,
 * and whether they may be emailed or called) and, only when the person exporting asks and this device is unlocked, the
 * phone numbers, language and household from the encrypted contact. What never goes in: notes, family members, call
 * history or ratings. Those stay in the app, where they stay encrypted and are logged when read.
 */

export const EMAIL_STATE_TEXT: Record<MemberEmailState, string> = {
  ready: "Can be emailed",
  no_consent: "No consent recorded",
  opted_out: "Opted out",
  bounced: "Address bounced",
  no_email: "No email",
  inactive: "Turned off"
};

export const CALL_STATE_TEXT: Record<MemberCallState, string> = {
  ready: "Can be called",
  no_phone: "No phone",
  no_consent: "No call consent",
  opted_out: "Asked not to be called",
  inactive: "Turned off"
};

export type ExportMember = {
  name: string;
  email: string;
  status: "active" | "disabled";
  memberSince: string | null;
  city: string | null;
  state: string | null;
  groups: string[];
  positions: string[];
  emailState: MemberEmailState;
  callState: MemberCallState;
  /** The decrypted contact, when this device could open it. Used only when phones are included. */
  contact: Pick<MemberContact, "phone" | "altPhone" | "language" | "household"> | null;
};

const BASE_COLUMNS = ["Name", "Email"];
const PHONE_COLUMNS = ["Phone", "Alternate phone", "Language", "Household"];
const FACT_COLUMNS = ["Status", "Member since", "City", "State", "Groups", "Officer positions", "Email status", "Call status"];

/**
 * Spreadsheet programs run a cell that starts with = + - @ as a formula, so a name such as "=HYPERLINK(...)" could attack
 * whoever opens the file. A leading apostrophe makes it plain text. A phone number is only digits, spaces and
 * punctuation and can't run anything, so it is left as it is (a "+44..." number stays usable).
 */
export function csvCell(value: string, options: { phone?: boolean } = {}): string {
  let text = value;
  const plainNumber = options.phone && /^\+?[\d\s().-]+$/.test(text);
  if (!plainNumber && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function exportColumns(includePhones: boolean): string[] {
  return [...BASE_COLUMNS, ...(includePhones ? PHONE_COLUMNS : []), ...FACT_COLUMNS];
}

const phoneText = (value: string | undefined) => (value ? formatPhone(value) : "");

/**
 * One row per member. The first columns are the ones the import reads (`Name`, `Email`, `Phone`), so a file made here can
 * be imported again. A byte order mark at the start lets Excel read Nepali and other non-English names correctly.
 */
export function membersCsv(members: ExportMember[], options: { includePhones: boolean }): string {
  const header = exportColumns(options.includePhones);
  const lines = members.map(member => {
    const cells: { text: string; phone?: boolean }[] = [{ text: member.name }, { text: member.email }];
    if (options.includePhones) {
      cells.push(
        { text: phoneText(member.contact?.phone), phone: true },
        { text: phoneText(member.contact?.altPhone), phone: true },
        { text: member.contact?.language ?? "" },
        { text: member.contact?.household ?? "" }
      );
    }
    cells.push(
      { text: member.status === "active" ? "Active" : "Turned off" },
      { text: member.memberSince ?? "" },
      { text: member.city ?? "" },
      { text: member.state ?? "" },
      { text: member.groups.join("; ") },
      { text: member.positions.join("; ") },
      { text: EMAIL_STATE_TEXT[member.emailState] },
      { text: CALL_STATE_TEXT[member.callState] }
    );
    return cells.map(cell => csvCell(cell.text, { phone: cell.phone })).join(",");
  });
  return `﻿${[header.join(","), ...lines].join("\r\n")}\r\n`;
}

/** The file name, for example ghmo-members-2026-11-06.csv. */
export const exportFileName = (day: string) => `ghmo-members-${day}.csv`;
