import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const boardMeetingInvitation: DocTemplate = {
  id: "board_meeting_invitation",
  version: 1,
  title: "Board Meeting Invitation",
  category: "Governance",
  description: "Formal invitation for GHMO board members to attend a board meeting.",
  fields: [
    { id: "memberName", label: "Board Member Name", type: "text", placeholder: "Board Member Name" },
    { id: "meetingTitle", label: "Meeting Title", type: "text", placeholder: "Board Meeting", required: true },
    { id: "meetingDate", label: "Meeting Date", type: "date", required: true },
    { id: "meetingTime", label: "Meeting Time", type: "text", placeholder: "6:00 PM", required: true },
    { id: "meetingLocation", label: "Meeting Location", type: "text", placeholder: "GHMO Office / Community Center", required: true },
    {
      id: "agenda",
      label: "Agenda / Key Topics",
      type: "textarea",
      rows: 4,
      placeholder: "Treasury overview, bylaws review, community outreach updates"
    },
    { id: "rsvpContact", label: "RSVP / Contact Information", type: "text", placeholder: "board@ghmo.org" }
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
