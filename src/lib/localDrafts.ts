/** Encrypted autosaved drafts live in localStorage under this prefix (see useEncryptedDraft). */
export const DRAFT_PREFIX = "ghmo-draft:";

/** Removes every saved draft from this browser, e.g. when signing out or forgetting the device. */
export function clearLocalDrafts() {
  try {
    for (const key of Object.keys(window.localStorage)) {
      if (key.startsWith(DRAFT_PREFIX)) window.localStorage.removeItem(key);
    }
  } catch {
    // Storage blocked: nothing was saved.
  }
}
