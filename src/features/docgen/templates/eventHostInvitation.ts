import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const eventHostInvitation: DocTemplate = {
  id: "event-host-invitation",
  version: 2,
  title: "Community Leader Invitation",
  category: "Events",
  description: "Invite a leader from another community to a GHMO event and ask them to spread the word.",
  fields: [
    { id: "hostName", label: "Leader's name", type: "text", placeholder: "Dhan Bahadur Rana", required: true },
    { id: "leaderCommunity", label: "Their organization or community", type: "text", placeholder: "Nepali Community of Central PA" },
    { id: "eventName", label: "Event name", type: "text", placeholder: "Magar Heritage Celebration", required: true },
    { id: "eventDate", label: "Event date", type: "date", required: true },
    { id: "eventTime", label: "Event time", type: "text", placeholder: "7:00 PM" },
    { id: "eventLocation", label: "Event place", type: "text", placeholder: "Harrisburg community hall" },
    {
      id: "guestFocus",
      label: "Message to share",
      type: "textarea",
      rows: 5,
      placeholder: "Celebrating members, sharing cultural program, community gratitude."
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
    const when = [eventDate ? ` on ${eventDate}` : "", eventTime ? ` at ${eventTime}` : "", eventLocation ? ` at ${eventLocation}` : ""].join("");

    return `
      <div>
        <p class="ghmo-letter-headline">Community Leader Invitation</p>
        <p class="ghmo-letter-meta">${meta}</p>
        <div class="ghmo-letter-body">
          ${hostName ? `<p>Dear ${hostName},</p>` : ""}
          <p>
            We would be glad to have you with us at ${eventName}${when}. Your presence means a lot to our community, and we hope you will
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
