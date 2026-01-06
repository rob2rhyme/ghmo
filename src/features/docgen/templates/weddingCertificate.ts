//src/features/docgen/templates/WeddingCertificates.ts
import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const weddingCertificate: DocTemplate = {
  id: "wedding-certificate",
  title: "Wedding Certificate",
  category: "Certificate",
  description: "Create a Magar Community marriage certificate with bilingual cultural acknowledgements.",
  fields: [
    { id: "groomName", label: "Groom Name / दुलहाको नाम", type: "text", placeholder: "Saurav Rai", required: true },
    { id: "brideName", label: "Bride Name / दुलहीको नाम", type: "text", placeholder: "Amrita Gurung", required: true },
    { id: "marriageDate", label: "Marriage Date / विवाह मिति", type: "date", required: true },
    { id: "ceremonyPlace", label: "Place of Ceremony / विवाह स्थान", type: "text", placeholder: "Glenwood Garden" },
    {
      id: "issuingAuthority",
      label: "Issuing Authority / जारी गर्ने निकाय",
      type: "text",
      placeholder: "Magar Community Council / Magar Samaj / Association Name",
      defaultValue: "Magar Community Council / Magar Samaj / Association Name"
    },
    { id: "certificateNumber", label: "Certificate Number / प्रमाणपत्र नं.", type: "text", placeholder: "GHMO-2024-001" },
    { id: "issueDate", label: "Date of Issue / जारी मिति", type: "date" },
    { id: "officialSeal", label: "Official Seal / Stamp / आधिकारिक छाप", type: "text", placeholder: "Seal / Stamp" },
    { id: "witness1Name", label: "Witness 1 Name / साक्षी १ नाम", type: "text", placeholder: "Elder Name" },
    { id: "witness1Signature", label: "Witness 1 Signature / साक्षी १ हस्ताक्षर", type: "text", placeholder: "Signature" },
    { id: "witness2Name", label: "Witness 2 Name / साक्षी २ नाम", type: "text", placeholder: "Elder Name" },
    { id: "witness2Signature", label: "Witness 2 Signature / साक्षी २ हस्ताक्षर", type: "text", placeholder: "Signature" },
    { id: "officiantName", label: "Officiant Name / संस्कार सम्पन्न गराउने", type: "text", placeholder: "Justice Dipak Thapa" },
    { id: "officiantTitle", label: "Officiant Title / पद", type: "text", placeholder: "जेष्ठ, अगुवा, पुजारी" },
    { id: "officiantSignature", label: "Officiant Signature / हस्ताक्षर", type: "text", placeholder: "Signature" },
    {
      id: "optionalVowsEnabled",
      label: "Include Traditional Vows? / प्रतिज्ञा समावेश?",
      type: "checkbox",
      placeholder: "Show Traditional Vows section",
      defaultValue: "true"
    },
    {
      id: "customBlessing",
      label: "Custom Blessing (Optional) / वैकल्पिक आशीर्वाद",
      type: "textarea",
      rows: 4,
      placeholder: "Add a custom blessing (will appear in both English and मगर/नेपाली sections)."
    }
  ],
  renderHtml(inputs) {
    const emptyLine = "____________________________________";
    const groomName = escapeHtml(inputs.groomName) || emptyLine;
    const brideName = escapeHtml(inputs.brideName) || emptyLine;
    const marriageDate = formatDate(inputs.marriageDate) || emptyLine;
    const ceremonyPlace = escapeHtml(inputs.ceremonyPlace) || emptyLine;
    const issuingAuthority =
      escapeHtml(inputs.issuingAuthority) ||
      "Magar Community Council / Magar Samaj / Association Name";
    const certificateNumber = escapeHtml(inputs.certificateNumber) || emptyLine;
    const issueDate = formatDate(inputs.issueDate) || emptyLine;
    const officialSeal = escapeHtml(inputs.officialSeal) || emptyLine;
    const witness1Name = escapeHtml(inputs.witness1Name) || emptyLine;
    const witness1Signature = escapeHtml(inputs.witness1Signature) || emptyLine;
    const witness2Name = escapeHtml(inputs.witness2Name) || emptyLine;
    const witness2Signature = escapeHtml(inputs.witness2Signature) || emptyLine;
    const officiantName = escapeHtml(inputs.officiantName) || emptyLine;
    const officiantTitle = escapeHtml(inputs.officiantTitle) || emptyLine;
    const officiantSignature = escapeHtml(inputs.officiantSignature) || emptyLine;
    const optionalVowsEnabled = inputs.optionalVowsEnabled !== "false";
    const customBlessing = escapeHtml(inputs.customBlessing).trim();
    const customBlessingHtml = customBlessing ? customBlessing.replace(/\n/g, "<br />") : "";
    const englishBlessingHtml = customBlessing
      ? customBlessingHtml
      : `May this union be blessed with harmony, good health, prosperity, and mutual respect.<br />
        May the ancestors guide your path, and may your household be filled with peace, unity, and strength for generations to come.`;
    const nepaliBlessingHtml = customBlessing
      ? customBlessingHtml
      : `यस दाम्पत्य जीवनमा <strong>सुख, शान्ति, स्वास्थ्य र समृद्धि</strong> सधैं रहोस्।<br />
        पुर्ख्यौली आशीर्वादले मार्गदर्शन गरून्,<br />
        र तपाईंहरूको घर–परिवारमा <strong>एकता, समझदारी र सम्मान</strong> सधैं कायम रहोस्।`;

    return `
      <div class="doc-page">
        <style>
          .doc-page {
            width: 8.5in;
            max-width: 100%;
            min-height: 11in;
            box-sizing: border-box;
            padding: 0.6in 0.6in 0.85in;
            background: #fff;
          }
          .doc-page,
          .doc-page * {
            overflow-wrap: anywhere;
            word-break: break-word;
            hyphens: auto;
          }
          .ghmo-cert {
            font-family: "Georgia", "Times New Roman", serif;
            color: #1f2933;
            line-height: 1.55;
            font-size: 0.95rem;
            max-width: 720px;
            margin: 0 auto;
          }
          .ghmo-cert * {
            box-sizing: border-box;
          }
          .ghmo-cert-title {
            text-align: center;
            font-size: 1.7rem;
            letter-spacing: 0.1em;
            margin: 0;
          }
          .ghmo-cert-brand {
            text-align: center;
            font-size: 0.82rem;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            color: #5f6c72;
            margin: 0.2rem 0 0.8rem;
          }
          .ghmo-cert-divider {
            height: 1px;
            background: #cbd2d9;
            margin: 0.6rem 0 1rem;
          }
          .ghmo-cert-body {
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .ghmo-cert-section {
            padding: 0.2rem 0;
          }
          .ghmo-cert-heading {
            font-size: 1.05rem;
            font-weight: 700;
            margin: 0 0 0.5rem;
            break-after: avoid;
            page-break-after: avoid;
          }
          .ghmo-cert-subheading {
            font-weight: 600;
            margin: 0.4rem 0 0.25rem;
          }
          .ghmo-cert-paragraph {
            margin: 0 0 0.6rem;
          }
          .ghmo-cert-row {
            display: grid;
            grid-template-columns: minmax(0, 1.1fr) minmax(0, 1.6fr);
            gap: 0.5rem;
            margin-bottom: 0.4rem;
            align-items: baseline;
          }
          .ghmo-cert-label {
            font-weight: 600;
          }
          .ghmo-cert-value {
            border-bottom: 1px solid #3e4c59;
            min-height: 1.2rem;
            padding-bottom: 0.1rem;
            display: block;
          }
          .ghmo-cert-note {
            font-size: 0.9rem;
            color: #52606d;
          }
          .ghmo-cert-blessing {
            border: 1px solid #e4e7eb;
            background: #f8f9fb;
            border-radius: 8px;
            padding: 0.75rem;
          }
          .ghmo-cert-signature-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.75rem 1.5rem;
          }
          .ghmo-cert-signature-block {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .ghmo-cert-line {
            border-bottom: 1px solid #3e4c59;
            min-height: 1.2rem;
            padding-bottom: 0.15rem;
          }
          .page-break {
            break-before: page;
            page-break-before: always;
          }
          .avoid-break {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          @media (max-width: 640px) {
            .ghmo-cert {
              font-size: 0.9rem;
            }
            .ghmo-cert-row {
              grid-template-columns: 1fr;
            }
            .ghmo-cert-signature-grid {
              grid-template-columns: 1fr;
            }
          }
          @media screen {
            .doc-page {
              width: 100%;
              min-height: auto;
            }
          }
          @media print {
            @page {
              margin: 0.5in 0.6in 0.75in;
            }
            .doc-page {
              padding: 0;
            }
            .ghmo-cert {
              font-size: 0.92rem;
            }
            .ghmo-cert-heading {
              break-after: avoid;
              page-break-after: avoid;
            }
            .ghmo-cert-signature-block {
              break-inside: avoid;
              page-break-inside: avoid;
            }
          }
        </style>
        <div class="ghmo-cert">
          <p class="ghmo-letter-headline ghmo-cert-title">मगर समुदाय विवाह प्रमाणपत्र</p>
          <p class="ghmo-letter-meta ghmo-cert-brand">Greater Harrisburg Magar Organization</p>
          <div class="ghmo-cert-divider"></div>
          <div class="ghmo-letter-body ghmo-cert-body">
            <section class="ghmo-cert-section">
              <p class="ghmo-cert-heading">English Section</p>
              <p class="ghmo-cert-paragraph">
                This is to formally certify that, in accordance with the <strong>customs, traditions, and ancestral
                practices of the Magar Community</strong>, the marriage union between:
              </p>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Name of Groom:</span>
                <span class="ghmo-cert-value">${groomName}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Name of Bride:</span>
                <span class="ghmo-cert-value">${brideName}</span>
              </div>
              <p class="ghmo-cert-paragraph">
                was solemnized and accepted as a lawful and honorable union within the Magar cultural tradition.
              </p>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Date of Marriage:</span>
                <span class="ghmo-cert-value">${marriageDate}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Place of Ceremony:</span>
                <span class="ghmo-cert-value">${ceremonyPlace}</span>
              </div>
              <p class="ghmo-cert-paragraph">
                The marriage was conducted in the presence of <strong>family members, community elders, and respected
                witnesses</strong>, following Magar rites, mutual consent, and cultural responsibilities. The Magar
                community recognizes this union as a sacred lifelong partnership based on respect, cooperation, and
                shared duty.
              </p>
              <p class="ghmo-cert-paragraph ghmo-cert-note">
                This certificate serves as an <strong>official record of community recognition</strong> and does not
                replace civil or governmental marriage registration unless permitted by law.
              </p>
            </section>

            <section class="ghmo-cert-section">
              <p class="ghmo-cert-heading">मगर / नेपाली (Magar Cultural Language Section)</p>
              <p class="ghmo-cert-paragraph">
                यो प्रमाणित गरिन्छ कि मगर समुदायका <strong>परम्परा, संस्कार, र पुर्ख्यौली चलनअनुसार</strong>, निम्न
                दम्पतीको विवाह सम्पन्न भएको छ:
              </p>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">दुलहाको नाम:</span>
                <span class="ghmo-cert-value">${groomName}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">दुलहीको नाम:</span>
                <span class="ghmo-cert-value">${brideName}</span>
              </div>
              <p class="ghmo-cert-paragraph">उक्त विवाह:</p>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">विवाह मिति:</span>
                <span class="ghmo-cert-value">${marriageDate}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">विवाह सम्पन्न स्थान:</span>
                <span class="ghmo-cert-value">${ceremonyPlace}</span>
              </div>
              <p class="ghmo-cert-paragraph">
                मा <strong>परिवारका सदस्यहरू, समाजका जेष्ठ अगुवा तथा साक्षीहरूको उपस्थितिमा</strong>, मगर जातीय संस्कार र
                आपसी सहमतिअनुसार सम्पन्न गरिएको हो।
              </p>
              <p class="ghmo-cert-paragraph">
                मगर समुदायले यस वैवाहिक सम्बन्धलाई <strong>पवित्र, सम्मानजनक र आजीवन साथ–सहयोगको बन्धन</strong>का रूपमा
                स्वीकार गरेको छ।
              </p>
              <p class="ghmo-cert-paragraph ghmo-cert-note">
                यो प्रमाणपत्र <strong>सामुदायिक तथा सांस्कृतिक मान्यताको अभिलेख</strong> हो। यसले कानुनी वा सरकारी विवाह
                दर्तालाई प्रतिस्थापन गर्दैन।
              </p>
            </section>

            <section class="ghmo-cert-section ghmo-cert-blessing avoid-break">
              <p class="ghmo-cert-heading">Traditional Magar Blessing</p>
              <p class="ghmo-cert-subheading">(सामुदायिक आशीर्वाद)</p>
              <p class="ghmo-cert-subheading">English:</p>
              <p class="ghmo-cert-paragraph">${englishBlessingHtml}</p>
              <p class="ghmo-cert-subheading">मगर / नेपाली:</p>
              <p class="ghmo-cert-paragraph">${nepaliBlessingHtml}</p>
            </section>

            ${
              optionalVowsEnabled
                ? `
            <section class="ghmo-cert-section">
              <p class="ghmo-cert-heading">Traditional Vows (Optional)</p>
              <p class="ghmo-cert-subheading">(परम्परागत प्रतिज्ञा – वैकल्पिक)</p>
              <p class="ghmo-cert-subheading">English:</p>
              <p class="ghmo-cert-paragraph">
                We vow to walk together with honesty, respect our families and traditions, and support one another in
                all stages of life.
              </p>
              <p class="ghmo-cert-subheading">मगर / नेपाली:</p>
              <p class="ghmo-cert-paragraph">
                हामी एक–अर्काप्रति <strong>इमानदारी, सम्मान र विश्वास</strong> कायम राख्ने, परिवार र परम्पराको आदर गर्ने,
                र जीवनका प्रत्येक चरणमा <strong>साथ र सहयोग गर्ने</strong> प्रतिज्ञा गर्दछौं।
              </p>
            </section>
            `
                : ""
            }

            <section class="ghmo-cert-section avoid-break">
              <p class="ghmo-cert-heading">Witnesses / साक्षीहरू (Community Elders)</p>
              <div class="ghmo-cert-signature-grid">
                <div class="ghmo-cert-signature-block">
                  <p class="ghmo-cert-paragraph"><strong>1.</strong> Name / नाम:</p>
                  <div class="ghmo-cert-line">${witness1Name}</div>
                  <p class="ghmo-cert-paragraph" style="margin-top:0.6rem;">Signature / हस्ताक्षर:</p>
                  <div class="ghmo-cert-line">${witness1Signature}</div>
                </div>
                <div class="ghmo-cert-signature-block">
                  <p class="ghmo-cert-paragraph"><strong>2.</strong> Name / नाम:</p>
                  <div class="ghmo-cert-line">${witness2Name}</div>
                  <p class="ghmo-cert-paragraph" style="margin-top:0.6rem;">Signature / हस्ताक्षर:</p>
                  <div class="ghmo-cert-line">${witness2Signature}</div>
                </div>
              </div>
            </section>

            <section class="ghmo-cert-section avoid-break">
              <p class="ghmo-cert-heading">Officiant / Cultural Authority</p>
              <p class="ghmo-cert-subheading"><strong>संस्कार सम्पन्न गराउने व्यक्ति</strong></p>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Name / नाम:</span>
                <span class="ghmo-cert-value">${officiantName}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Title / पद (जेष्ठ, अगुवा, पुजारी):</span>
                <span class="ghmo-cert-value">${officiantTitle}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Signature / हस्ताक्षर:</span>
                <span class="ghmo-cert-value">${officiantSignature}</span>
              </div>
            </section>

            <section class="ghmo-cert-section avoid-break">
              <p class="ghmo-cert-heading">Issuing Authority</p>
              <p class="ghmo-cert-subheading"><strong>जारी गर्ने निकाय</strong></p>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Issued by / जारीकर्ता:</span>
                <span class="ghmo-cert-value">${issuingAuthority}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Official Seal / Stamp:</span>
                <span class="ghmo-cert-value">${officialSeal}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Date of Issue / जारी मिति:</span>
                <span class="ghmo-cert-value">${issueDate}</span>
              </div>
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">Certificate Number:</span>
                <span class="ghmo-cert-value">${certificateNumber}</span>
              </div>
            </section>
          </div>
        </div>
      </div>
    `;
  }
};
