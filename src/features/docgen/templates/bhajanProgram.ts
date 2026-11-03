import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const bhajanProgram: DocTemplate = {
  id: "bhajan_program",
  version: 2,
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
    { id: "contact", label: "Contact person or phone", type: "text", placeholder: "A name and phone number" }
  ],
  // Empty fields leave their sentence out; the letter never prints "TBD" or a made-up contact.
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const hostName = escapeHtml(inputs.hostName);
    const programTitle = escapeHtml(inputs.programTitle) || "Bhajan Program";
    const programDate = formatDate(inputs.programDate);
    const programTime = escapeHtml(inputs.programTime);
    const location = escapeHtml(inputs.location);
    const occasion = escapeHtml(inputs.occasion);
    const contact = escapeHtml(inputs.contact);

    const meta = [programDate, programTime, location].filter(Boolean).join(" · ");
    const when = [programTime ? ` at ${programTime}` : "", programDate ? ` on ${programDate}` : "", location ? ` at ${location}` : ""].join("");

    return `
      <div>
        <p class="ghmo-letter-headline">${programTitle}</p>
        <p class="ghmo-letter-meta">${meta}</p>
        <div class="ghmo-letter-body">
          <p>Dear community,</p>
          <p>
            ${hostName ? `The ${hostName} warmly invites` : "We warmly invite"} you to an evening of bhajan and prayer. 
            We will gather${when}.
          </p>
          ${occasion ? `<p>${occasion}</p>` : ""}
          <p>
            Please join us with your family and friends as we sing together, share prasadam, and 
            draw strength from our heritage.
          </p>
          <p class="ghmo-letter-footer">With reverence,<br/>${[hostName, organizationName].filter(Boolean).join(" · ")}</p>
          ${contact ? `<p class="ghmo-letter-footer" style="margin-top:0.5rem;">Contact: ${contact}</p>` : ""}
        </div>
      </div>
    `;
  }
};
