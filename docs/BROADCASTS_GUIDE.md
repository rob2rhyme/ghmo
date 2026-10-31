# Sending an email to members (broadcasts)

A short guide for admins. The technical design is in `docs/PROJECT_PLAN.md` §10.

## Before the first time (owner, once)

These are in `docs/GO_LIVE_CHECKLIST.md`. In short: a verified sending domain in Resend; `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL`; the bounce and complaint webhook (`RESEND_WEBHOOK_SECRET`); the footer name and postal address (`BROADCAST_ORG_NAME`, `BROADCAST_POSTAL_ADDRESS`); then `FEATURE_BROADCASTS=true` and `BROADCAST_DAILY_LIMIT` set to your Resend plan's daily allowance.

## 1. Keep the member list honest (Admin → Members)

- Only people who **asked** to get email from us can be emailed. Tick "This person asked to receive email from us" when you add someone, or press **Record consent** when they ask later.
- Importing a list: only tick "These people agreed to receive email from us" if that is true for everyone on it. It is recorded with your name.
- When someone asks to stop, press **They asked to stop**. If they ask to come back, **They asked to be added back**.
- The page shows who can be emailed. People who unsubscribed by link, marked an email as spam, or whose address bounced are left out automatically.

## 1b. Phone numbers (Admin → Members)

- Numbers are end-to-end encrypted in your browser before they are saved, so you need **encryption turned on and this device unlocked** to add, see or change them. Without that, the page still works for email.
- Add a number when you add a member, or press **Add phone** / **Edit contact** on someone in the list (second number, preferred language, household and notes go in the same place).
- Tick "This person gave their number for community calls" only if they did. Importing a list with a `phone` column asks you to confirm the same thing for everyone on it.
- Numbers show masked (last four digits) until you press **Show**; **Call** dials from your phone. **They asked not to be called** records a call opt-out.
- The number never appears in the audit log, in exports or in email.

## 1c. Who calls whom (Admin → Calling Tree, Admin → My Calls)

- A super admin ticks the board members who make calls and presses **Plan assignments**. Everyone who can be called (number on file, call consent, no opt-out) is split as evenly as possible, people who share a household go to the same caller, and anyone already assigned stays put. The preview lists every change; **Save calling tree** stores it.
- To move one person by hand, pick another caller in the dropdown next to their name and save.
- Each caller opens **My Calls** on their phone: their people, numbers masked until **Show**, and **Call** to dial. Someone who asks not to be called disappears from the list straight away.

## 1d. Calling everyone about an announcement (Admin → Call Campaigns, Admin → My Calls)

- Open a campaign: pick the event (or type a title), a date the calls should be done by, and what to say. The script is encrypted; callers read it on their own devices. Everyone on the calling tree who can be called is copied in with their caller.
- Each caller opens **My Calls**: the script, their people, **Call** to dial, then **Log call**: what happened (reached, voicemail, no answer, wrong number, call back, declined), whether they are coming, and an encrypted note. Every logged call is in the audit trail with your name, the person and the outcome, never the number or the note.
- The board opens the campaign page: reached and attempted totals, progress per caller, who is still not reached, the full call log, **Remind callers** (an email to those with people left), **Export CSV** (names and outcomes only) and **Close campaign** when done. A closed campaign takes no more calls.

## 2. Write it (Admin → Broadcasts)

- Start a draft with a subject and plain-text message. Nothing is sent by saving.
- Check **How it will look**: every email ends with a footer saying why they got it, a personal unsubscribe link, and our name and postal address.
- Press **Send a test to me** and read it in your own inbox.
- Press **Submit for approval**.

## 3. A second admin approves

- Another admin opens the broadcast, reads it, and presses **Approve this message**. Whoever wrote or submitted it can't approve it.
- If anyone changes the text after that, it goes back to draft and needs approval again. To change it yourself, use **Withdraw to edit**.

## 4. Send it

- On the approved broadcast, press **Send to N members**, then **Yes, send it now**.
- It goes out in small batches with a progress bar. Keep the page open. If you close it, sending pauses; you or another admin can press **Resume sending** later. Nobody gets it twice.
- If the day's limit is reached, the page says when it can continue (after midnight UTC, which is evening in Pennsylvania).
- **Pause** stops after the current batch. **Cancel broadcast** stops it for good.
- If some deliveries failed, press **Retry N failed**.

## If something goes wrong

Wrong text or wrong people, many complaints, or a leaked key: see `docs/RUNBOOK_INCIDENT.md`, cases H, I and J.
