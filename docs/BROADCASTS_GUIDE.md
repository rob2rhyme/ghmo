# Member guide: email, phone calls and the group chats (broadcasts)

A short guide for admins. The technical design is in `docs/PROJECT_PLAN.md` §10.

## Before the first time (owner, once)

These are in `docs/GO_LIVE_CHECKLIST.md`. In short: a verified sending domain in Resend; `RESEND_API_KEY` and `NOTIFY_FROM_EMAIL`; the bounce and complaint webhook (`RESEND_WEBHOOK_SECRET`); the footer name and postal address (`BROADCAST_ORG_NAME`, `BROADCAST_POSTAL_ADDRESS`); then `FEATURE_BROADCASTS=true` and `BROADCAST_DAILY_LIMIT` set to your Resend plan's daily allowance.

## 1. Keep the member list honest (Admin → Members)

- **Each row** has **Profile** and **⋯** (More actions). The actions for that person are in the ⋯ menu: **Record consent**, **They asked to stop**, call consent, **Edit contact**, **Edit name** (super admins), **Groups**, and **Turn off…** last. (Since 2026-11-06, plan §28.)
- **Long lists** show 50 people at a time: press **Show 50 more** at the bottom. Search, the filters and **Export list** always cover everyone.
- **Several people at once:** tick the box at the start of each row (or **Select all shown**). A bar appears with **Add to group…**, **Remove from group…**, **Turn on** and **Turn off…** (up to 200 at a time). Consent, opt-outs, contacts and names are always one person at a time, because consent is something each person tells you. Each bulk change is one line in the activity log with how many changed.
- Only people who **asked** to get email from us can be emailed. Tick "This person asked to receive email from us" when you add someone, or choose **Record consent** in their ⋯ menu when they ask later.
- Importing a list: only tick "These people agreed to receive email from us" if that is true for everyone on it. It is recorded with your name.
- When someone asks to stop, choose **They asked to stop** in their ⋯ menu. If they ask to come back, **They asked to be added back**.
- The page shows who can be emailed. People who unsubscribed by link, marked an email as spam, or whose address bounced are left out automatically.
- **Fixing a typo in a name (super admin):** choose **Edit name** in the person's ⋯ menu, correct it and save. Their email, phone number, consent and groups stay as they are, and the activity log keeps the old and new spelling. Someone without an email can't have an empty name. Other admins don't see the button.
- **Search box:** type part of a name or email to narrow the list. The **x** at the right end clears it (so does the Escape key). The same box in the group and task pickers works the same way.

## 1a. Turn on encryption and keep the recovery key safe (Admin → Encryption)

Phone numbers can only be saved once encryption is on, so this comes first. It is for **admins only**. Community members never set anything up, and the site never asks them to sign in.

**Who does what**
- **A super admin does all three steps once.** This turns encryption on for the whole site. It takes about 10 minutes, and the **two trustees** should be there, in person or on a call. Trustees are two trusted people, such as the president and the treasurer, who each keep a paper copy of the recovery key.
- **Every other admin who will read numbers does step 1 on their own phone or computer.** Then an admin who already has an approved device approves theirs.
- **An admin without an approved device** can still use the rest of the admin area. On the Members page their numbers show as "Phone number on file (unlock to view)".
- **Be careful whom you approve.** An approved device can read every member's number, not only the ones assigned to that caller.

**The three steps (Admin → Encryption)**
1. **Set up this device.** Name it, for example "Rob's MacBook". Choose a passphrase of at least 12 characters, such as four random words. You type it each time you unlock the device. Write it on paper. Nobody can reset it.
2. **Make a recovery key.** Press **Create recovery key**. It is shown **once**. Write it out by hand or print it, twice. Press **I have written it down**, then type the groups back in to prove you copied it correctly.
3. **Name the two trustees.** Tick that each one has their own paper copy, then press **Turn on end-to-end encryption**.

**Adding another admin's device.** The new admin opens Admin → Encryption on their device, names it and creates a passphrase. The page shows a 20-digit **safety code**. An admin who already has an approved device compares that code with them by phone or in person, then presses **Approve device**. Never approve a device whose code you did not check.

**If something goes wrong: the recovery plan**
1. **A forgotten passphrase or one lost device.** Set the device up again. Another admin approves it after comparing the safety code. This is why every community should have at least three admins with approved devices.
2. **A device is lost or stolen.** A super admin ticks it under Admin → Encryption and presses **Remove selected and make new keys…**. The device can no longer read anything written from then on. It keeps what it had already opened, so treat older material as possibly seen.
3. **Every admin device is gone.** The **paper recovery key** is the way back. On the Encryption page, "Lost every device?" lets a trustee's paper copy activate a new device. You still have to sign in as an admin, so the paper alone is not enough. Treat it as highly sensitive anyway.
4. **The paper key is lost, or someone saw it.** A super admin chooses **Replace recovery key…** with both trustees present, then **Make new keys now…**. Everyone destroys the old copies.
5. **The worst case.** If every device is lost and no working paper key exists, the encrypted data is gone for good. That means phone numbers, admin chat and drafts. Names and emails are not encrypted, so they survive, and the numbers would have to be collected again.

**Habits that make recovery work**
- Keep the two paper copies in different safe places, held by two different people. Never keep them in email, photos or a shared drive.
- Once a year, run the recovery drill in `docs/KEY_ROTATION_DRILL.md`. Each trustee uses the **Test** box with their own paper copy, and it must say "Recovery key works". The test changes nothing.
- Delete old Firestore backups made before encryption was on, because they hold plaintext.
- For incidents, see `docs/RUNBOOK_INCIDENT.md`: case A (lost device), case D (recovery key), case L (a caller leaves) and case M (a member asks not to be called).

## 1b. Phone numbers (Admin → Members)

- **Members without email.** Leave the email empty and enter a name and phone number instead. They show as *No email (phone only)*: they get calls, never email. In an import, leave the email cell empty on their row (or use a list with just `name` and `phone` columns). Someone with the same name and number is already on the list and is skipped; people sharing one household phone are added as long as their names differ. Their number can't be removed, because it is the only way to reach them; disable them instead.


- Numbers are end-to-end encrypted in your browser before they are saved, so you need **encryption turned on and this device unlocked** to add, see or change them. Without that, the page still works for email.
- Add a number when you add a member, or press **Add phone** / **Edit contact** on someone in the list (second number, preferred language, household and notes go in the same place).
- Tick "This person gave their number for community calls" only if they did. Importing a list with a `phone` column asks you to confirm the same thing for everyone on it.
- Numbers show masked (last four digits) until you press **Show**; **Call** dials from your phone. **They asked not to be called** records a call opt-out.
- The number never appears in the audit log, in exports or in email.

## 1c. Who calls whom (Admin → Calling Tree, Admin → My Calls)

- A super admin ticks the board members who make calls and presses **Plan assignments**. Everyone who can be called (number on file, call consent, no opt-out) is split as evenly as possible, people who share a household go to the same caller, and anyone already assigned stays put. The preview lists every change; **Save calling tree** stores it.
- To move one person by hand, pick another caller in the dropdown next to their name and save.
- Each caller opens **My Calls** on their phone: their people, numbers masked until **Show**, and **Call** to dial. Someone who asks not to be called disappears from the list straight away.
- **Phone tree callers group:** put the people who will phone others in the built-in **Phone tree callers** group (Admin → Groups). On the Calling Tree page, admins from that group are listed first with a badge, and **Check everyone in the group** ticks them for you. You still press **Save calling tree**. Callers must be admins, matched by the same email as their member record. A group member who isn't an admin yet is named in a note and shows **Needs admin access to use My Calls** on the group page.

## 1d. Calling everyone about an announcement (Admin → Call Campaigns, Admin → My Calls)

- Open a campaign: pick the event (or type a title), a date the calls should be done by, and what to say. The script is encrypted; callers read it on their own devices. Everyone on the calling tree who can be called is copied in with their caller.
- Each caller opens **My Calls**: the script, their people, **Call** to dial, then **Log call**: what happened (reached, voicemail, no answer, wrong number, call back, declined), whether they are coming, and an encrypted note. Every logged call is in the audit trail with your name, the person and the outcome, never the number or the note.
- The board opens the campaign page: reached and attempted totals, progress per caller, who is still not reached, the full call log, **Remind callers** (an email to those with people left), **Export CSV** (names and outcomes only) and **Close campaign…** when done. A closed campaign takes no more calls.

## 1e. Officers and groups (Admin → Positions, Admin → Groups)

**Positions** lists the president, treasurer, secretary, board members and the rest, with who holds each one and since when. Anyone on the board can look. Only a super admin changes it.
- **Set holder** picks a member and the day the term starts. If someone holds a single seat, leave "End … the day before" ticked and their term closes for you.
- **End term…** stops a term after today. It moves to **Past terms** once the end date has passed, so the history stays.
- **Delete…** (in Past terms) is only for a term entered by mistake. To record that someone left, end the term instead.
- **Add a position** or **Edit** changes the list itself, for example a "Kitchen coordinator" seat. Untick "In use" to hide a position without losing its history.

**Groups** are teams of members: the phone tree callers, cooks, marketing, shopping. Any admin can make a group, add people and choose a lead. The lead has to be in the group, so add them first. To remove the lead, choose another lead first. Only a super admin can delete a group, which takes it off every member. The phone tree callers group is built in and cannot be deleted.
- The **Members** page shows each person's officer positions and groups. Use the group box above the list to show one team, only officers, or people in no group. **Groups** on a row ticks which teams that person is in.
- People in the phone tree callers group still need admin access to use My Calls. Nothing is added to the calling tree automatically.

## 1f. Event tasks and templates (Admin → Events)

Open an event to edit it and scroll to **Tasks**. This is the checklist for who does what: cook, shopping, marketing, setting up the hall.
- **Add task** takes a title, an optional group, optional named people (up to 20), a due date and notes. Keep notes about the work, not about people. Phone numbers stay on the member's contact card. Tasks save the moment you press **Save task**, separately from **Save changes** for the event itself.
- Tick the box to mark a task done, and untick it to reopen it. A task past its due date that is still open shows **Overdue**.
- A group's page lists every task given to that group across all events, and the Groups list shows how many are still open.
- **Save as template** keeps this event's tasks, with their groups and with due dates counted from the event day (for example "3 days before"). Assigned people are not kept. **Use a template** on another event adds those tasks with new due dates and skips any task whose title is already there, so pressing it twice changes nothing.
- **Task templates** (button on the Events page) lets you write a template by hand and edit it. Only a super admin can delete one. Events keep the tasks they already got.
- If an event has no date yet, template tasks get no due dates. Set the date, save, then use the template.
- Deleting an event deletes its tasks. Deleting a group keeps its tasks and takes the group off them.

## 1g. Reminding people about their tasks (Admin → Events)

On an event's **Tasks** section, **Send reminders** emails the people who own tasks. It needs the same email set-up as broadcasts (sending turned on, the email service, and the organization's name and address).
- A window first shows **exactly who would be emailed** and how many tasks each has, **who can't be emailed and why**, and who was reminded in the last 24 hours. Nothing is sent until you press **Send N reminders**.
- **Who is reminded:** the people named on a task, and the lead of the task's group (not the whole group). A person gets one email listing only their own open tasks, with due dates. Task notes are never sent.
- **Who is not:** people with no email (phone-only members: phone them, or use the calling tree), who haven't agreed to emails, who asked to stop, or whose address bounced. They are listed in the window so you know to call.
- **Choices:** **All open tasks**, or **Only overdue tasks**.
- **Limits:** a person is reminded at most once every 24 hours per event; one send reaches up to 50 people (send again for the rest); sends count towards the same daily email limit as broadcasts; ten sends per admin per hour.
- Every email has an unsubscribe link, and unsubscribing stops reminders as well as broadcasts. The audit log records who sent reminders and how many, never the names or task text.
- If the email service is down, nothing is lost: the window says so and you can send again straight away.

**The daily digest (Admin → Events, top of the page).** A super admin can turn on a **Daily overdue digest** (**Turn on**, which asks first). Every morning, around 8 or 9 AM Eastern, each person with overdue tasks gets one email listing them, grouped by event. It is **off** until someone turns it on, and any super admin can press **Turn off** to stop it again.
- It covers events that are coming up or ended in the last week. Same rules as manual reminders: only members who agreed to emails, with the unsubscribe link, and a task's group goes to its lead.
- At most 50 people a day, and never more than half of the day's email limit, so broadcasts always have room. People with the most overdue tasks come first; the rest get theirs the next day.
- The card shows the last run, for example "2 people emailed". If it says nothing was sent, the reason is shown. A red note means the schedule secret or the email set-up is missing.
- A reminder sent by hand and the digest are separate, so someone you reminded in the morning can still get the digest.

## 1h. A member's profile (Admin → Members → Profile)

Press **Profile** on a member's row to open their page. Only admins can see it.
- **Email:** the member's address, or "No email address" for someone reached by phone. A **super admin** can press **Edit email** (or **Add email**), type the new address twice and press **Save email**. Everything else stays with the member: notes, calls, groups, positions, tasks, and whether they agreed to email or opted out. If they opted out, they stay opted out at the new address; if the old address bounced, the new one starts fresh. An address another member already uses is refused, with their name, so the same person isn't on the list twice. If the member had opted out or their old address bounced, the old address goes on the do-not-email list (a scrambled code, never the address), so importing it again won't start emails to it. **Remove email…** is offered only when the member has a name and a phone number, so they can still be reached. The activity log records "changed a member's email" with who and when, never either address. Other admins see the address and a note to ask a super admin. (Added 2026-11-06, plan §25.)
- **Membership:** set **Member since** (the day they joined) and the page shows how long, for example "Member since Mar 2019 · 7 years, 8 months". If you don't know the date, **Use the day they were added** fills in the day they went on this list as a start. Dates in the future or before 1950 are refused. Add the **City** and **State** they live in. A state name such as "Pennsylvania" is saved as "PA". There is no street address anywhere. The Members list shows the city and state and the search finds them.
- **Family:** press **Add family member** and give a name, and if you know it how they are related and a phone number. Up to ten. This is for reference, so a caller knows who else to ask for. Family members are never emailed or called by the site, and listing a number does not mean they agreed to be contacted. It is kept encrypted like phone numbers, so you need to unlock this device first, and numbers show as dots until you press **Show**.
- **Edit contact** on the Members page keeps the family list.
- **Notes:** write what happened or what you were told, then **Add note**. Each note shows your name and the date, newest first. Notes are encrypted like phone numbers, so you need this device unlocked to write or read them. A note can't be edited. You can delete your own note, and a super admin can delete anyone's. Keep notes to facts, because other admins read them. The activity log records that a note was added or deleted, never what it said. A member can have up to 200 notes.
- **Calls:** the profile lists every call made to them for an announcement: the campaign, when, what happened (reached, voicemail, no answer…), who called and the caller's note. Above the list: how many campaigns they were in, how many attempts, and in how many they were reached.
- **How the call went:** when a caller logs a call where the person was reached, they may choose **Polite**, **Neutral** or **Rude** (or leave it not recorded). Say how the call went, not what you think of the person. It is encrypted like notes, shows only on this profile (never in lists, exports, the campaign dashboard or the activity log), and the profile adds up the ratings: for example "1 polite · 1 rude". A super admin can press **Clear rating…** if one was a mistake; the call and its note stay.
- **What a profile holds, and who can see it:**

  | Item | Kept | Who can read it | Who can remove it |
  |---|---|---|---|
  | Name, email, consent history, groups | Plain, on the member record | Every admin | A super admin can correct the name, change or remove the email, and delete the whole member (see "Deleting a member" below). Any admin can disable them |
  | Member since, city, state | Plain | Every admin | Any admin (clear the field) |
  | Phone numbers, language, household, contact note, family | Encrypted | Admins on an approved, unlocked device | Any admin (Edit contact, Remove) |
  | Notes | Encrypted text; author and date plain | Admins on an approved, unlocked device | The author, or a super admin |
  | Calls: campaign, time, outcome, RSVP, caller | Plain | Every admin | Removed when a super admin deletes the member; otherwise not removable (the record of who was called) |
  | Call notes and ratings (polite, neutral, rude) | Encrypted | Admins on an approved, unlocked device | A super admin can clear a rating; a call note stays |
  | The activity log | Plain, never the text of a note, rating or number | Every admin | Not removable, even when a member is deleted |

- **Deleting a member (super admin only).** At the bottom of a profile, **Delete this member** is for a removal request or a record made by mistake. If you only want to stop contacting someone, use **Turn off…** on the Members list: it can be undone, and deleting cannot.
  1. Press **Delete member…**. The dialog lists what will be removed (their record with phone numbers and family, notes, call records and ratings, their place in the calling tree, broadcast delivery records, reminder records, and their name on tasks and as a group lead) and what will stay.
  2. Type the member's name exactly as shown (capitals and spacing don't matter) and press **Delete member**. You land back on the Members list.
  3. **What stays:** officer terms stay in the history and show "Removed member"; the activity log is never edited, so older entries may still name them (the deletion itself is a new entry with the member's id and counts, never their name or email); names written in minutes or Plans & Issues text; and earlier exports and backups.
  4. **If they had unsubscribed, complained, or their address bounced,** the app keeps a "do not email" record: a scrambled code made from the address, never the address itself. If the address is added or imported again, that member starts out opted out until an admin records new consent. This is on purpose: deleting must not undo an unsubscribe.
  5. A deletion that stops part way (for example the internet drops) can be run again: the member is deleted last, so they still appear on the list until it has finished.

- **Keep notes useful and safe.** Write what the community needs: how to reach someone, when they prefer calls, what they offered to help with. Every admin with an approved device can read every note, so don't record health, immigration, money or family problems, and don't write opinions you wouldn't say to the person. A person who asks what is held about them, or to have it removed, is handled as in the runbook (case O; case M for numbers).

## 1i. Exporting the member list (Admin → Members → Export list)

Press **Export list** above the list. Choose everyone, or only the people the search and filters show right now (for example one group), and then **Download**. You get a spreadsheet file (CSV) with each member's name, email, status, member since, city and state, groups, officer positions, and whether they can be emailed or called. Notes, family members and call history are never in it.

- **Phone numbers are optional.** Tick "Include phone numbers…" to add the number, alternate number, language and household. This works only on an unlocked device, because the numbers are encrypted until your browser opens them. With the device locked the box is greyed out and says so.
- **The file is not encrypted.** Share it only with people who need it, do not put it in a chat or an open folder, and delete it when you are done. If a file with numbers is lost, tell the board and see `docs/RUNBOOK_INCIDENT.md` case P.
- **Every download is recorded** in the activity log (who, when, how many people, with numbers or not; never their details).
- **Importing it again:** the first columns are `Name`, `Email` and `Phone`, so the file can go back through Import a list. Names that start with `=`, `+`, `-` or `@` get a leading apostrophe so a spreadsheet shows them as text instead of running them.


## 1j. Push notifications on your phone or computer (Admin → Security)

A push notification is a short alert that pops up on your phone or computer when something needs you, even when the site is not open. It says only that something happened, such as "New activity in Admin chat" or "A broadcast is waiting for approval". It never shows a name, a message or a title, and tapping it opens the right page after you sign in.

**Turn it on, on each device you want alerts on**

1. Sign in on that device and open **Admin → Security → Push notifications on this device**.
2. Press **Turn on push on this device**. Your browser asks whether to allow notifications. Choose **Allow**.
3. Under **Your devices** tick the alerts you want on that device: Admin chat, Plans & Issues, minutes waiting for approval, a broadcast waiting for approval, calls to make, and a locked authenticator. A new device starts with all of them on.

**Android and computers (Chrome, Edge, Firefox):** it works in the browser. You do not need to install anything.

**iPhone and iPad (iOS or iPadOS 16.4 or later):** Apple only allows push for a site that is saved to the Home Screen, so do these steps first.
1. Open the site in **Safari** (not inside another app's browser).
2. Tap **Share**, then **Add to Home Screen**, then **Add**.
3. Close Safari and open **GHMO from the Home Screen icon**.
4. Sign in there, then follow "Turn it on" above from that icon.
If the button says this browser cannot receive push, you opened the site in Safari instead of from the Home Screen icon.

**What you will and will not get**
- You get an alert for what **other** people do. You are never alerted about your own message.
- At most **one alert of each kind a minute** per person. A busy chat will not buzz your phone for every line; a newer alert replaces the one still showing.
- If your admin account is turned off, you get nothing.
- Only people on the admin list ever get these. Members do not.

**Turn it off.** Press **Turn off** next to a device (or untick one alert). Do this on any device you sell, give away or lose. You can turn off any of your own devices from any signed-in device. If you cannot sign in anywhere, ask a super admin: they can turn off that one device (see "For super admins" below), or turn off your admin account (the runbook, case B).

**For super admins** (Admin → Security, below the push card; plain admins do not see these two cards)
- **Push for the whole site** shows whether push is on, and who last changed it and when. **Turn push off…** stops every push on every phone and computer at once, for example if something is wrong. It asks first. Email alerts are not affected, devices stay as they are, and nothing has to be set up again: **Turn push on** resumes everything. While it is off, every admin's own push card says so.
- **Everyone's push devices** lists each admin's devices: whose it is (and "Account turned off" if that admin is off), its name, which alerts are on, when it was added and when it last got an alert. You never see a device's address. **Turn off…** (it asks first) stops that device getting alerts, for example a lost phone; it does not change the person's admin access, and they can turn the device on again from that device. Before you turn an admin back on, check this list first: their old devices are still there.
- Both actions are written to the activity log.

**If it does not work**
- Nothing arrives: check that your phone or computer is not in Do Not Disturb or Focus mode, that notifications are allowed for the browser (or the Home Screen app) in the device settings, and that the card says **On** for this device.
- "Notifications are blocked for this site": open the browser's site settings, allow notifications for this site, then press Turn on again.
- The card says push is not set up on this site: the site's push keys have not been added yet. Tell whoever manages the website; the steps are in the go-live checklist.
- A device that has not been sent an alert yet says so under its name; send a test by asking another admin to post in Admin chat.

## 1k. Who can sign in (Admin → Admins, super admins only)

The **Admins** page lists everyone who can sign in to the admin area: super admins first, you marked **You**, each person's role (**Super admin** or **Admin**), whether they are **Active** or **Turned off**, their email and when they last signed in. Only super admins see the page and its link.

- **Add an admin:** enter their name and email and choose the role, then **Add admin**. Nothing is emailed. Tell them to open the admin sign-in page and enter that email; they then set up their authenticator app as usual. An address already on the list is refused (if that person is turned off, turn them back on instead).
- **Turn off…:** they can no longer sign in, and any open session ends within about a minute. Nothing they wrote is removed, and you can **Turn on** again at any time. Keep "Also turn off their push notification devices" ticked unless you have a reason not to. Afterwards the page reminds you to revoke their encryption devices under **Admin → Encryption** if they used encryption; that needs your own unlocked device, so it is a separate step.
- **Make super admin… / Make admin…:** a super admin can also manage admins, delete members, set officers, edit the calling tree and control push for the whole site. Only give it to someone the board trusts with that.
- **Edit name:** for a typo. An email address can't be changed, because a wrong one would lock the person out or let someone else in: add the right address as a new admin and turn the wrong one off.
- **What the page will not let you do:** turn yourself off or change your own role (ask another super admin), or turn off or demote the last active super admin (make someone else a super admin first). These checks are made on the server, even if two super admins act at the same moment.
- Every change is written to the activity log, with the admin's name and what changed, never their email.

## 1l. Minutes for a meeting (Admin → Meeting minutes → Write minutes)

Minutes belong to a meeting that has already happened. (Added 2026-11-06, plan §26.)
- **Pick the meeting** under **Which meeting?**. The list shows past meetings, newest first, with a search box once it is long. A meeting that already has minutes shows "has minutes" and can't be picked; open those minutes from **Records** instead.
- **A meeting that isn't listed** (a board call, a meeting nobody added beforehand): press **Record a meeting that isn't listed**, give a title, the date and start time (today or earlier) and, if you like, the place, then **Record meeting**. It is saved as a **draft** event, so it never appears on the public Events page, and it is picked for you. If there is already a meeting on that day, the form shows it first: press **Use this meeting** instead of making a second one. On a brand-new site with no past meetings, **Write minutes** opens this form straight away.
- **Wrong meeting?** While the minutes are a **draft**, open them and press **Change meeting…**, pick the right one and **Move minutes**. The title and date change; what you wrote stays. Submitted or approved minutes must be returned to draft first. The activity log records the move with both meeting titles. A meeting recorded here that no longer has minutes stays as a draft under **Events**, where you can delete it.

## 1m. Finding anything (Ctrl K, or Search… at the top)

Press **Ctrl K** (on a Mac **⌘ K**), or **Search…** at the top of any admin page (the magnifying glass on a phone), and type. (Added 2026-11-06, plan §27.)
- **Pages** match by name or task ("passkey", "donations").
- From two letters it also finds **members** (name or email; turned-off members are marked), **events**, **minutes** (by meeting title, with their status), **groups**, **positions** (with who holds them) and **broadcasts** (by subject). Capitals and accents don't matter, and every word you type must match, so "asha rai" narrows it down.
- Use the arrow keys and **Enter**, or click. A member opens their profile, an event its edit page, minutes the editor, a group its page, a broadcast its page. When there are more than five members or minutes, **See all … matching** opens that list with your words already in its search box.
- It never searches encrypted things: phone numbers, family, notes, the text of minutes, Plans & Issues or chat. Searching isn't recorded in the activity log. The list it searches is fetched when you first open it and kept for 10 minutes, so something added in the last few minutes may only show after that; the list pages are always up to date.

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
- **Pause** stops after the current batch. **Cancel broadcast…** stops it for good.
- If some deliveries failed, press **Retry N failed**.

## 5. Post it to the Messenger group chats

- The site does not connect to Messenger. On an approved message (it does not need to be emailed first, and no email set-up is needed), the **Post to the Messenger group chats** box shows the text without the email footer.
- Press **Copy text**, paste it into the BOD or community group chat in the Messenger app, then press **I posted it in the BOD group chat** or **I posted it in the Community group chat**. The page lists who posted it where and when, and the audit log records it.
- Only approved text can be copied and recorded. If someone withdraws and edits the message, it needs approval again before it can be posted.

## If something goes wrong

A lost device or recovery key: see §1a and `docs/RUNBOOK_INCIDENT.md`, cases A and D. Wrong text or wrong people, many complaints, or a leaked key: see `docs/RUNBOOK_INCIDENT.md`, cases H, I and J. A wrong group-chat post, a lost caller device, or a member who asks to be removed: cases K, L and M. A stolen admin session or an admin who left: cases B and C (use Admin → Admins). A wrong task reminder: case N. A member who asks what is held or to be deleted: case O. A lost or over-shared member export: case P. A push notification problem or a lost phone that still gets alerts: case Q.
