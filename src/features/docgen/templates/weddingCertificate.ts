import { DocField, DocFieldOption, DocTemplate } from "../types";
import { escapeHtml, formatDate } from "../render/renderTemplateHtml";

const ISSUER = "Greater Harrisburg Magar Organization";
const OTHER = "Other|अन्य";

/**
 * Communities for the bride's and groom's community fields. Magar comes first. The rest of the list is kept as it was
 * until the board reviews it with community elders.
 *
 * An option's value is what saved documents store, so values never change; the certificate prints the option's
 * current label ("English / नेपाली"). That is how "Bahun / बाहुन" and "Chhetri / क्षेत्री" print correctly on
 * documents saved with the old labels.
 */
const COMMUNITY_OPTIONS: DocFieldOption[] = [
  { label: "Magar / मगर", value: "Magar|मगर" },
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
  { label: "Chhetri / क्षेत्री", value: "Chetri|क्षेत्री" },
  { label: "Bahun / बाहुन", value: "Bahun|ब्राह्मण" },
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
  { label: "Other (type it) / अन्य (लेख्नुहोस्)", value: OTHER }
];

const FIELDS: DocField[] = [
  { id: "groomName", label: "Groom's name / दुलहाको नाम", type: "text", placeholder: "Saurav Thapa Magar", required: true },
  {
    id: "groomCommunity",
    label: "Groom's community / दुलहाको समुदाय",
    type: "select",
    options: COMMUNITY_OPTIONS,
    defaultValue: "Magar|मगर"
  },
  {
    id: "groomCommunityOther",
    label: "If other, type the groom's community / अन्य भए लेख्नुहोस्",
    type: "text",
    placeholder: "Thakuri / ठकुरी"
  },
  { id: "brideName", label: "Bride's name / दुलहीको नाम", type: "text", placeholder: "Amrita Pun", required: true },
  {
    id: "brideEthnicity",
    label: "Bride's community / दुलहीको समुदाय",
    type: "select",
    hint: "Optional. When the bride's and groom's communities differ, the certificate adds a community recognition section.",
    options: COMMUNITY_OPTIONS
  },
  {
    id: "brideEthnicityOther",
    label: "If other, type the bride's community / अन्य भए लेख्नुहोस्",
    type: "text",
    placeholder: "Thakuri / ठकुरी"
  },
  {
    id: "maitiRepresentativeName",
    label: "Maiti representative's name / माइती प्रतिनिधिको नाम",
    type: "text",
    placeholder: "Elder's name",
    hint: "Printed only when the bride's and groom's communities differ."
  },
  {
    id: "maitiRepresentativeRole",
    label: "Maiti representative's role / माइतीको भूमिका",
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
      // The value keeps the old spelling (saved documents store it); the certificate prints the label.
      { label: "Community Elder / समुदायका ज्येष्ठ", value: "Community Elder|समुदायका जेष्ठ" },
      { label: "Guardian / अभिभावक", value: "Guardian|अभिभावक" },
      { label: "Religious/Cultural Priest / पुजारी/धार्मिक अगुवा", value: "Religious/Cultural Priest|पुजारी/धार्मिक अगुवा" },
      { label: "Event Chair / कार्यक्रम अध्यक्ष", value: "Event Chair|कार्यक्रम संयोजक (Chair)" },
      { label: "Volunteer Lead / स्वयंसेवक संयोजक", value: "Volunteer Lead|स्वयंसेवक संयोजक" },
      { label: "Other (type it) / अन्य (लेख्नुहोस्)", value: OTHER }
    ],
    defaultValue: "Community Elder|समुदायका जेष्ठ"
  },
  {
    id: "maitiRepresentativeRoleOther",
    label: "If other, type the role / अन्य भूमिका भए लेख्नुहोस्",
    type: "text",
    placeholder: "Cultural Advisor / सांस्कृतिक सल्लाहकार"
  },
  {
    id: "maitiWitnessNote",
    label: "Maiti acknowledgment (optional) / माइती स्वीकृति (वैकल्पिक)",
    type: "textarea",
    rows: 3
  },
  { id: "marriageDate", label: "Marriage date / विवाह मिति", type: "date", required: true },
  { id: "ceremonyPlace", label: "Place of ceremony / विवाह स्थान", type: "text", placeholder: "Glenwood Garden, Harrisburg" },
  {
    id: "issuingAuthority",
    label: "Issued by / जारी गर्ने निकाय",
    type: "text",
    placeholder: ISSUER,
    defaultValue: ISSUER
  },
  { id: "certificateNumber", label: "Certificate number / प्रमाणपत्र नं.", type: "text", placeholder: "GHMO-2026-001" },
  { id: "issueDate", label: "Date of issue / जारी मिति", type: "date" },
  { id: "officialSeal", label: "Official seal or stamp / आधिकारिक छाप", type: "text", placeholder: "Seal / Stamp" },
  { id: "witness1Name", label: "Witness 1 name / साक्षी १ नाम", type: "text", placeholder: "Elder's name" },
  { id: "witness1Signature", label: "Witness 1 signature / साक्षी १ हस्ताक्षर", type: "text", placeholder: "Signature" },
  { id: "witness2Name", label: "Witness 2 name / साक्षी २ नाम", type: "text", placeholder: "Elder's name" },
  { id: "witness2Signature", label: "Witness 2 signature / साक्षी २ हस्ताक्षर", type: "text", placeholder: "Signature" },
  { id: "officiantName", label: "Officiant's name / संस्कार सम्पन्न गराउने", type: "text", placeholder: "Dipak Thapa Magar" },
  { id: "officiantTitle", label: "Officiant's title / पद", type: "text", placeholder: "ज्येष्ठ, अगुवा, पुजारी" },
  { id: "officiantSignature", label: "Officiant signature / हस्ताक्षर", type: "text", placeholder: "Signature" },
  {
    id: "optionalVowsEnabled",
    label: "Include traditional vows? / प्रतिज्ञा समावेश?",
    type: "checkbox",
    placeholder: "Show the traditional vows section",
    defaultValue: "true"
  },
  {
    id: "customBlessing",
    label: "Custom blessing (optional) / वैकल्पिक आशीर्वाद",
    type: "textarea",
    rows: 4,
    placeholder: "Add your own blessing. It replaces the traditional one in both the English and Nepali sections."
  }
];

type Choice = { en: string; np: string };

/**
 * What a choice field prints, in English and Nepali: the chosen option's current label, or the typed text for
 * "Other". Empty fields fall back to the field's default; null when there is nothing to print.
 */
function choice(inputs: Record<string, string>, fieldId: string, otherFieldId?: string): Choice | null {
  const field = FIELDS.find(f => f.id === fieldId);
  const raw = (inputs[fieldId] ?? "").trim() || field?.defaultValue || "";
  if (!raw) return null;
  if (raw === OTHER) {
    const typed = escapeHtml((otherFieldId ? inputs[otherFieldId] : "")?.trim());
    return typed ? { en: typed, np: typed } : null;
  }
  const option = field?.options?.find(o => o.value === raw);
  const [en, np] = option ? option.label.split(" / ") : raw.split("|");
  const english = escapeHtml(en?.trim());
  if (!english) return null;
  return { en: english, np: escapeHtml(np?.trim()) || english };
}

export const weddingCertificate: DocTemplate = {
  id: "wedding-certificate",
  version: 2,
  title: "Wedding certificate",
  category: "Certificate",
  description: "A marriage certificate in English and Nepali, signed by witnesses and the officiant, with a code anyone can check.",
  steps: [
    {
      id: "document-details",
      title: "Details",
      fieldKeys: ["certificateNumber", "issueDate", "issuingAuthority", "officialSeal"]
    },
    {
      id: "recipient-parties",
      title: "Couple",
      fieldKeys: [
        "groomName",
        "groomCommunity",
        "groomCommunityOther",
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
      title: "Ceremony",
      fieldKeys: ["marriageDate", "ceremonyPlace", "optionalVowsEnabled", "customBlessing"]
    },
    {
      id: "additional-details",
      title: "Witnesses",
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
  fields: FIELDS,
  renderHtml(inputs) {
    const organizationName = escapeHtml(inputs.organizationName) || ISSUER;
    const emptyLine = "____________________________________";
    const groomName = escapeHtml(inputs.groomName) || emptyLine;
    const brideName = escapeHtml(inputs.brideName) || emptyLine;
    const groomCommunity = choice(inputs, "groomCommunity", "groomCommunityOther");
    const brideCommunity = choice(inputs, "brideEthnicity", "brideEthnicityOther");
    // The community recognition section prints only for a marriage between two different communities.
    const interethnic = Boolean(
      groomCommunity && brideCommunity && groomCommunity.en.toLowerCase() !== brideCommunity.en.toLowerCase()
    );
    const maitiRepresentativeName = escapeHtml(inputs.maitiRepresentativeName) || emptyLine;
    const maitiRole = choice(inputs, "maitiRepresentativeRole", "maitiRepresentativeRoleOther");
    const maitiRoleEn = maitiRole?.en ?? emptyLine;
    const maitiRoleNp = maitiRole?.np ?? emptyLine;
    const maitiWitnessNoteRaw = escapeHtml(inputs.maitiWitnessNote || "").trim();
    const maitiWitnessNoteHtml = maitiWitnessNoteRaw ? maitiWitnessNoteRaw.replace(/\n/g, "<br />") : "";
    const marriageDate = formatDate(inputs.marriageDate) || emptyLine;
    const ceremonyPlace = escapeHtml(inputs.ceremonyPlace) || emptyLine;
    const issuingAuthority = escapeHtml(inputs.issuingAuthority?.trim()) || ISSUER;
    const certificateNumber = escapeHtml(inputs.certificateNumber) || emptyLine;
    const issueDate = formatDate(inputs.issueDate) || emptyLine;
    const officialSeal = escapeHtml(inputs.officialSeal) || emptyLine;
    const verificationQr = escapeHtml(inputs.verificationQrImage);
    const verificationUrl = escapeHtml(inputs.verificationUrl);
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

    const witness1SignatureContent = witness1SignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${witness1SignatureImage}" alt="Witness 1 signature" />`
      : witness1Signature;
    const witness2SignatureContent = witness2SignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${witness2SignatureImage}" alt="Witness 2 signature" />`
      : witness2Signature;
    const officiantSignatureContent = officiantSignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${officiantSignatureImage}" alt="Officiant signature" />`
      : officiantSignature;
    // The issuer signs on its own line; the seal line stays free for the stamp.
    const issuerSignatureContent = issuingAuthoritySignatureImage
      ? `<img class="ghmo-cert-signature-image" src="${issuingAuthoritySignatureImage}" alt="Issuer signature" />`
      : emptyLine;

    const row = (label: string, value: string) => `
              <div class="ghmo-cert-row">
                <span class="ghmo-cert-label">${label}</span>
                <span class="ghmo-cert-value">${value}</span>
              </div>`;
    const maitiNoteHtml = maitiWitnessNoteHtml ? `<p class="ghmo-cert-paragraph ghmo-cert-note">${maitiWitnessNoteHtml}</p>` : "";

    const englishCommunityRows = brideCommunity
      ? row("Groom's community:", groomCommunity?.en ?? emptyLine) + row("Bride's community:", brideCommunity.en)
      : "";
    const nepaliCommunityRows = brideCommunity
      ? row("दुलहाको समुदाय:", groomCommunity?.np ?? emptyLine) + row("दुलहीको समुदाय:", brideCommunity.np)
      : "";

    const englishRecognition =
      interethnic && groomCommunity && brideCommunity
        ? `
              <p class="ghmo-cert-subheading">Community recognition (interethnic marriage)</p>
              <p class="ghmo-cert-paragraph">
                This marriage joins the ${groomCommunity.en} and ${brideCommunity.en} communities. The ${organizationName}
                welcomes the couple and recognizes their union within the Magar community, in keeping with Magar custom,
                mutual consent and community acceptance.
              </p>
              <p class="ghmo-cert-paragraph">
                This recognition was witnessed by the designated Maiti representative from the Magar community:
                ${maitiRepresentativeName} (${maitiRoleEn}).
              </p>
              <p class="ghmo-cert-paragraph ghmo-cert-note">
                Note: Maiti means the bride’s parental home. In community ceremonies, a respected representative may stand
                in that role.
              </p>
              ${maitiNoteHtml}`
        : "";
    const nepaliRecognition =
      interethnic && groomCommunity && brideCommunity
        ? `
              <p class="ghmo-cert-subheading">सामुदायिक मान्यता (अन्तरजातीय विवाह)</p>
              <p class="ghmo-cert-paragraph">
                यो विवाहले ${groomCommunity.np} र ${brideCommunity.np} समुदायलाई जोडेको छ। ${organizationName} (GHMO) ले
                मगर परम्परा, आपसी सहमति र सामुदायिक स्वीकृतिअनुसार यस दम्पतीलाई सम्मानपूर्वक स्वागत गर्दै मगर समुदायभित्र
                यो विवाहलाई मान्यता दिन्छ।
              </p>
              <p class="ghmo-cert-paragraph">
                यो मान्यता मगर समुदायका ‘माइती’ प्रतिनिधि ${maitiRepresentativeName} (${maitiRoleNp}) को उपस्थितिमा
                सम्पन्न गरिएको हो।
              </p>
              <p class="ghmo-cert-paragraph ghmo-cert-note">
                टिप्पणी: ‘माइती’ भन्नाले दुलहीको माइतीघर (जन्मघर) जनाउँछ। सामुदायिक समारोहमा सम्मानित प्रतिनिधिले सो
                भूमिका निर्वाह गर्न सक्नुहुन्छ।
              </p>
              ${maitiNoteHtml}`
        : "";

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
          .ghmo-cert-title-np {
            text-align: center;
            font-size: 1.2rem;
            margin: 0.2rem 0 0;
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
          .ghmo-cert-qr {
            display: block;
            width: 3.2rem;
            height: 3.2rem;
          }
          .ghmo-cert-verify-url {
            display: block;
            font-size: 0.5rem;
            word-break: break-all;
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
          <p class="ghmo-letter-headline ghmo-cert-title">Magar Community Marriage Certificate</p>
          <p class="ghmo-cert-title-np">मगर समुदाय विवाह प्रमाणपत्र</p>
          <p class="ghmo-letter-meta ghmo-cert-brand">${organizationName}</p>
          <div class="ghmo-cert-divider"></div>
          <div class="ghmo-letter-body ghmo-cert-body">
            <section class="ghmo-cert-section">
              <p class="ghmo-cert-heading">English</p>
              <p class="ghmo-cert-paragraph">
                This is to certify that, in accordance with the <strong>customs, traditions, and ancestral practices of
                the Magar community</strong>, the marriage between:
              </p>
              ${row("Name of groom:", groomName)}
              ${row("Name of bride:", brideName)}
              ${englishCommunityRows}
              <p class="ghmo-cert-paragraph">
                was solemnized and accepted as an honorable union within the Magar cultural tradition.
              </p>
              ${row("Date of marriage:", marriageDate)}
              ${row("Place of ceremony:", ceremonyPlace)}
              <p class="ghmo-cert-paragraph">
                The marriage was conducted in the presence of <strong>family members, community elders, and respected
                witnesses</strong>, following Magar rites, mutual consent, and cultural responsibilities. The Magar
                community recognizes this union as a sacred lifelong partnership based on respect, cooperation, and
                shared duty.
              </p>
              ${englishRecognition}
              <p class="ghmo-cert-paragraph ghmo-cert-note">
                This certificate records community recognition. It is not a legal marriage certificate and does not
                replace civil marriage registration.
              </p>
            </section>

            <section class="ghmo-cert-section">
              <p class="ghmo-cert-heading">Nepali / नेपाली</p>
              <p class="ghmo-cert-paragraph">
                यो प्रमाणित गरिन्छ कि मगर समुदायका <strong>परम्परा, संस्कार, र पुर्ख्यौली चलनअनुसार</strong>, निम्न
                दम्पतीको विवाह सम्पन्न भएको छ:
              </p>
              ${row("दुलहाको नाम:", groomName)}
              ${row("दुलहीको नाम:", brideName)}
              ${nepaliCommunityRows}
              <p class="ghmo-cert-paragraph">उक्त विवाह:</p>
              ${row("विवाह मिति:", marriageDate)}
              ${row("विवाह सम्पन्न स्थान:", ceremonyPlace)}
              <p class="ghmo-cert-paragraph">
                मा <strong>परिवारका सदस्यहरू, समाजका ज्येष्ठ अगुवा तथा साक्षीहरूको उपस्थितिमा</strong>, मगर जातीय संस्कार र
                आपसी सहमतिअनुसार सम्पन्न गरिएको हो।
              </p>
              <p class="ghmo-cert-paragraph">
                मगर समुदायले यस वैवाहिक सम्बन्धलाई <strong>पवित्र, सम्मानजनक र आजीवन साथ–सहयोगको बन्धन</strong>का रूपमा
                स्वीकार गरेको छ।
              </p>
              ${nepaliRecognition}
              <p class="ghmo-cert-paragraph ghmo-cert-note">
                यो प्रमाणपत्र सामुदायिक मान्यताको अभिलेख हो। यो कानुनी विवाह प्रमाणपत्र होइन, र यसले सरकारी विवाह दर्तालाई
                प्रतिस्थापन गर्दैन।
              </p>
            </section>

            <section class="ghmo-cert-section ghmo-cert-blessing avoid-break">
              <p class="ghmo-cert-heading">Traditional Magar blessing</p>
              <p class="ghmo-cert-subheading">(सामुदायिक आशीर्वाद)</p>
              <p class="ghmo-cert-subheading">English:</p>
              <p class="ghmo-cert-paragraph">${englishBlessingHtml}</p>
              <p class="ghmo-cert-subheading">Nepali / नेपाली:</p>
              <p class="ghmo-cert-paragraph">${nepaliBlessingHtml}</p>
            </section>

            ${
              optionalVowsEnabled
                ? `
            <section class="ghmo-cert-section">
              <p class="ghmo-cert-heading">Traditional vows</p>
              <p class="ghmo-cert-subheading">(परम्परागत प्रतिज्ञा)</p>
              <p class="ghmo-cert-subheading">English:</p>
              <p class="ghmo-cert-paragraph">
                We vow to walk together with honesty, respect our families and traditions, and support one another in
                all stages of life.
              </p>
              <p class="ghmo-cert-subheading">Nepali / नेपाली:</p>
              <p class="ghmo-cert-paragraph">
                हामी एक–अर्काप्रति <strong>इमानदारी, सम्मान र विश्वास</strong> कायम राख्ने, परिवार र परम्पराको आदर गर्ने,
                र जीवनका प्रत्येक चरणमा <strong>साथ र सहयोग गर्ने</strong> प्रतिज्ञा गर्दछौं।
              </p>
            </section>
            `
                : ""
            }

            <section class="ghmo-cert-section avoid-break">
              <p class="ghmo-cert-heading">Witnesses / साक्षीहरू (community elders)</p>
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
              <p class="ghmo-cert-heading">Officiant / cultural authority</p>
              <p class="ghmo-cert-subheading"><strong>संस्कार सम्पन्न गराउने व्यक्ति</strong></p>
              ${row("Name / नाम:", officiantName)}
              ${row("Title / पद:", officiantTitle)}
              ${row("Signature / हस्ताक्षर:", officiantSignatureContent)}
            </section>

            <section class="ghmo-cert-section avoid-break">
              <p class="ghmo-cert-heading">Issuing authority</p>
              <p class="ghmo-cert-subheading"><strong>जारी गर्ने निकाय</strong></p>
              ${row("Issued by / जारीकर्ता:", issuingAuthority)}
              ${row("Signature / हस्ताक्षर:", issuerSignatureContent)}
              ${row("Official seal / आधिकारिक छाप:", officialSeal)}
              ${row("Date of issue / जारी मिति:", issueDate)}
              ${row("Certificate number / प्रमाणपत्र नं.:", certificateNumber)}
              ${
                verificationQr
                  ? row(
                      "Verify / प्रमाणित:",
                      `<img class="ghmo-cert-qr" src="${verificationQr}" alt="Verification QR code" /><span class="ghmo-cert-verify-url">${verificationUrl}</span>`
                    )
                  : ""
              }
            </section>
          </div>
        </div>
      </div>
    `;
  }
};
