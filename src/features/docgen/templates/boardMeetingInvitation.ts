import { DocTemplate } from "../types";
import { escapeHtml, formatDate, onDateAtTime } from "../render/renderTemplateHtml";

export const boardMeetingInvitation: DocTemplate = {
  id: "board_meeting_invitation",
  version: 3,
  title: "Board meeting invitation",
  category: "Meeting",
  description: "Invite a board member to a board meeting, with the date, place and agenda.",
  fields: [
    { id: "memberName", label: "Board member's name", type: "text", placeholder: "Ram Bahadur Thapa Magar" },
    { id: "meetingTitle", label: "Meeting title", type: "text", placeholder: "Board Meeting", required: true },
    { id: "meetingDate", label: "Meeting date", type: "date", required: true },
    { id: "meetingTime", label: "Meeting time", type: "text", placeholder: "6:00 PM", required: true },
    { id: "meetingLocation", label: "Meeting place", type: "text", placeholder: "GHMO community hall, Harrisburg", required: true },
    {
      id: "agenda",
      label: "Agenda",
      type: "textarea",
      rows: 4,
      placeholder: "Treasurer's report, bylaws review, Gumba Project update"
    },
    { id: "rsvpContact", label: "How to reply", type: "text", placeholder: "A phone number or email address" }
  ],
  // Empty fields leave their sentence out; the letter never prints "TBD" or a made-up contact.
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const memberName = escapeHtml(inputs.memberName);
    const meetingTitle = escapeHtml(inputs.meetingTitle) || "Board Meeting";
    const meetingDate = formatDate(inputs.meetingDate);
    const meetingTime = escapeHtml(inputs.meetingTime);
    const meetingLocation = escapeHtml(inputs.meetingLocation);
    const agenda = escapeHtml(inputs.agenda);
    const rsvpContact = escapeHtml(inputs.rsvpContact);

    const meta = [meetingTitle, meetingDate, meetingTime].filter(Boolean).join(" · ");
    const when = onDateAtTime(meetingDate, meetingTime);

    return `
      <div>
        <p class="ghmo-letter-headline">Board Meeting Invitation</p>
        <p class="ghmo-letter-meta">${meta}</p>
        <div class="ghmo-letter-body">
          <p>Dear ${memberName || "board member"},</p>
          <p>
            We invite you to the ${meetingTitle} of the ${organizationName}${when}.${meetingLocation ? ` We will meet at ${meetingLocation}.` : ""} Your
            voice matters in the decisions we make together.
          </p>
          ${agenda ? `<p>On the agenda:<br/>${agenda}</p>` : ""}
          <p>Please let us know whether you can come, and get in touch if you have any questions before the meeting.</p>
          <p class="ghmo-letter-footer">Respectfully,<br/>${organizationName}</p>
          ${rsvpContact ? `<p class="ghmo-letter-footer" style="margin-top:0.5rem;">Reply to: ${rsvpContact}</p>` : ""}
        </div>
      </div>
    `;
  }
};
