# Incident response runbook

For the GHMO admin site. Keep a printed copy with the paper recovery keys. Times are targets, not promises.

**Who does what.** Two roles matter: a **super admin** (can revoke other admins' devices, replace the recovery key) and a **trustee** (holds a paper copy of the recovery key). Write names and phone numbers here when you adopt this runbook:

- Super admin(s): ______________________
- Trustee 1: ______________________  Trustee 2: ______________________
- Hosting / Firebase project owner: ______________________

## 0. First 15 minutes (any incident)

1. Write down what you saw, when, and who noticed. Don't delete anything.
2. Decide which case below fits. If unsure, treat it as case A.
3. Tell the other admins by phone or in person, not in Admin Chat (it may be what's compromised).

## A. A device was lost, stolen or is suspected compromised

*The data on the device is protected by the admin's passkey, but assume the worst.*

1. The owner signs in on another device and goes to **Admin → Security** and removes the passkey for the lost device.
2. A **super admin** opens **Admin → Encryption**, ticks the lost device, and clicks **Revoke selected and rotate keys**. This stops it reading anything written from now on. It keeps whatever it already decrypted; that can't be undone.
3. Everything written **before** the rotation was readable by that device. If it held sensitive material (minutes drafts, documents), treat that as exposed and decide whether to tell the people concerned.
4. The owner sets up encryption on their new device; another admin approves it after comparing the 20-digit safety code **by phone or in person**.
5. Check the audit log (Firestore console: `organizations/ghmo/auditLogs`) for activity from the lost device after it went missing.

## B. An admin session may be stolen (cookie theft, shared computer left signed in)

1. Ask the admin to **Sign out** everywhere, then sign in again with their passkey. Sign-out ends the session on the server.
2. If you can't reach them: a super admin sets the admin's status to disabled (Firestore console → `organizations/ghmo/admins/{uid}` → `status: "disabled"`). Their access ends within about a minute.
3. A stolen session alone cannot read encrypted data (it has no device keys) and cannot replace the recovery key (that needs the admin's unlocked device). Check the audit log for what it did anyway.

## C. An admin left, or must lose access

1. Disable them (case B step 2).
2. A super admin revokes **all** of their devices and rotates keys (case A step 2).
3. Remove their passkeys. Rotate any shared secrets they knew.

## D. Paper recovery key lost or exposed

1. Do not panic: the key only matters if every admin device is lost, or if someone with the paper can also reach the database.
2. If it was **exposed** (someone else may have seen it): a super admin goes to **Admin → Encryption → Replace recovery key** immediately, with both trustees present to take new paper copies, and then **Rotate keys now**. Destroy all old copies.
3. If it was only **lost**: replace it at the next convenient time with both trustees present.

## E. The database or hosting account may have been accessed (Google account compromise, leaked service-account key)

1. In the Firebase / Google Cloud console: rotate the service-account key (`FIREBASE_ADMIN_PRIVATE_KEY`), then redeploy. Remove unknown members from the project.
2. Rotate `CERTIFICATE_SIGNING_KEY_BASE64` only if it leaked (this invalidates existing QR codes, so decide deliberately), and `DOCGEN_SIGNATURE_ENC_KEY_BASE64` (move the old value into the *PREVIOUS* variable).
3. Remember what the attacker could and couldn't read: encrypted records (chat, threads, draft minutes, documents, signatures) are ciphertext; **approved minutes, member lists, events, donation records, audit logs and metadata are not encrypted**. Backups made before encryption was turned on contain plaintext.
4. An attacker with database write access could have tampered with ciphertext, key records or the device list. After a database compromise, do a full device check: compare safety codes of every listed device with its owner, revoke any you can't account for, and rotate keys.
5. Review `firestore.rules` is still deployed as in the repository.
6. If the Encryption page shows **"The device list failed its integrity check"**, a browser found the database disagreeing with the signed device log (an unlisted device, swapped keys, a missing or changed key copy, or a rewritten log). Nothing is unlocked or written from that browser. Tell the other admins, compare device safety codes and the workspace fingerprint by phone, and treat it as a database compromise (steps 1–4). Do not approve new devices until it is understood.

## F. A forged or doubtful certificate

1. Open its QR code or `/verify/{code}`. "No matching certificate" means we never issued it (or the record was altered).
2. If we issued it but it should not stand: set the record's `status` to `revoked` in `certificates/{code}` (Firestore console). The verify page then says so.

## G. Wrongly published minutes

1. Open the minutes in **Admin → Meeting Minutes** and **Return to draft** with a reason (at least 10 characters). That removes them from the public archive and is audited.

## After any incident

- Write down what happened, what you did and what you'll change. Keep it with this runbook.
- Run the **key-rotation drill** (`docs/KEY_ROTATION_DRILL.md`) if the incident involved keys, and test the recovery key.
- Tell affected people if their private information may have been exposed.
