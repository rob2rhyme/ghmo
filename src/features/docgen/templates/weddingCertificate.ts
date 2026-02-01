//src/features/docgen/templates/WeddingCertificates.ts
import { DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

export const weddingCertificate: DocTemplate = {
  id: "wedding-certificate",
  title: "Wedding Certificate",
  category: "Certificate",
  description: "Create a Magar Community marriage certificate with bilingual cultural acknowledgements.",
  steps: [
    {
      id: "document-details",
      title: "Document Details",
      fieldKeys: ["certificateNumber", "issueDate", "issuingAuthority", "officialSeal"]
    },
    {
      id: "recipient-parties",
      title: "Recipient/Parties",
      fieldKeys: [
        "groomName",
        "brideName",
        "brideEthnicity",
        "brideEthnicityOther",
        "maitiRepresentativeName",
        "maitiRepresentativeRole",
        "maitiRepresentativeRoleOther",
        "maitiWitnessNote"
      ]
    },
    {
      id: "event-main-content",
      title: "Event/Main Content",
      fieldKeys: ["marriageDate", "ceremonyPlace", "optionalVowsEnabled", "customBlessing"]
    },
    {
      id: "additional-details",
      title: "Additional Details",
      fieldKeys: [
        "witness1Name",
        "witness2Name",
        "officiantName",
        "officiantTitle",
        "witness1Signature",
        "witness2Signature",
        "officiantSignature"
      ]
    }
  ],
  fields: [
    { id: "groomName", label: "Groom Name / दुलहाको नाम", type: "text", placeholder: "Saurav Rai", required: true },
    { id: "brideName", label: "Bride Name / दुलहीको नाम", type: "text", placeholder: "Amrita Gurung", required: true },
    {
      id: "brideEthnicity",
      label: "Bride Ethnicity / Bride Community / दुलहीको जात/समुदाय",
      type: "select",
      options: [
        { label: "Gurung / गुरुङ", value: "Gurung|गुरुङ" },
        { label: "Tamang / तामाङ", value: "Tamang|तामाङ" },
        { label: "Sherpa / शेर्पा", value: "Sherpa|शेर्पा" },
        { label: "Rai / राई", value: "Rai|राई" },
        { label: "Limbu / लिम्बु", value: "Limbu|लिम्बु" },
        { label: "Sunuwar / सुनुवार", value: "Sunuwar|सुनुवार" },
        { label: "Yakkha / याक्खा", value: "Yakkha|याक्खा" },
        { label: "Lepcha / लेप्चा", value: "Lepcha|लेप्चा" },
        { label: "Ghale / घले", value: "Ghale|घले" },
        { label: "Thakali / थकाली", value: "Thakali|थकाली" },
        { label: "Newar / नेवार", value: "Newar|नेवार" },
        { label: "Chetri / क्षेत्री", value: "Chetri|क्षेत्री" },
        { label: "Bahun / ब्राह्मण", value: "Bahun|ब्राह्मण" },
        { label: "Tharu / थारु", value: "Tharu|थारु" },
        { label: "Madhesi / मधेसी", value: "Madhesi|मधेसी" },
        { label: "Yadav / यादव", value: "Yadav|यादव" },
        { label: "Teli / तेली", value: "Teli|तेली" },
        { label: "Kurmi / कुर्मी", value: "Kurmi|कुर्मी" },
        { label: "Musahar / मुसहर", value: "Musahar|मुसहर" },
        { label: "Chamar / चमार", value: "Chamar|चमार" },
        { label: "Dusadh/Paswan / दुसाध/पासवान", value: "Dusadh/Paswan|दुसाध/पासवान" },
        { label: "Sarki / सार्की", value: "Sarki|सार्की" },
        { label: "Kami / कामी", value: "Kami|कामी" },
        { label: "Damai/Darji / दमाई/दर्जी", value: "Damai/Darji|दमाई/दर्जी" },
        { label: "Bishwakarma / विश्वकर्मा", value: "Bishwakarma|विश्वकर्मा" },
        { label: "Dhanuk / धानुक", value: "Dhanuk|धानुक" },
        { label: "Hajam/Thakur / हजाम/ठाकुर", value: "Hajam/Thakur|हजाम/ठाकुर" },
        { label: "Jogi / जोगी", value: "Jogi|जोगी" },
        { label: "Bote / बोटे", value: "Bote|बोटे" },
        { label: "Majhi / माझी", value: "Majhi|माझी" },
        { label: "Kumal / कुमाल", value: "Kumal|कुमाल" },
        { label: "Danuwar / दानुवार", value: "Danuwar|दानुवार" },
        { label: "Chepang / चेपाङ", value: "Chepang|चेपाङ" },
        { label: "Raji / राजी", value: "Raji|राजी" },
        { label: "Hayu / हायु", value: "Hayu|हायु" },
        { label: "Thami / थामी", value: "Thami|थामी" },
        { label: "Bhujel / भुजेल", value: "Bhujel|भुजेल" },
        { label: "Pahari / पहाडी", value: "Pahari|पहाडी" },
        { label: "Jirel / जिरेल", value: "Jirel|जिरेल" },
        { label: "Walung / वालुङ", value: "Walung|वालुङ" },
        { label: "Khas / खस", value: "Khas|खस" },
        { label: "Other / अन्य", value: "Other|अन्य" }
      ]
    },
    {
      id: "brideEthnicityOther",
      label: "If Other, specify / अन्य भए लेख्नुहोस्",
      type: "text",
      placeholder: "उदाहरण: थकाली / Thakali"
    },
    {
      id: "maitiRepresentativeName",
      label: "Maiti Representative Name / माईती प्रतिनिधि नाम",
      type: "text",
      placeholder: "Elder Name"
    },
    {
      id: "maitiRepresentativeRole",
      label: "Maiti Role / माईतीको भूमिका",
      type: "select",
      options: [
        { label: "President / अध्यक्ष", value: "President|अध्यक्ष" },
        { label: "Vice President / उपाध्यक्ष", value: "Vice President|उपाध्यक्ष" },
        { label: "Senior Vice President / वरिष्ठ उपाध्यक्ष", value: "Senior Vice President|वरिष्ठ उपाध्यक्ष" },
        { label: "General Secretary / महासचिव", value: "General Secretary|महासचिव" },
        { label: "Secretary / सचिव", value: "Secretary|सचिव" },
        { label: "Joint Secretary / सह–सचिव", value: "Joint Secretary|सह–सचिव" },
        { label: "Treasurer / कोषाध्यक्ष", value: "Treasurer|कोषाध्यक्ष" },
        { label: "Joint Treasurer / सह–कोषाध्यक्ष", value: "Joint Treasurer|सह–कोषाध्यक्ष" },
        { label: "Chief Advisor / मुख्य सल्लाहकार", value: "Chief Advisor|मुख्य सल्लाहकार" },
        { label: "Advisor / सल्लाहकार", value: "Advisor|सल्लाहकार" },
        { label: "General Member / साधारण सदस्य", value: "General Member|साधारण सदस्य" },
        { label: "Executive Member / कार्यसमिति सदस्य", value: "Executive Member|कार्यसमिति सदस्य" },
        { label: "Board Member / बोर्ड सदस्य", value: "Board Member|बोर्ड सदस्य" },
        { label: "Program Coordinator / कार्यक्रम संयोजक", value: "Program Coordinator|कार्यक्रम संयोजक" },
        { label: "Cultural Coordinator / सांस्कृतिक संयोजक", value: "Cultural Coordinator|सांस्कृतिक संयोजक" },
        { label: "Youth Coordinator / युवा संयोजक", value: "Youth Coordinator|युवा संयोजक" },
        { label: "Women’s Coordinator / महिला संयोजक", value: "Women’s Coordinator|महिला संयोजक" },
        { label: "Community Elder / समुदायका जेष्ठ", value: "Community Elder|समुदायका जेष्ठ" },
        { label: "Guardian / अभिभावक", value: "Guardian|अभिभावक" },
        { label: "Religious/Cultural Priest / पुजारी/धार्मिक अगुवा", value: "Religious/Cultural Priest|पुजारी/धार्मिक अगुवा" },
        { label: "Event Chair / कार्यक्रम संयोजक (Chair)", value: "Event Chair|कार्यक्रम संयोजक (Chair)" },
        { label: "Volunteer Lead / स्वयंसेवक संयोजक", value: "Volunteer Lead|स्वयंसेवक संयोजक" },
        { label: "Other / अन्य", value: "Other|अन्य" }
      ],
      defaultValue: "Community Elder|समुदायका जेष्ठ"
    },
    {
      id: "maitiRepresentativeRoleOther",
      label: "If Other Role, specify / अन्य भूमिका भए लेख्नुहोस्",
      type: "text",
      placeholder: "उदाहरण: Cultural Advisor / सांस्कृतिक सल्लाहकार"
    },
    {
      id: "maitiWitnessNote",
      label: "Maiti Acknowledgement (Optional) / माईती स्वीकृति (वैकल्पिक)",
      type: "textarea",
      rows: 3
    },
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
    const organizationName =
      escapeHtml(inputs.organizationName) || "Greater Harrisburg Magar Organization";
    const emptyLine = "____________________________________";
    const groomName = escapeHtml(inputs.groomName) || emptyLine;
    const brideName = escapeHtml(inputs.brideName) || emptyLine;
    const brideEthnicityRaw = escapeHtml(inputs.brideEthnicity) || "";
    const brideEthnicityOther = escapeHtml(inputs.brideEthnicityOther) || "";
    const maitiRepresentativeName = escapeHtml(inputs.maitiRepresentativeName) || emptyLine;
    const maitiRoleRaw = escapeHtml(inputs.maitiRepresentativeRole) || "";
    const maitiRoleOther = escapeHtml(inputs.maitiRepresentativeRoleOther) || "";
    const maitiWitnessNoteRaw = escapeHtml(inputs.maitiWitnessNote || "").trim();
    const maitiWitnessNoteHtml = maitiWitnessNoteRaw ? maitiWitnessNoteRaw.replace(/\n/g, "<br />") : "";
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
    const witness1SignatureImage = escapeHtml(inputs.witness1SignatureImage);
    const witness2Name = escapeHtml(inputs.witness2Name) || emptyLine;
    const witness2Signature = escapeHtml(inputs.witness2Signature) || emptyLine;
    const witness2SignatureImage = escapeHtml(inputs.witness2SignatureImage);
    const officiantName = escapeHtml(inputs.officiantName) || emptyLine;
    const officiantTitle = escapeHtml(inputs.officiantTitle) || emptyLine;
    const officiantSignature = escapeHtml(inputs.officiantSignature) || emptyLine;
    const officiantSignatureImage = escapeHtml(inputs.officiantSignatureImage);
    const issuingAuthoritySignatureImage = escapeHtml(inputs.issuingAuthoritySignatureImage);
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

    let brideEthnicityEn = emptyLine;
    let brideEthnicityNp = emptyLine;
    if (brideEthnicityRaw.includes("|")) {
      const [en, np] = brideEthnicityRaw.split("|");
      brideEthnicityEn = en?.trim() || emptyLine;
      brideEthnicityNp = np?.trim() || emptyLine;
    } else if (brideEthnicityRaw) {
      brideEthnicityEn = brideEthnicityRaw;
      brideEthnicityNp = brideEthnicityRaw;
    }
    if (brideEthnicityRaw === "Other|अन्य" && brideEthnicityOther) {
      brideEthnicityEn = brideEthnicityOther;
      brideEthnicityNp = brideEthnicityOther;
    }
    let maitiRoleEn = emptyLine;
    let maitiRoleNp = emptyLine;
    if (maitiRoleRaw.includes("|")) {
      const [en, np] = maitiRoleRaw.split("|");
      maitiRoleEn = en?.trim() || emptyLine;
      maitiRoleNp = np?.trim() || emptyLine;
    } else if (maitiRoleRaw) {
      maitiRoleEn = maitiRoleRaw;
      maitiRoleNp = maitiRoleRaw;
    }
    if (maitiRoleRaw === "Other|अन्य" && maitiRoleOther.trim()) {
      maitiRoleEn = maitiRoleOther.trim();
      maitiRoleNp = maitiRoleOther.trim();
    }
    const witness1SignatureContent = witness1SignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${witness1SignatureImage}" alt="Witness 1 signature" />`
      : witness1Signature;
    const witness2SignatureContent = witness2SignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${witness2SignatureImage}" alt="Witness 2 signature" />`
      : witness2Signature;
    const officiantSignatureContent = officiantSignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${officiantSignatureImage}" alt="Officiant signature" />`
      : officiantSignature;
    const issuingAuthoritySealContent = issuingAuthoritySignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${issuingAuthoritySignatureImage}" alt="Issuing authority seal" />`
      : officialSeal;

    return `
      <div class="doc-page">
        <style>
          .doc-page {
            width: 8.5in;
            max-width: 100%;
            min-height: 100%;
            box-sizing: border-box;
            padding: 0;
            background: transparent;
            color: #111;
          }
          .doc-page,
          .doc-page * {
            overflow-wrap: anywhere;
            word-break: break-word;
            hyphens: auto;
          }
          .ghmo-cert {
            font-family: "Georgia", "Times New Roman", serif;
            color: #111;
            line-height: 1.6;
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
            margin: 0 0 0.45rem;
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
            align-items: end;
          }
          .ghmo-cert-label {
            font-weight: 600;
          }
          .ghmo-cert-value {
            border-bottom: 1px solid #3e4c59;
            min-height: 1.35rem;
            padding-bottom: 0.18rem;
            display: flex;
            align-items: flex-end;
            line-height: 1.2;
          }
          .ghmo-cert-note {
            font-size: 0.9rem;
            color: #52606d;
          }
          .ghmo-cert-blessing {
            border: 1px solid #e4e7eb;
            background: rgba(248, 249, 251, 0.85);
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
            min-height: 1.35rem;
            padding-bottom: 0.18rem;
            display: flex;
            align-items: flex-end;
            line-height: 1.2;
          }
          .ghmo-cert-signature-image {
            display: block;
            max-height: 1.6rem;
            max-width: 100%;
            object-fit: contain;
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
              margin: 0.6in 0.7in 0.85in;
            }
            .doc-page {
              padding: 0;
            }
            .ghmo-cert {
              font-size: 0.92rem;
            }
            .ghmo-cert-value,
            .ghmo-cert-line {
              padding-bottom: 0.16rem;
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
          <p class="ghmo-letter-meta ghmo-cert-brand">${organizationName}</p>
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
            <div class="ghmo-cert-row">
              <span class="ghmo-cert-label">Bride Community/Ethnicity:</span>
              <span class="ghmo-cert-value">${brideEthnicityEn}</span>
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
            <p class="ghmo-cert-subheading">Community Recognition (Interethnic Marriage)</p>
            <p class="ghmo-cert-paragraph">
              In recognition of this interethnic union, the ${organizationName} acknowledges and affirms that the Bride, originally from the ${brideEthnicityEn} community, is welcomed and culturally recognized within the Magar community through this marriage, in accordance with Magar customs, mutual consent, and community acceptance.
            </p>
            <p class="ghmo-cert-paragraph">
              This acknowledgment was witnessed in the presence of the designated ‘Maiti’ representative from the Magar
              community: ${maitiRepresentativeName} (${maitiRoleEn}).
            </p>
            <p class="ghmo-cert-paragraph ghmo-cert-note">
              Note: ‘Maiti’ refers to the bride’s parental home; in community ceremonies, a respected representative may
              stand in that role.
            </p>
            ${
              maitiWitnessNoteHtml
                ? `<p class="ghmo-cert-paragraph ghmo-cert-note">${maitiWitnessNoteHtml}</p>`
                : ""
            }
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
            <div class="ghmo-cert-row">
              <span class="ghmo-cert-label">दुलहीको जात/समुदाय:</span>
              <span class="ghmo-cert-value">${brideEthnicityNp}</span>
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
            <p class="ghmo-cert-subheading">सामुदायिक मान्यता (अन्तरजातीय/अन्तरसमुदाय विवाह)</p>
            <p class="ghmo-cert-paragraph">
              यस अन्तरजातीय/अन्तरसमुदाय विवाहको सन्दर्भमा, ${organizationName} (GHMO) ले ${brideEthnicityNp} समुदायकी दुलहीलाई विवाहपश्चात मगर समुदायमा सम्मानपूर्वक स्वागत तथा सांस्कृतिक मान्यता प्रदान गरिएको प्रमाणित गर्दछ, जुन मगर परम्परा, आपसी सहमति र समुदायिक स्वीकारोक्तिअनुसार सम्पन्न भएको हो।
            </p>
            <p class="ghmo-cert-paragraph">
              यो मान्यता मगर समुदायका ‘माईती’ प्रतिनिधि ${maitiRepresentativeName} (${maitiRoleNp}) को
              उपस्थितिमा सम्पन्न गरिएको हो।
            </p>
            <p class="ghmo-cert-paragraph ghmo-cert-note">
              टिप्पणी: ‘माईती’ भन्नाले दुलहीको मायतीघर/जन्मघर जनाउँछ; समुदायिक समारोहमा प्रतिनिधि व्यक्तिले सो भूमिका
              निर्वाह गर्न सक्छ।
            </p>
            ${
              maitiWitnessNoteHtml
                ? `<p class="ghmo-cert-paragraph ghmo-cert-note">${maitiWitnessNoteHtml}</p>`
                : ""
            }
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
                <div class="ghmo-cert-line">${witness1SignatureContent}</div>
              </div>
              <div class="ghmo-cert-signature-block">
                <p class="ghmo-cert-paragraph"><strong>2.</strong> Name / नाम:</p>
                <div class="ghmo-cert-line">${witness2Name}</div>
                <p class="ghmo-cert-paragraph" style="margin-top:0.6rem;">Signature / हस्ताक्षर:</p>
                <div class="ghmo-cert-line">${witness2SignatureContent}</div>
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
              <span class="ghmo-cert-value">${officiantSignatureContent}</span>
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
              <span class="ghmo-cert-value">${issuingAuthoritySealContent}</span>
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
