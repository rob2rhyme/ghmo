import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const meetingMemberInvitation: DocTemplate = {
  id: "meeting-member-invitation",
  version: 1,
  title: "General Meeting Invitation",
  category: "Meeting",
  description: "Invite attendees to a curated council meeting with the latest agenda and follow-up expectations.",
  fields: [
    { id: "memberName", label: "Member Name", type: "text", placeholder: "Jordan Rivera", required: true },
    { id: "meetingDate", label: "Meeting Date", type: "date", required: true },
    { id: "meetingTime", label: "Time (e.g. 6:30 PM)", type: "text", placeholder: "6:30 PM" },
    { id: "location", label: "Location", type: "text", placeholder: "Community Center Hall" },
    { id: "agenda", label: "Agenda Notes", type: "textarea", rows: 4, placeholder: "Fundraising wrap-up, governance updates, volunteer planning." },
    { id: "rsvpLink", label: "RSVP Link or Contact", type: "text", placeholder: "https://..." }
  ],
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const memberName = escapeHtml(inputs.memberName) || "Valued Member";
    const meetingDate = formatDate(inputs.meetingDate) || "TBD";
    const meetingTime = escapeHtml(inputs.meetingTime) || "TBD";
    const location = escapeHtml(inputs.location) || "TBD location";
    const agenda = escapeHtml(inputs.agenda) || "Agenda and updates to be shared soon.";
    const rsvpLink = escapeHtml(inputs.rsvpLink) || "Please RSVP with the executive team.";

    return `
      <div>
        <p class="ghmo-letter-headline">General Meeting Invitation</p>
        <p class="ghmo-letter-meta">GHMO Executive Council • ${meetingDate} • ${meetingTime}</p>
        <div class="ghmo-letter-body">
          <p>Dear ${memberName},</p>
          <p>We are honored to invite you to our next member meeting on ${meetingDate} at ${meetingTime}, which will be hosted at ${location}. Our focus will be on ${agenda}</p>
          <p>Please confirm your attendance by responding via ${rsvpLink}. Your steady presence strengthens our collective impact.</p>
          <p class="ghmo-letter-footer">With appreciation,<br/>${organizationName}</p>
        </div>
      </div>
    `;
  }
};
