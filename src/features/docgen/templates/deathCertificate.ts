import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const deathCertificate: DocTemplate = {
  id: "death-certificate",
  // The id stays "death-certificate" so saved notices still open.
  version: 3,
  title: "Memorial notice",
  category: "Notice",
  description: "Share news of a member's passing, with the memorial service details and a family contact.",
  fields: [
    { id: "deceasedName", label: "Name of the person who passed away", type: "text", placeholder: "Maya Pun Magar", required: true },
    { id: "dateOfPassing", label: "Date of passing", type: "date", required: true },
    { id: "serviceDate", label: "Memorial service date", type: "date" },
    { id: "serviceTime", label: "Memorial service time", type: "text", placeholder: "11:00 AM" },
    { id: "serviceLocation", label: "Service place", type: "text", placeholder: "Community hall, Harrisburg" },
    { id: "contactPerson", label: "Family contact", type: "text", placeholder: "A name and phone number" },
    {
      id: "remarks",
      label: "A few words from the family (optional)",
      type: "textarea",
      rows: 3,
      placeholder: "She was a loving mother and grandmother, and a friend to many in our community."
    }
  ],
  // Empty fields leave their line out; the notice never prints "TBD" or a made-up contact.
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const deceasedName = escapeHtml(inputs.deceasedName);
    const dateOfPassing = formatDate(inputs.dateOfPassing);
    const serviceDate = formatDate(inputs.serviceDate);
    const serviceTime = escapeHtml(inputs.serviceTime);
    const serviceLocation = escapeHtml(inputs.serviceLocation);
    const contactPerson = escapeHtml(inputs.contactPerson);
    const remarks = escapeHtml(inputs.remarks);
    const serviceWhen = [serviceDate, serviceTime].filter(Boolean).join(" · ");
    const hasService = Boolean(serviceWhen || serviceLocation);

    return `
      <div>
        <p class="ghmo-letter-headline" style="text-align:center;">In Memoriam</p>
        <p class="ghmo-letter-meta" style="text-align:center;">${organizationName}</p>
        <div class="ghmo-letter-body" style="text-align:center;">
          <p>With deep sorrow, we share the passing of</p>
          ${deceasedName ? `<p style="font-size:1.4rem; font-weight:600;">${deceasedName}</p>` : ""}
          ${dateOfPassing ? `<p>on ${dateOfPassing}.</p>` : ""}
          ${remarks ? `<p style="margin-top:1rem;">${remarks}</p>` : ""}
          ${
            hasService
              ? `<p style="margin-top:1rem; font-weight:600;">Memorial service</p>
          ${serviceWhen ? `<p>${serviceWhen}</p>` : ""}
          ${serviceLocation ? `<p>${serviceLocation}</p>` : ""}
          <p>All are welcome to join the family in remembrance.</p>`
              : ""
          }
          ${contactPerson ? `<p class="ghmo-letter-footer" style="text-align:center;">Family contact: ${contactPerson}</p>` : ""}
        </div>
      </div>
    `;
  }
};
