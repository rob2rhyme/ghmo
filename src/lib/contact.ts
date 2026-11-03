import "server-only";

/**
 * GHMO's public contact address, from CONTACT_EMAIL. Pages show a "Contact" line and turn "ask a board
 * member" into an email link only when it is set; until then they say nothing about contact.
 */
export function getContactEmail(value = process.env.CONTACT_EMAIL): string | null {
  const raw = value?.trim();
  return raw && /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(raw) ? raw : null;
}
