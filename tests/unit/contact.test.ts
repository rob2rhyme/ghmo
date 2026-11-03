import { describe, expect, it } from "vitest";
import { getContactEmail } from "@/src/lib/contact";

describe("getContactEmail", () => {
  it("accepts a plain address and ignores anything else", () => {
    expect(getContactEmail("info@ghmo.org")).toBe("info@ghmo.org");
    expect(getContactEmail(" info@ghmo.org ")).toBe("info@ghmo.org");
    expect(getContactEmail(undefined)).toBeNull();
    expect(getContactEmail("not an email")).toBeNull();
    expect(getContactEmail('a"b@x.org')).toBeNull();
  });
});
