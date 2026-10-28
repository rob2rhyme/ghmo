# Sending an email to members (broadcasts)

A short guide for admins. The technical design is in `docs/PROJECT_PLAN.md` §10.

## Before the first time (owner, once)

These are in `docs/GO_LIVE_CHECKLIST.md`. In short: a verified sending domain in Resend; `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL`; the bounce and complaint webhook (`RESEND_WEBHOOK_SECRET`); the footer name and postal address (`BROADCAST_ORG_NAME`, `BROADCAST_POSTAL_ADDRESS`); then `FEATURE_BROADCASTS=true` and `BROADCAST_DAILY_LIMIT` set to your Resend plan's daily allowance.

## 1. Keep the member list honest (Admin → Members)

- Only people who **asked** to get email from us can be emailed. Tick "This person asked to receive email from us" when you add someone, or press **Record consent** when they ask later.
- Importing a list: only tick "These people agreed to receive email from us" if that is true for everyone on it. It is recorded with your name.
- When someone asks to stop, press **They asked to stop**. If they ask to come back, **They asked to be added back**.
- The page shows who can be emailed. People who unsubscribed by link, marked an email as spam, or whose address bounced are left out automatically.

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
