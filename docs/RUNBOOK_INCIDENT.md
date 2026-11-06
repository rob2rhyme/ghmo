# Incident response runbook

For the GHMO admin site. Keep a printed copy with the paper recovery keys. Times are targets, not promises.

**Who does what.** Two roles matter: a **super admin** (can revoke other admins' devices, replace the recovery key) and a **trustee** (holds a paper copy of the recovery key). Write names and phone numbers here when you adopt this runbook:

- Super admin(s): ______________________
- Trustee 1: ______________________  Trustee 2: ______________________
- Hosting / Firebase project owner: ______________________

## 0. First 15 minutes (any incident)

1. Write down what you saw, when, and who noticed. Don't delete anything.
2. Decide which case below fits. If unsure, treat it as case A. Email problems are cases H to J.
3. Tell the other admins by phone or in person, not in Admin Chat (it may be what's compromised).

## A. A device was lost, stolen or is suspected compromised

*The data on the device is protected by the admin's passkey or encryption passphrase, but assume the worst.*

1. The owner signs in on another device and goes to **Admin → Security**. If the lost device was a phone with their **authenticator app**, they sign in with a recovery code and move the app to a new phone (a super admin can **reset** it from Admin → Security; the owner is signed out everywhere and sets up a new app at their next email-link sign-in). If it held a passkey, they remove that passkey.
2. A **super admin** opens **Admin → Encryption**, ticks the lost device, and clicks **Revoke selected and rotate keys**. This stops it reading anything written from now on. It keeps whatever it already decrypted; that can't be undone.
3. Everything written **before** the rotation was readable by that device. If it held sensitive material (minutes drafts, documents), treat that as exposed and decide whether to tell the people concerned.
4. The owner sets up encryption on their new device; another admin approves it after comparing the 20-digit safety code **by phone or in person**.
5. Check the audit log (Firestore console: `organizations/ghmo/auditLogs`) for activity from the lost device after it went missing.

## B. An admin session may be stolen (cookie theft, shared computer left signed in)

1. Ask the admin to **Sign out** everywhere, then sign in again (passkey, or email link plus authenticator code). Sign-out ends the session on the server.
2. If you can't reach them: a super admin sets the admin's status to disabled (Firestore console → `organizations/ghmo/admins/{uid}` → `status: "disabled"`). Their access ends within about a minute.
3. A stolen session alone cannot read encrypted data (it has no device keys) and cannot replace the recovery key (that needs the admin's unlocked device). Check the audit log for what it did anyway.

## C. An admin left, or must lose access

1. Disable them (case B step 2).
2. A super admin revokes **all** of their devices and rotates keys (case A step 2).
3. Remove their passkeys and reset their authenticator app (Admin → Security, super admin). Rotate any shared secrets they knew.

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

## H. A broadcast email went out wrong (wrong text, wrong people, or sent by mistake)

*Email can't be recalled. The aim is to stop the rest and correct it quickly.*

1. **Stop it now.** If it is still sending, open it in **Admin → Broadcasts** and press **Pause**, then **Cancel broadcast**. Every remaining chunk stops. If you can't reach the page, a project owner sets `FEATURE_BROADCASTS` to anything but `true` in Vercel and redeploys: nothing more is sent from any broadcast.
2. See who got it: the broadcast page shows how many were sent; the Firestore console lists them under `organizations/ghmo/broadcasts/{id}/deliveries` (state `sent`). Rows hold member ids, not addresses; look the ids up under `members`.
3. Decide with another admin whether to send a short correction. It goes through the normal path (draft, a second admin approves, send). Don't reply-all from a personal mailbox.
4. If private information went to the wrong people, treat it as a data incident: tell those affected, and note it under *After any incident*.
5. Check the audit log for who started the broadcast and who approved it (`broadcast_sending_started`, `broadcast_approved`), and why the second-admin check didn't catch it.

## I. Spam complaints or bounces suddenly rise, or Resend warns the account

1. **Pause sending:** cancel any broadcast that is sending, and set `FEATURE_BROADCASTS` off if needed.
2. In the Resend dashboard, check the complaint and bounce rates and any notice on the account. A complaint rate above roughly 0.1% or many hard bounces risks the whole domain's email, including admin sign-in links.
3. Complaints and hard bounces are already suppressed automatically (the webhook opts out complainers and marks bounced addresses). Check **Admin → Members** (filters *Opted out* and *Bounced*) to confirm the webhook is working; if counts aren't changing, check `RESEND_WEBHOOK_SECRET` and the webhook's status in Resend.
4. Look for the cause: an old or bought list, an import without real consent, or a message that looked like spam. Remove members without real consent (disable them) before sending again.
5. Restart with a small send to members you know want the emails.

## J. The Resend API key or webhook secret may have leaked

1. In Resend, **revoke the API key** and create a new one; set it as `RESEND_API_KEY` in Vercel and redeploy. Sign-in emails stop until the new key is in place.
2. For the webhook, **roll the signing secret** in Resend and set the new `RESEND_WEBHOOK_SECRET`. A leaked webhook secret lets someone mark members as bounced or opted out (not read anything); check **Admin → Members** for unexpected opt-outs and bounces in the period and restore any that are wrong (only with the person's agreement).
3. Check Resend's logs for emails you didn't send.

## K. Something wrong was posted to a Messenger group chat

*The site does not connect to Messenger (decision D14); posts are pasted by hand and only recorded here.*

1. **Remove it in Messenger:** the person who posted it long-presses the message and chooses **Unsend → Unsend for everyone**. Messenger keeps a note that a message was removed.
2. Open the broadcast in **Admin → Broadcasts**: the *Posted to group chats* list shows who recorded posting it, where and when, and the audit log has `broadcast_posted_manually` with the text's fingerprint. If the wrong text was pasted (not the approved one), that is a process failure: only the **Copy text** button gives the approved text.
3. Correct it through the normal path: a new draft, a second admin approves, copy, post, record.
4. If private information was posted, treat it as a data incident (see *After any incident*).

## L. A caller's phone or laptop is lost, or a caller leaves the board

*Their device can decrypt the contacts of the people assigned to them while it is unlocked (plan §4.5).*

1. Follow case **A** (revoke the device, rotate keys) or **C** (admin leaves). A revoked device cannot read anything new.
2. A super admin opens **Admin → Calling Tree**, unticks that caller, presses **Plan assignments** and saves: only that caller's people move to the others.
3. Open campaigns keep the old caller's rows (they were copied in when the campaign opened). Close such a campaign and open a new one for the same event from the updated tree; the closed one keeps its call log.
4. If the device may be in someone else's hands unlocked, consider telling the people on that caller's list that their number may have been seen.
5. If the caller had push notifications on that device, turn them off too (case Q step 3).

## M. A member asks for their number to be removed, or not to be called

1. **Not to be called:** **Admin → Members**, press **They asked not to be called**. They disappear from every caller's list at once, are refused in open campaigns, and drop out of the calling tree at the next plan.
2. **Remove the number entirely:** also press **Edit contact**, clear every field and save. The encrypted contact is deleted from the member record. Older Firestore backups may still hold the ciphertext until they expire.
3. The audit log records both actions with the admin's name; it never held the number.

## N. A task reminder went to the wrong person, or someone complains about it

1. **Stop further reminders:** nobody is emailed again about the same event for 24 hours, so a wrong send cannot repeat by itself. To stop it for good, correct the task under **Admin → Events → the event → Tasks** (who it is given to, or the group and its lead), or remove the task.
2. **Someone does not want these emails:** open **Admin → Members** and press **They asked to stop** for them (or ask them to use the unsubscribe link in the email). They are never reminded or broadcast to again.
3. **Who got it:** the audit log shows who sent reminders for which event and how many; the reminder records (Firestore `eventTaskReminders`) show who was emailed and when. Reminders list only a person's own task titles and due dates, never notes or other people's names.
4. **If many complain or the provider warns:** follow case I (spam complaints), and switch sending off with `FEATURE_BROADCASTS=false`, which also stops reminders.
5. **The daily digest emailed people it should not have:** under **Admin → Events**, press **Switch off** on the Daily overdue digest card (any super admin), then fix the tasks and who they are given to. Removing `CRON_SECRET` in Vercel also stops the schedule from calling the site at all.

## O. A member asks what is held about them, or asks to have it removed

This is for a person's profile (plan §17). It is not legal advice: if you are unsure what you must share or delete, ask the board or the attorney first.

1. **Check who is asking.** Call them back on a number you already have, or ask in person. A super admin handles the request.
2. **What is held.** Open **Admin → Members → Profile** for them. The page shows the member since date, city and state; the family list; every note (with who wrote it and when); and the calls made to them with their outcomes and any ratings. Also held, but not on the profile: their name, email and consent records on the member record, and activity-log entries that name what changed. Phone numbers, family, notes and ratings are encrypted and readable only on an admin's unlocked device. Notes are other admins' words about them, so decide with the board what to share, and share the facts held rather than other admins' opinions unless you are required to.
3. **If they only want contact to stop:** press **They asked to stop** (email) and **They asked not to be called** (calls), or **Disable** them. This is case M for numbers.
4. **If they want the information removed, in the app (super admin):** clear **Member since**, **City** and **State** on the profile; **Remove** each family member; **Edit contact** and clear every field (case M); **Delete** each note; **Clear rating** on each rated call; then **Disable** the member.
5. **What stays after step 4, and why:** the member record itself (name, email and the consent history, which proves they were asked), the call history rows (when a call was made and its outcome, with the member's id), and activity-log entries. The app has no button to delete a member.
6. **If they require full deletion and the board agrees:** a super admin with Firebase console access deletes that member's document under `organizations/ghmo/members` **together with its `notes` collection**. Leave the call records alone: they hold only the member's id, so once the member document is gone they cannot be tied to a person, and deleting them would make a campaign's stored counts disagree with its rows. If they were a group's lead, choose another lead first. Then open **Calling tree** and save, which drops their assignment.
7. **Record it.** Because a console deletion is not in the activity log, write a line in Plans & Issues (the date, who asked, what was removed, who did it). Backups and exports made earlier still hold the old data, as ciphertext for everything encrypted, until they expire; delete old backups you no longer need.
8. **Tell them what was done**, and what could not be removed and why. Aim to answer within 30 days.

## P. An exported member file was lost, shared too widely or left somewhere it should not be

This is for a file made with **Admin → Members → Export list** (plan §19). The file is a plain spreadsheet: anyone who has it can read it.

1. **Find out what it holds.** Open the activity log and look for "downloaded the member list": it shows who, when, how many people and whether phone numbers were included. It never shows the people themselves.
2. **Get it back or deleted.** Ask the person who exported it where the file went (their downloads folder, email, a chat, a shared drive, a phone) and have every copy deleted, including cloud sync copies and email attachments. Ask whoever received it to delete it and tell you they did.
3. **If it had phone numbers, or it reached someone it should not have:** treat it as a lost list of private details. Tell the board the same day. People on it have not been told that anything was wrong with the app, but their numbers may be known, so decide together whether to tell them (the list has the names and the dates).
4. **Close the gap.** If the person should not be exporting, a super admin disables their admin access (case B step 2). If a device was lost, follow case L. Agree who may keep exported files and for how long, and write it down.
5. **Record it** in Plans & Issues: the date, which download, what happened, what was done.

## Q. A push notification went to the wrong person, arrived too often, or a lost device still gets them

*Push notifications say only that something happened and never what (plan §18), so a wrong or extra alert shows nobody anything private. The aim is to stop it and find the cause.*

1. **Someone who should not get them:** a push goes only to an **active admin** on a device where they turned it on. If that person should not be an admin, a super admin disables their admin account (case B step 2): a disabled admin gets no push, even from a device that is still switched on. If they should be an admin but not get alerts, they turn push off for the device under **Admin → Security**.
2. **Too many alerts:** each person gets at most one push of each kind a minute, and a newer one replaces the old one. If someone still gets too many, ask them to untick the kinds they do not want under **Admin → Security → Your devices**. If it is one kind across everyone (for example Plans & Issues in a busy week), the board can agree to switch that kind off on their devices; there is no site-wide switch other than step 5.
3. **A lost, sold or stolen phone still gets alerts:** a push on a locked phone shows only the fixed words, so no content leaks. Still turn it off: sign in on another device, open **Admin → Security → Your devices** and press **Turn off** on the lost one. Then follow case **A** (revoke the device and rotate keys) if the phone could open the admin area. An admin cannot see or remove someone else's devices, so ask the owner to do it, or disable their admin account (step 1) until they have.
4. **"It showed something it should not have":** a push contains only a fixed title and one fixed line. If you ever see a name, a message or a title in one, treat it as a bug: turn off push (step 5), keep a screenshot, and tell whoever manages the website.
5. **Stop all pushes at once:** in Vercel, remove `VAPID_PRIVATE_KEY` (or any of the three `VAPID_*` variables) from the Production environment variables and redeploy. With a key missing, the site sends nothing, and the Security card says push is not set up. Emails are not affected. To bring push back, put the same keys back; devices stay switched on.
6. **A push key may have leaked:** generate a new pair (`npx web-push generate-vapid-keys`), replace all three variables and redeploy. Every device must then be switched on again (old subscriptions stop working), so tell the admins to press **Turn off** then **Turn on** under **Admin → Security**.
7. **A device that never receives anything:** its record says "No alert has been sent to it yet". If a push service reports the device as gone, the site deletes it, and the admin turns it on again. Notifications also stop if the browser's site data was cleared; turn it on again.
8. **Record it** in Plans & Issues: the date, what happened and what was changed.

## After any incident

- Write down what happened, what you did and what you'll change. Keep it with this runbook.
- Run the **key-rotation drill** (`docs/KEY_ROTATION_DRILL.md`) if the incident involved keys, and test the recovery key.
- Tell affected people if their private information may have been exposed.
