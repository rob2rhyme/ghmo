import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const weddingCertificate: DocTemplate = {
  id: "wedding-certificate",
  title: "Wedding Certificate",
  category: "Certificate",
  description: "Create a keepsake certificate that honors a couple and their wedding details.",
  fields: [
    { id: "partnerOne", label: "Partner One", type: "text", placeholder: "Amrita Gurung", required: true },
    { id: "partnerTwo", label: "Partner Two", type: "text", placeholder: "Saurav Rai", required: true },
    { id: "weddingDate", label: "Wedding Date", type: "date", required: true },
    { id: "weddingLocation", label: "Location", type: "text", placeholder: "Glenwood Garden" },
    { id: "officiant", label: "Officiant / Registrar", type: "text", placeholder: "Justice Dipak Thapa" },
    {
      id: "message",
      label: "Message / Blessing",
      type: "textarea",
      rows: 3,
      placeholder: "Wishing you unity, joy, and the strength of your Magar heritage."
    }
  ],
  renderHtml(inputs) {
    const partnerOne = escapeHtml(inputs.partnerOne) || "Partner One";
    const partnerTwo = escapeHtml(inputs.partnerTwo) || "Partner Two";
    const weddingDate = formatDate(inputs.weddingDate) || "TBD";
    const weddingLocation = escapeHtml(inputs.weddingLocation) || "TBD location";
    const officiant = escapeHtml(inputs.officiant) || "Registered Officiant";
    const message = escapeHtml(inputs.message) || "May your union be blessed with harmony and purpose.";

    return `
      <div>
        <p class="ghmo-letter-headline" style="text-align:center; letter-spacing:0.2em;">Certificate of Union</p>
        <p class="ghmo-letter-meta" style="text-align:center;">Greater Harrisburg Magar Organization</p>
        <div class="ghmo-letter-body" style="text-align:center;">
          <p>This certifies that</p>
          <p style="font-size:1.5rem; font-weight:600;">${partnerOne}</p>
          <p>and</p>
          <p style="font-size:1.5rem; font-weight:600;">${partnerTwo}</p>
          <p>were joined in marriage on ${weddingDate}</p>
          <p>at ${weddingLocation}</p>
          <p style="margin-top:1.5rem;">${message}</p>
          <p class="ghmo-letter-footer" style="text-align:center;">Officiant: ${officiant}</p>
        </div>
      </div>
    `;
  }
};
