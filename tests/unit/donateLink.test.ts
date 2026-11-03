import { describe, expect, it } from "vitest";
import { getDonateUrl, getDonationEmbedCampaignId } from "@/src/lib/donateLink";

describe("getDonateUrl", () => {
  it("is null until a real campaign link is set", () => {
    expect(getDonateUrl(undefined)).toBeNull();
    expect(getDonateUrl("")).toBeNull();
    expect(getDonateUrl("https://www.gofundme.com/f/replace-with-ghmo-gumba-project")).toBeNull();
    expect(getDonateUrl("https://www.gofundme.com/")).toBeNull();
  });

  it("accepts only https GoFundMe links", () => {
    expect(getDonateUrl("https://www.gofundme.com/f/ghmo-gumba")).toBe("https://www.gofundme.com/f/ghmo-gumba");
    expect(getDonateUrl("http://www.gofundme.com/f/ghmo-gumba")).toBeNull();
    expect(getDonateUrl("https://gofundme.com.evil.example/f/x")).toBeNull();
    expect(getDonateUrl("not a url")).toBeNull();
  });
});

describe("getDonationEmbedCampaignId", () => {
  it("needs a plain campaign id", () => {
    expect(getDonationEmbedCampaignId(undefined)).toBeNull();
    expect(getDonationEmbedCampaignId("abc-123")).toBe("abc-123");
    expect(getDonationEmbedCampaignId("<script>")).toBeNull();
  });
});
