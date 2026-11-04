import { DocTemplate } from "../types";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric"
});
/** For typed calendar dates: the day is fixed at midnight UTC and read back in UTC, so no time zone can shift it. */
const CALENDAR_DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric",
  timeZone: "UTC"
});
const CALENDAR_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export const LETTERHEAD_STYLES = `
  * {
    box-sizing: border-box;
  }
  .ghmo-letter-headline {
    font-size: 1.8rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    margin-bottom: 0.5rem;
    color: #111;
  }
  .ghmo-letter-meta {
    font-size: 0.85rem;
    color: #334155;
    margin-bottom: 1.2rem;
  }
  .ghmo-letter-body {
    font-size: 1rem;
    line-height: 1.65;
    color: #111;
    background: transparent;
  }
  .ghmo-letter-body p {
    margin: 0 0 0.85rem;
  }
  .ghmo-letter-body p:last-child {
    margin-bottom: 0;
  }
  .ghmo-letter-footer {
    margin-top: 1.6rem;
    font-size: 0.9rem;
    color: #334155;
  }
  .ghmo-avoid-break {
    break-inside: avoid;
    page-break-inside: avoid;
  }
  @media print {
    @page {
      margin: 0.6in 0.7in 0.85in;
    }
    body {
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    .ghmo-letter-headline,
    .ghmo-letter-meta,
    .ghmo-letter-body,
    .ghmo-letter-footer {
      color: #111;
    }
    .ghmo-letter-body {
      line-height: 1.6;
    }
    p {
      orphans: 3;
      widows: 3;
    }
  }
`;

export function escapeHtml(value?: string) {
  if (!value) return "";
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A date for letter HTML. A typed date ("2026-11-04", what a date field holds) is a calendar day and prints as
 * that day everywhere: `new Date("2026-11-04")` is midnight UTC, which is still November 3 in Harrisburg.
 * A value with a time (ISO with "T") is a moment and prints as the local day. Anything that isn't a date is
 * shown as typed, escaped (it lands in HTML).
 */
export function formatDate(value?: string) {
  if (!value) return "";
  try {
    const calendar = CALENDAR_DATE.exec(value.trim());
    if (calendar) {
      const [, year, month, day] = calendar.map(Number);
      const utc = new Date(Date.UTC(year, month - 1, day));
      // Rejects impossible days such as 2026-02-31 instead of rolling them into March.
      if (utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day) {
        return CALENDAR_DATE_FORMATTER.format(utc);
      }
      return escapeHtml(value);
    }
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return escapeHtml(value);
    return DATE_FORMATTER.format(date);
  } catch {
    return escapeHtml(value);
  }
}

/** " on <date> at <time>" (either part may be empty). Letters put the place in its own sentence, so "at" never repeats. */
export function onDateAtTime(date: string, time: string) {
  return `${date ? ` on ${date}` : ""}${time ? ` at ${time}` : ""}`;
}

export function renderTemplateHtml(template: DocTemplate, inputs: Record<string, string>) {
  return template.renderHtml(inputs);
}
