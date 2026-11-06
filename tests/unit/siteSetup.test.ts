import { describe, expect, it } from "vitest";
import { dashboardWarningText, devSwitchesIn, siteSetupItems, type SetupFacts } from "@/src/lib/siteSetup";

const ready: SetupFacts = {
  appUrl: "https://ghmo.org",
  production: true,
  mailReady: true,
  broadcastProblem: null,
  broadcastsOn: true,
  contactEmail: true,
  donateLink: true,
  pushReady: true,
  cronReady: true,
  devSwitches: [],
  activeSuperAdmins: 2,
  encryptionOn: true
};
const ids = (facts: Partial<SetupFacts>) => siteSetupItems({ ...ready, ...facts }).map(item => `${item.level}:${item.id}`);

describe("site setup", () => {
  it("says nothing when everything is set", () => {
    expect(siteSetupItems(ready)).toEqual([]);
  });

  it("lists problems before suggestions, and names settings without values", () => {
    expect(ids({ appUrl: "", activeSuperAdmins: 1, mailReady: false, encryptionOn: false, contactEmail: false, donateLink: false, pushReady: false, cronReady: false })).toEqual([
      "problem:app-url",
      "problem:super-admins",
      "problem:mail",
      "suggestion:encryption",
      "suggestion:contact",
      "suggestion:donate",
      "suggestion:push",
      "suggestion:cron"
    ]);
    expect(siteSetupItems({ ...ready, devSwitches: ["ALLOW_DEV_ADMIN_LOGIN"] })[0].fix).toContain("ALLOW_DEV_ADMIN_LOGIN");
  });

  it("flags dev switches and a plain http address only on the live site", () => {
    expect(ids({ production: false, devSwitches: ["MAIL_API_URL"], appUrl: "http://localhost:3000" })).toEqual([]);
    expect(ids({ devSwitches: ["MAIL_API_URL"], appUrl: "http://ghmo.org" })).toEqual(["problem:dev-switches", "problem:app-url"]);
    expect(ids({ appUrl: "not a url" })).toEqual(["problem:app-url"]);
  });

  it("shows a broadcast problem only when broadcasts are switched on", () => {
    expect(ids({ broadcastsOn: false, broadcastProblem: "x" })).toEqual([]);
    expect(siteSetupItems({ ...ready, broadcastProblem: "Add the footer." })).toEqual([{ id: "broadcasts", title: "Broadcasts can't go out", fix: "Add the footer.", level: "problem" }]);
  });

  it("finds the dev-only switches", () => {
    expect(devSwitchesIn({})).toEqual([]);
    expect(devSwitchesIn({ ALLOW_DEV_ADMIN_LOGIN: "false" })).toEqual([]);
    expect(devSwitchesIn({ ALLOW_DEV_ADMIN_LOGIN: "true", DEV_ADMIN_LOGIN_TOKEN: "t", NEXT_PUBLIC_USE_FIREBASE_EMULATORS: "true", PUSH_TEST_ALLOW_INSECURE: "1", MAIL_API_URL: "http://x" })).toHaveLength(5);
  });

  it("turns failed dashboard parts into words", () => {
    expect(dashboardWarningText([])).toBeNull();
    expect(dashboardWarningText(["auditLogs", "minutes", "auditLogs"])).toContain("recent activity, recent minutes");
    expect(dashboardWarningText(["other"])).toContain("part of the page");
  });
});
