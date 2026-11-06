# Key-rotation and recovery drill

Run this **once a year** and after any incident involving a device or the recovery key. It takes about 30 minutes with two admins and both trustees. Do it on the real site; it changes nothing permanent except moving to a new key generation ("epoch").

## Automated version

`npm run test:e2e:auth` runs `tests/e2e-auth/rotation-drill.spec.ts`: two admins, one device revoked, keys rotated, new data written under the new epoch, the revoked device locked out and not given the new key. Run it after any change to `src/lib/e2ee`. It does **not** replace the manual drill below, which checks people and paper.

## Manual drill

1. **Roster.** Open Admin → Encryption. Every device listed should belong to a person who can name it. Revoke any that nobody recognises.
2. **Recovery-key test.** Each trustee takes their paper copy and, in turn, uses **Test** in the *Recovery key* box. It must say "Recovery key works". Nothing is changed by the test. If a copy fails, replace the recovery key (both trustees present).
3. **Rotation.** A super admin clicks **Make new keys now**. Afterwards open Admin Chat on two devices and send a message from each. Both must read both.
4. **Revocation (use a spare device).** Set up encryption on a spare browser, get it approved, then revoke it and rotate. Confirm that the spare browser now shows "This device was revoked" and can't read new messages.
5. **Backups.** Confirm that Firestore backups/exports made **before** encryption was turned on are deleted (they contain plaintext), and that no other copies exist.
6. **Record it.** Date, who attended, what failed, what you fixed.

Pass = every step worked on the first try. Any failure is an incident: follow `docs/RUNBOOK_INCIDENT.md`.
