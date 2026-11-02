import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const meetingMemberInvitation: DocTemplate = {
  id: "meeting-member-invitation",
  version: 1,
  title: "General Meeting Invitation",
  category: "Meeting",
  description: "Invite a member to a general meeting, with the date, place and agenda.",
  fields: [
    { id: "memberName", label: "Member's name", type: "text", placeholder: "Sita Gurung", required: true },
    { id: "meetingDate", label: "Meeting date", type: "date", required: true },
    { id: "meetingTime", label: "Time", type: "text", placeholder: "6:30 PM" },
    { id: "location", label: "Location", type: "text", placeholder: "GHMO community hall, Harrisburg" },
    { id: "agenda", label: "What the meeting is about", type: "textarea", rows: 4, placeholder: "Gumba project update, Dashain program planning, volunteer sign-up." },
    { id: "rsvpLink", label: "How to reply (link, phone or email)", type: "text", placeholder: "secretary@ghmo.org or 717-555-0123" }
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
