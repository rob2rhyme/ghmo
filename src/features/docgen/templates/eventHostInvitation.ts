import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const eventHostInvitation: DocTemplate = {
  id: "event-host-invitation",
  version: 1,
  title: "Community Leader Invitation",
  category: "Events",
  description: "Invite an external community leader to attend and help share awareness of a GHMO event.",
  fields: [
    { id: "hostName", label: "Leader Name", type: "text", placeholder: "Priya Sharma", required: true },
    { id: "leaderCommunity", label: "Leader Organization / Community", type: "text", placeholder: "Regional Circle" },
    { id: "eventName", label: "Event Name", type: "text", placeholder: "Magar Heritage Celebration", required: true },
    { id: "eventDate", label: "Event Date", type: "date", required: true },
    { id: "eventTime", label: "Event Time", type: "text", placeholder: "7:00 PM" },
    { id: "eventLocation", label: "Event Location", type: "text", placeholder: "City Auditorium" },
    {
      id: "guestFocus",
      label: "Purpose / Message to Share",
      type: "textarea",
      rows: 5,
      placeholder: "Celebrating members, sharing cultural program, community gratitude."
    },
    { id: "supportContact", label: "Contact Information (GHMO)", type: "text", placeholder: "executive@ghmo.org" }
  ],
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const hostName = escapeHtml(inputs.hostName) || "Esteemed Community Leader";
    const leaderCommunity = escapeHtml(inputs.leaderCommunity);
    const eventName = escapeHtml(inputs.eventName) || "Upcoming GHMO Event";
    const eventDate = formatDate(inputs.eventDate) || "TBD";
    const eventTime = escapeHtml(inputs.eventTime) || "TBD";
    const eventLocation = escapeHtml(inputs.eventLocation) || "TBD location";
    const guestFocus = escapeHtml(inputs.guestFocus) || "";
    const supportContact = escapeHtml(inputs.supportContact) || "executive@ghmo.org";

    return `
      <div>
        <p class="ghmo-letter-headline">Community Leader Invitation</p>
        <p class="ghmo-letter-meta">${eventName} • ${eventDate} • ${eventTime} • ${eventLocation}</p>
        <div class="ghmo-letter-body">
          <p>Dear ${hostName}${leaderCommunity ? ` of ${leaderCommunity}` : ""},</p>
          <p>
            We are honored to invite you to participate in an upcoming GHMO event. Your leadership and relationship with the community make your presence especially meaningful to us.
          </p>
          <p>
            ${eventName} is scheduled for ${eventDate} at ${eventTime} at ${eventLocation}. 
            We respectfully request your support in sharing this gathering with your community and encouraging friends and neighbors to join.
          </p>
          ${guestFocus ? `<p>${guestFocus}</p>` : ""}
          <p>
            Your involvement will help strengthen cultural collaboration and awareness across our communities. 
            Please contact us if you have any questions or coordination requests.
          </p>
          <p class="ghmo-letter-footer">Warm regards,<br/>${organizationName}</p>
          <p class="ghmo-letter-footer" style="margin-top:0.5rem;">Contact: ${supportContact}</p>
        </div>
      </div>
    `;
  }
};
