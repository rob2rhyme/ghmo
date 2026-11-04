import { DocTemplate } from "../types";
import { escapeHtml, formatDate, onDateAtTime } from "../render/renderTemplateHtml";

export const meetingMemberInvitation: DocTemplate = {
  id: "meeting-member-invitation",
  version: 3,
  title: "General meeting invitation",
  category: "Meeting",
  description: "Invite a member to a general meeting, with the date, place and agenda.",
  fields: [
    { id: "memberName", label: "Member's name", type: "text", placeholder: "Sita Thapa Magar", required: true },
    { id: "meetingDate", label: "Meeting date", type: "date", required: true },
    { id: "meetingTime", label: "Time", type: "text", placeholder: "6:30 PM" },
    { id: "location", label: "Location", type: "text", placeholder: "GHMO community hall, Harrisburg" },
    { id: "agenda", label: "What the meeting is about", type: "textarea", rows: 4, placeholder: "Gumba Project update, Dashain program planning, volunteer sign-up." },
    { id: "rsvpLink", label: "How to reply (link, phone or email)", type: "text", placeholder: "A phone number, email address or link" }
  ],
  // Empty fields leave their sentence out; the letter never prints "TBD" or a made-up contact.
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const memberName = escapeHtml(inputs.memberName);
    const meetingDate = formatDate(inputs.meetingDate);
    const meetingTime = escapeHtml(inputs.meetingTime);
    const location = escapeHtml(inputs.location);
    const agenda = escapeHtml(inputs.agenda);
    const rsvpLink = escapeHtml(inputs.rsvpLink);

    const meta = [organizationName, meetingDate, meetingTime].filter(Boolean).join(" · ");
    const when = onDateAtTime(meetingDate, meetingTime);

    return `
      <div>
        <p class="ghmo-letter-headline">General Meeting Invitation</p>
        <p class="ghmo-letter-meta">${meta}</p>
        <div class="ghmo-letter-body">
          ${memberName ? `<p>Dear ${memberName},</p>` : ""}
          <p>We warmly invite you to our next general meeting${when}.${location ? ` We will meet at ${location}.` : ""} Your voice matters in the decisions we make together.</p>
          ${agenda ? `<p>What we will talk about:<br/>${agenda}</p>` : ""}
          <p>Please let us know whether you can come. We look forward to seeing you.</p>
          <p class="ghmo-letter-footer">With appreciation,<br/>${organizationName}</p>
          ${rsvpLink ? `<p class="ghmo-letter-footer" style="margin-top:0.5rem;">Reply to: ${rsvpLink}</p>` : ""}
        </div>
      </div>
    `;
  }
};
