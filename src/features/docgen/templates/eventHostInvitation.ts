import { DocTemplate } from "../types";
import { escapeHtml, formatDate, onDateAtTime } from "../render/renderTemplateHtml";

export const eventHostInvitation: DocTemplate = {
  id: "event-host-invitation",
  version: 3,
  title: "Community leader invitation",
  category: "Event",
  description: "Invite a leader from another community to a GHMO event and ask them to spread the word.",
  fields: [
    { id: "hostName", label: "Leader's name", type: "text", placeholder: "Dhan Bahadur Rana", required: true },
    { id: "leaderCommunity", label: "Their organization or community", type: "text", placeholder: "Nepali Community of Central PA" },
    { id: "eventName", label: "Event name", type: "text", placeholder: "the Dashain celebration", hint: "As it reads in the letter: \"with us at the Dashain celebration\".", required: true },
    { id: "eventDate", label: "Event date", type: "date", required: true },
    { id: "eventTime", label: "Event time", type: "text", placeholder: "7:00 PM" },
    { id: "eventLocation", label: "Event place", type: "text", placeholder: "123 Main Street, Harrisburg, PA" },
    {
      id: "guestFocus",
      label: "Message to share",
      type: "textarea",
      rows: 5,
      placeholder: "We will celebrate our members with a cultural program and a shared meal, and thank everyone who helped this year."
    },
    { id: "supportContact", label: "GHMO contact", type: "text", placeholder: "A name and phone number or email address" }
  ],
  // Empty fields leave their sentence out; the letter never prints "TBD" or a made-up contact.
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const hostName = escapeHtml(inputs.hostName);
    const leaderCommunity = escapeHtml(inputs.leaderCommunity);
    const eventName = escapeHtml(inputs.eventName) || "our upcoming event";
    const eventDate = formatDate(inputs.eventDate);
    const eventTime = escapeHtml(inputs.eventTime);
    const eventLocation = escapeHtml(inputs.eventLocation);
    const guestFocus = escapeHtml(inputs.guestFocus);
    const supportContact = escapeHtml(inputs.supportContact);

    const meta = [eventName, eventDate, eventTime, eventLocation].filter(Boolean).join(" · ");
    const when = onDateAtTime(eventDate, eventTime);

    return `
      <div>
        <p class="ghmo-letter-headline">Community Leader Invitation</p>
        <p class="ghmo-letter-meta">${meta}</p>
        <div class="ghmo-letter-body">
          ${hostName ? `<p>Dear ${hostName},</p>` : ""}
          <p>
            We would be glad to have you with us at ${eventName}${when}.${eventLocation ? ` It will be held at ${eventLocation}.` : ""}
            Your presence means a lot to our community, and we hope you will
            share this invitation with ${leaderCommunity || "your community"} so friends and neighbors can join us too.
          </p>
          ${guestFocus ? `<p>${guestFocus}</p>` : ""}
          <p>Gatherings like this bring our communities closer together. If you have any questions, please get in touch.</p>
          <p class="ghmo-letter-footer">Warm regards,<br/>${organizationName}</p>
          ${supportContact ? `<p class="ghmo-letter-footer" style="margin-top:0.5rem;">Contact: ${supportContact}</p>` : ""}
        </div>
      </div>
    `;
  }
};
