import { describe, expect, it } from "vitest";
import {
  certificateCounterPath,
  certificateYear,
  formatCertificateNumber,
  lastSequence
} from "@/src/lib/certificateNumber.server";
import { shownCertificateNumber } from "@/app/(public)/verify/[code]/shownCertificateNumber";

describe("certificate numbers", () => {
  it("formats GHMO-<year>-<NNN>", () => {
    expect(formatCertificateNumber(2026, 1)).toBe("GHMO-2026-001");
    expect(formatCertificateNumber(2026, 42)).toBe("GHMO-2026-042");
    expect(formatCertificateNumber(2027, 1000)).toBe("GHMO-2027-1000");
  });

  it("counts years in Harrisburg's time zone", () => {
    // 03:00 UTC on January 1 is still December 31 in Harrisburg.
    expect(certificateYear(new Date("2027-01-01T03:00:00Z"))).toBe(2026);
    expect(certificateYear(new Date("2027-01-01T06:00:00Z"))).toBe(2027);
  });

  it("keeps one counter per year under the organization", () => {
    expect(certificateCounterPath("ghmo", 2026)).toBe("organizations/ghmo/counters/certificates-2026");
  });

  it("reads the counter defensively", () => {
    expect(lastSequence(undefined)).toBe(0);
    expect(lastSequence({ last: 7 })).toBe(7);
    expect(lastSequence({ last: "7" })).toBe(0);
    expect(lastSequence({ last: -1 })).toBe(0);
  });

  it("never shows a template id as the number on the check page", () => {
    expect(shownCertificateNumber("GHMO-2026-001")).toBe("GHMO-2026-001");
    expect(shownCertificateNumber("wedding-certificate")).toBeNull();
    expect(shownCertificateNumber("  ")).toBeNull();
    expect(shownCertificateNumber(undefined)).toBeNull();
  });
});
