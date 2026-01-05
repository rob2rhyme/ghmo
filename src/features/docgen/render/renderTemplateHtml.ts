import { DocTemplate } from "../types";

const DATE_FORMATTER = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "long",
  day: "numeric"
});

export const LETTERHEAD_STYLES = `
  .ghmo-letter-headline {
    font-size: 1.8rem;
    font-weight: 700;
    letter-spacing: 0.01em;
    margin-bottom: 0.5rem;
  }
  .ghmo-letter-meta {
    font-size: 0.85rem;
    color: #475569;
    margin-bottom: 1.5rem;
  }
  .ghmo-letter-body {
    font-size: 1rem;
    line-height: 1.7;
    color: #0f172a;
  }
  .ghmo-letter-footer {
    margin-top: 2rem;
    font-size: 0.9rem;
    color: #475569;
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

export function formatDate(value?: string) {
  if (!value) return "";
  try {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return DATE_FORMATTER.format(date);
  } catch (error) {
    return value;
  }
}

export function renderTemplateHtml(template: DocTemplate, inputs: Record<string, string>) {
  return template.renderHtml(inputs);
}
