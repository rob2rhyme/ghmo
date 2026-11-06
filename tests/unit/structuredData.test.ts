import { describe, expect, it } from "vitest";
import { eventJsonLd, jsonLdText, organizationJsonLd } from "@/src/lib/structuredData";

const org = { name: "Greater Harrisburg Magar Organization", url: "https://ghmo.org" };
const start = new Date(Date.UTC(2026, 5, 6, 18, 30));

describe("structured data", () => {
  it("describes an event with its date, place and organizer", () => {
    const ld = eventJsonLd({ title: "Bhume Puja", summary: " Prayers ", location: "Hall, Main St", start, end: new Date(start.getTime() + 3600_000), url: "https://ghmo.org/c/ghmo/events/e1" }, org);
    expect(ld).toMatchObject({
      "@type": "Event",
      name: "Bhume Puja",
      startDate: "2026-06-06T18:30:00.000Z",
      endDate: "2026-06-06T19:30:00.000Z",
      description: "Prayers",
      location: { "@type": "Place", name: "Hall, Main St" },
      url: "https://ghmo.org/c/ghmo/events/e1",
      organizer: { "@type": "Organization", name: org.name, url: org.url }
    });
  });

  it("leaves out what isn't known, and has nothing for an event without a date", () => {
    expect(eventJsonLd({ title: "TBA", start: null, end: null, url: null }, org)).toBeNull();
    const ld = eventJsonLd({ title: "A", start, end: start, url: null, location: " " }, { name: "G", url: null })!;
    expect(ld).not.toHaveProperty("endDate");
    expect(ld).not.toHaveProperty("location");
    expect(ld).not.toHaveProperty("url");
    expect(ld).not.toHaveProperty("description");
    expect(ld.organizer).toEqual({ "@type": "Organization", name: "G" });
  });

  it("can't close the script tag it sits in", () => {
    const text = jsonLdText(eventJsonLd({ title: "</script><script>alert(1)</script>", start, end: null, url: null }, org)!);
    expect(text).not.toContain("</script>");
    expect(JSON.parse(text).name).toBe("</script><script>alert(1)</script>");
  });

  it("describes the organization", () => {
    expect(organizationJsonLd({ name: "G", alternateName: "GHMO", url: null, logo: null })).toEqual({ "@context": "https://schema.org", "@type": "Organization", name: "G", alternateName: "GHMO" });
  });
});
