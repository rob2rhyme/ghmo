import type { MeetingMinutesRecord } from "./minutes";

/**
 * Spreadsheet programs run cells that start with = + - @ as formulas, so a name like "=HYPERLINK(...)"
 * in minutes could attack whoever opens the export. A leading apostrophe makes the cell plain text.
 */
function cell(value: string | number): string {
  let text = String(value);
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

const HEADER = ["Date", "Event", "Meeting type", "Minutes status", "Name", "Attendance"];

/** One row per person per meeting. */
export function attendanceCsv(records: MeetingMinutesRecord[]): string {
  const rows: (string | number)[][] = [HEADER];
  const sorted = [...records].sort((a, b) => (a.eventDate ?? 0) - (b.eventDate ?? 0));
  for (const record of sorted) {
    const date = record.eventDate ? new Date(record.eventDate).toISOString().slice(0, 10) : "";
    const groups: [string, string[] | undefined][] = [
      ["Present", record.attendance?.present],
      ["Absent", record.attendance?.absent],
      ["Guest", record.attendance?.guests]
    ];
    for (const [label, names] of groups) {
      for (const name of names ?? []) rows.push([date, record.eventTitle, record.meetingType, record.status, name, label]);
    }
  }
  return `${rows.map(row => row.map(cell).join(",")).join("\r\n")}\r\n`;
}
