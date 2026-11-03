import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const deathCertificate: DocTemplate = {
  id: "death-certificate",
  version: 2,
  title: "Memorial Notice",
  category: "Certificate",
  description: "Share news of a member's passing, with the memorial service details and a family contact.",
  fields: [
    { id: "deceasedName", label: "Name of the person who passed away", type: "text", placeholder: "Maya Gurung", required: true },
    { id: "dateOfPassing", label: "Date of passing", type: "date", required: true },
    { id: "serviceDate", label: "Memorial service date", type: "date" },
    { id: "serviceLocation", label: "Service place", type: "text", placeholder: "Peaceful Rest Center" },
    { id: "contactPerson", label: "Family contact", type: "text", placeholder: "Soni D. Khatri" },
    {
      id: "remarks",
      label: "Remarks",
      type: "textarea",
      rows: 3,
      placeholder: "We honor their service to GHMO and commit to continuing the legacy."
    }
  ],
  // Empty fields leave their line out; the notice never prints "TBD" or a made-up contact.
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const deceasedName = escapeHtml(inputs.deceasedName);
    const dateOfPassing = formatDate(inputs.dateOfPassing);
    const serviceDate = formatDate(inputs.serviceDate);
    const serviceLocation = escapeHtml(inputs.serviceLocation);
    const contactPerson = escapeHtml(inputs.contactPerson);
    const remarks = escapeHtml(inputs.remarks);
    const service = [serviceDate, serviceLocation].filter(Boolean).join(" at ");

    return `
      <div>
        <p class="ghmo-letter-headline" style="text-align:center;">In Memoriam</p>
        <p class="ghmo-letter-meta" style="text-align:center;">${organizationName}</p>
        <div class="ghmo-letter-body" style="text-align:center;">
          <p>We honor the passing of</p>
          ${deceasedName ? `<p style="font-size:1.4rem; font-weight:600;">${deceasedName}</p>` : ""}
          ${dateOfPassing ? `<p>who passed on ${dateOfPassing}</p>` : ""}
          ${service ? `<p>Service: ${service}</p>` : ""}
          ${remarks ? `<p style="margin-top:1rem;">${remarks}</p>` : ""}
          ${contactPerson ? `<p class="ghmo-letter-footer" style="text-align:center;">Family contact: ${contactPerson}</p>` : ""}
        </div>
      </div>
    `;
  }
};
