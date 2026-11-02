import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const boardMeetingInvitation: DocTemplate = {
  id: "board_meeting_invitation",
  version: 1,
  title: "Board Meeting Invitation",
  category: "Governance",
  description: "Invite a board member to a board meeting, with the date, place and agenda.",
  fields: [
    { id: "memberName", label: "Board member's name", type: "text", placeholder: "Ram Bahadur Thapa" },
    { id: "meetingTitle", label: "Meeting title", type: "text", placeholder: "Board Meeting", required: true },
    { id: "meetingDate", label: "Meeting date", type: "date", required: true },
    { id: "meetingTime", label: "Meeting time", type: "text", placeholder: "6:00 PM", required: true },
    { id: "meetingLocation", label: "Meeting place", type: "text", placeholder: "GHMO Office / Community Center", required: true },
    {
      id: "agenda",
      label: "Agenda",
      type: "textarea",
      rows: 4,
      placeholder: "Treasurer's report, bylaws review, Gumba project update"
    },
    { id: "rsvpContact", label: "How to reply", type: "text", placeholder: "board@ghmo.org" }
  ],
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const memberName = escapeHtml(inputs.memberName);
    const meetingTitle = escapeHtml(inputs.meetingTitle) || "Board Meeting";
    const meetingDate = formatDate(inputs.meetingDate) || "TBD";
    const meetingTime = escapeHtml(inputs.meetingTime) || "TBD";
    const meetingLocation = escapeHtml(inputs.meetingLocation) || "TBD location";
    const agenda = escapeHtml(inputs.agenda);
    const rsvpContact = escapeHtml(inputs.rsvpContact) || "board@ghmo.org";

    return `
      <div>
        <p class="ghmo-letter-headline">Board Meeting Invitation</p>
        <p class="ghmo-letter-meta">${meetingTitle} · ${meetingDate} · ${meetingTime}</p>
        <div class="ghmo-letter-body">
          <p>Dear ${memberName || "Board Member"},</p>
          <p>
            We are writing to formally invite you to attend the upcoming Board Meeting of the ${organizationName}. 
            Your guidance and participation are essential to GHMO’s continued governance and strategic direction.
          </p>
          <p>
            ${meetingTitle} is scheduled for ${meetingDate} at ${meetingTime}, and will be held at ${meetingLocation}. 
            We value your insights as we discuss the agenda and align on operational decisions.
          </p>
          ${
            agenda
              ? `<p>The proposed agenda includes:<br/>${agenda}</p>`
              : ""
          }
          <p>
            Your presence and input are highly valued. Please confirm your availability or reach out if you have any questions regarding the meeting.
          </p>
          <p class="ghmo-letter-footer">Respectfully,<br/>${organizationName}</p>
          <p class="ghmo-letter-footer" style="margin-top:0.5rem;">RSVP: ${rsvpContact}</p>
        </div>
      </div>
    `;
  }
};
