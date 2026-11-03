import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const bhajanProgram: DocTemplate = {
  id: "bhajan_program",
  version: 1,
  title: "Bhajan Program",
  category: "Religious",
  description: "Invite the community to a bhajan program and prayers at a family's home.",
  fields: [
    { id: "hostName", label: "Host family", type: "text", placeholder: "Gurung Family", required: true },
    { id: "programTitle", label: "Program title", type: "text", placeholder: "Bhajan Program", required: true },
    { id: "programDate", label: "Date", type: "date", required: true },
    { id: "programTime", label: "Time", type: "text", placeholder: "6:30 PM", required: true },
    { id: "location", label: "Address", type: "textarea", rows: 3, placeholder: "123 Harmony Lane, Harrisburg", required: true },
    { id: "occasion", label: "Occasion", type: "textarea", rows: 3, placeholder: "Blessing for the new home" },
    { id: "contact", label: "Contact person or phone", type: "text", placeholder: "bhajan@ghmo.org" }
  ],
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const hostName = escapeHtml(inputs.hostName) || "GHMO Family";
    const programTitle = escapeHtml(inputs.programTitle) || "Bhajan Program";
    const programDate = formatDate(inputs.programDate) || "TBD";
    const programTime = escapeHtml(inputs.programTime) || "TBD";
    const location = escapeHtml(inputs.location) || "TBD location";
    const occasion = escapeHtml(inputs.occasion) || "Join us for reflective bhajans and prayers.";
    const contact = escapeHtml(inputs.contact) || "executive@ghmo.org";

    return `
      <div>
        <p class="ghmo-letter-headline">${programTitle}</p>
        <p class="ghmo-letter-meta">${programDate} · ${programTime} · ${location}</p>
        <div class="ghmo-letter-body">
          <p>Dear Community,</p>
          <p>
            The ${hostName} warmly invites you to a sacred evening of ${occasion} at ${location}. 
            We will gather in prayer, bhajan, and reflection beginning at ${programTime} on ${programDate}.
          </p>
          <p>
            Please join us with your family and friends as we sing together, share prasadam, and 
            draw strength from our heritage.
          </p>
          <p class="ghmo-letter-footer">With reverence,<br/>${hostName} · ${organizationName}</p>
          <p class="ghmo-letter-footer" style="margin-top:0.5rem;">Contact: ${contact}</p>
        </div>
      </div>
    `;
  }
};
