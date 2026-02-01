import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const deathCertificate: DocTemplate = {
  id: "death-certificate",
  title: "Memorial Notice",
  category: "Certificate",
  description: "Document a memorial acknowledgement with dates and contact information for families.",
  fields: [
    { id: "deceasedName", label: "Deceased Name", type: "text", placeholder: "Maya Gurung", required: true },
    { id: "dateOfPassing", label: "Date of Passing", type: "date", required: true },
    { id: "serviceDate", label: "Memorial Service Date", type: "date" },
    { id: "serviceLocation", label: "Service Location", type: "text", placeholder: "Peaceful Rest Center" },
    { id: "contactPerson", label: "Contact Person / Family", type: "text", placeholder: "Soni D. Khatri" },
    {
      id: "remarks",
      label: "Remarks",
      type: "textarea",
      rows: 3,
      placeholder: "We honor their service to GHMO and commit to continuing the legacy."
    }
  ],
  renderHtml(inputs) {
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const deceasedName = escapeHtml(inputs.deceasedName) || "Beloved Member";
    const dateOfPassing = formatDate(inputs.dateOfPassing) || "TBD";
    const serviceDate = formatDate(inputs.serviceDate) || "TBD";
    const serviceLocation = escapeHtml(inputs.serviceLocation) || "TBD";
    const contactPerson = escapeHtml(inputs.contactPerson) || "Family Contact";
    const remarks = escapeHtml(inputs.remarks) || "In memory of a life that blessed our community.";

    return `
      <div>
        <p class="ghmo-letter-headline" style="text-align:center;">In Memoriam</p>
        <p class="ghmo-letter-meta" style="text-align:center;">${organizationName}</p>
        <div class="ghmo-letter-body" style="text-align:center;">
          <p>We honor the passing of</p>
          <p style="font-size:1.4rem; font-weight:600;">${deceasedName}</p>
          <p>who passed on ${dateOfPassing}</p>
          <p>Service: ${serviceDate} at ${serviceLocation}</p>
          <p style="margin-top:1rem;">${remarks}</p>
          <p class="ghmo-letter-footer" style="text-align:center;">Available contact: ${contactPerson}</p>
        </div>
      </div>
    `;
  }
};
