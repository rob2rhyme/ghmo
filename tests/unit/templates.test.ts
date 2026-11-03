import { describe, expect, it } from "vitest";
import { TEMPLATES } from "@/src/features/docgen/templates";

describe("document templates", () => {
  it("each has a unique id and a positive integer version", () => {
    expect(new Set(TEMPLATES.map(t => t.id)).size).toBe(TEMPLATES.length);
    for (const template of TEMPLATES) expect(Number.isInteger(template.version) && template.version >= 1).toBe(true);
  });

  it("never prints placeholder text or a made-up contact when fields are left empty", () => {
    for (const template of TEMPLATES) {
      const html = template.renderHtml({});
      expect(html, template.id).not.toMatch(/TBD|Valued Member|Esteemed|@ghmo\.org|undefined|null/);
      expect(html, template.id).not.toMatch(/\b(on|at|of)\s*[.,]/);
    }
  });

  it("writes the letter around the fields that were filled in", () => {
    const member = TEMPLATES.find(t => t.id === "meeting-member-invitation")!;
    const html = member.renderHtml({ memberName: "Sita Gurung", meetingDate: "2026-10-12T12:00:00Z", rsvpLink: "717-555-0123" });
    expect(html).toContain("Dear Sita Gurung,");
    expect(html).toContain("on October 12, 2026");
    expect(html).toContain("Reply to: 717-555-0123");
    expect(html).not.toContain(" at ");

    const board = TEMPLATES.find(t => t.id === "board_meeting_invitation")!;
    expect(board.renderHtml({})).toContain("Dear board member,");
    expect(board.renderHtml({ agenda: "Bylaws <review>" })).toContain("On the agenda:<br/>Bylaws &lt;review&gt;");
  });

  it("keeps the place in its own sentence, so a letter never says \"at … at\"", () => {
    const board = TEMPLATES.find(t => t.id === "board_meeting_invitation")!;
    const html = board.renderHtml({ meetingDate: "2026-10-12T12:00:00Z", meetingTime: "6:00 PM", meetingLocation: "the community hall" });
    expect(html).toContain("on October 12, 2026 at 6:00 PM. We will meet at the community hall.");

    const member = TEMPLATES.find(t => t.id === "meeting-member-invitation")!;
    expect(member.renderHtml({})).toContain("Greater Harrisburg Magar Organization");
    expect(member.renderHtml({})).not.toContain("Executive Council");

    const bhajan = TEMPLATES.find(t => t.id === "bhajan_program")!;
    const invite = bhajan.renderHtml({ hostName: "Ram Thapa", programTime: "6:30 PM", location: "12 Main Street" });
    expect(invite).toContain("Ram Thapa warmly invites you to an evening of bhajan and prayer at 6:30 PM.");
    expect(invite).toContain("We will gather at 12 Main Street.");
    expect(invite).not.toMatch(/The Ram Thapa|prasadam/);

    const leader = TEMPLATES.find(t => t.id === "event-host-invitation")!;
    expect(leader.renderHtml({ eventName: "Dashain", eventTime: "7:00 PM", eventLocation: "the hall" })).toContain(
      "with us at Dashain at 7:00 PM. It will be held at the hall."
    );
  });

  it("files the memorial notice as a notice, keeps its id, and prints the service time", () => {
    const notice = TEMPLATES.find(t => t.id === "death-certificate")!;
    expect(notice.category).toBe("Notice");
    expect(notice.fields.map(f => f.id)).toEqual(
      expect.arrayContaining(["deceasedName", "dateOfPassing", "serviceDate", "serviceTime", "serviceLocation", "contactPerson", "remarks"])
    );
    const html = notice.renderHtml({ deceasedName: "Maya Pun", serviceDate: "2026-10-12T12:00:00Z", serviceTime: "11:00 AM", serviceLocation: "Community hall" });
    expect(html).toContain("With deep sorrow, we share the passing of");
    expect(html).toContain("October 12, 2026 · 11:00 AM");
    expect(html).toContain("Community hall");
    expect(html).not.toContain("We honor the passing");
    expect(notice.renderHtml({ deceasedName: "Maya Pun" })).not.toContain("Memorial service");
  });

  describe("wedding certificate", () => {
    const wedding = TEMPLATES.find(t => t.id === "wedding-certificate")!;
    const field = (id: string) => wedding.fields.find(f => f.id === id)!;
    const ISSUER = "Greater Harrisburg Magar Organization";

    it("is version 2 and is issued by GHMO by default", () => {
      expect(wedding.version).toBe(2);
      expect(field("issuingAuthority").defaultValue).toBe(ISSUER);
      const html = wedding.renderHtml({});
      expect(html).toMatch(/Issued by \/ जारीकर्ता:<\/span>\s*<span class="ghmo-cert-value">Greater Harrisburg Magar Organization</);
      expect(html).not.toMatch(/Magar Community Council|Magar Samaj|Association Name/);
      expect(wedding.renderHtml({ issuingAuthority: "  " })).not.toContain("Association Name");
    });

    it("offers Magar first, defaults the groom to Magar, and never asks for caste", () => {
      expect(field("brideEthnicity").options![0]).toEqual({ label: "Magar / मगर", value: "Magar|मगर" });
      expect(field("brideEthnicity").label).toBe("Bride's community / दुलहीको समुदाय");
      expect(field("brideEthnicity").required).toBeFalsy();
      expect(field("groomCommunity").defaultValue).toBe("Magar|मगर");
      const labels = field("brideEthnicity").options!.map(o => o.label);
      expect(labels).toContain("Bahun / बाहुन");
      expect(labels).toContain("Chhetri / क्षेत्री");
      expect(labels.at(-1)).toMatch(/^Other \(type it\)/);
      expect(wedding.renderHtml({})).not.toContain("जात/");
    });

    it("adds the community recognition section, in both languages, only when the communities differ", () => {
      const recognition = /Community recognition \(|सामुदायिक मान्यता \(/;
      expect(wedding.renderHtml({})).not.toMatch(recognition);
      expect(wedding.renderHtml({ brideEthnicity: "Magar|मगर" })).not.toMatch(recognition);
      expect(wedding.renderHtml({ groomCommunity: "Gurung|गुरुङ", brideEthnicity: "Gurung|गुरुङ" })).not.toMatch(recognition);

      const mixed = wedding.renderHtml({ brideEthnicity: "Gurung|गुरुङ", maitiRepresentativeName: "Hari Rana" });
      expect(mixed).toContain("Community recognition (interethnic marriage)");
      expect(mixed).toContain("सामुदायिक मान्यता (अन्तरजातीय विवाह)");
      expect(mixed).toContain("joins the Magar and Gurung communities");
      expect(mixed).toContain("Hari Rana (Community Elder)");

      // The groom can be the one from another community.
      expect(wedding.renderHtml({ groomCommunity: "Tamang|तामाङ", brideEthnicity: "Magar|मगर" })).toMatch(recognition);
      // "Other" prints what was typed.
      const other = wedding.renderHtml({ brideEthnicity: "Other|अन्य", brideEthnicityOther: "Thakuri" });
      expect(other).toContain("joins the Magar and Thakuri communities");
      expect(wedding.renderHtml({ brideEthnicity: "Other|अन्य", brideEthnicityOther: "Magar" })).not.toMatch(recognition);
    });

    it("prints corrected labels for values saved with the old ones", () => {
      const html = wedding.renderHtml({ brideEthnicity: "Bahun|ब्राह्मण" });
      expect(html).toContain(">Bahun<");
      expect(html).toContain(">बाहुन<");
      expect(wedding.renderHtml({ brideEthnicity: "Chetri|क्षेत्री" })).toContain(">Chhetri<");
      expect(wedding.renderHtml({ brideEthnicity: "Rai|राई" })).toContain("(समुदायका ज्येष्ठ)");
    });

    it("never calls the union lawful, and says plainly in both languages that it is not a legal certificate", () => {
      const html = wedding.renderHtml({});
      expect(html).not.toMatch(/lawful|unless permitted by law/i);
      expect(html).toContain("accepted as an honorable union within the Magar cultural tradition");
      expect(html).toContain(
        "This certificate records community recognition. It is not a legal marriage certificate and does not\n                replace civil marriage registration."
      );
      expect(html).toContain("यो कानुनी विवाह प्रमाणपत्र होइन");
    });

    it("has an English title, labels the Nepali section as Nepali, and prints no \"(Optional)\"", () => {
      const html = wedding.renderHtml({});
      expect(html).toContain("Magar Community Marriage Certificate");
      expect(html).toContain("मगर समुदाय विवाह प्रमाणपत्र");
      expect(html).toContain(">Nepali / नेपाली<");
      expect(html).not.toMatch(/Magar Cultural Language Section|मगर \/ नेपाली|\(Optional\)|वैकल्पिक/);
      expect(html).toContain("Traditional vows");
      expect(wedding.renderHtml({ optionalVowsEnabled: "false" })).not.toContain("Traditional vows");
    });

    it("uses the corrected spellings", () => {
      // Option values keep the old spelling for saved documents; what people read is the labels and the certificate.
      const labels = wedding.fields.flatMap(f => [f.label, f.placeholder ?? "", ...(f.options ?? []).map(o => o.label)]).join("\n");
      const html = wedding.renderHtml({ brideEthnicity: "Gurung|गुरुङ" }) + labels;
      expect(html).not.toMatch(/समुदायिक|माईती|जेष्ठ/);
      expect(html).toContain("माइती");
      expect(html).toContain("ज्येष्ठ");
    });

    it("gives the issuer a signature line of its own, separate from the seal", () => {
      const image = "data:image/png;base64,iVBORw0KGgo=";
      const html = wedding.renderHtml({ issuingAuthoritySignatureImage: image });
      expect(html).toMatch(
        /Signature \/ हस्ताक्षर:<\/span>\s*<span class="ghmo-cert-value"><img class="ghmo-cert-signature-image" src="data:image\/png;base64,iVBORw0KGgo=" alt="Issuer signature"/
      );
      expect(html).toMatch(/Official seal \/ आधिकारिक छाप:<\/span>\s*<span class="ghmo-cert-value">_+</);
    });
  });
});
