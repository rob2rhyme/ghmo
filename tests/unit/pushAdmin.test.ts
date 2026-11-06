import { describe, expect, it } from "vitest";
import { adminDeviceRows, pushSwitchedOn, type AdminAccount, type StoredDevice } from "@/src/lib/pushAdmin";

const device = (id: string, uid: string, over: Partial<StoredDevice> = {}): StoredDevice => ({ id, uid, label: "Chrome on Android", kinds: ["chat"], createdAt: 1000, lastSentAt: null, ...over });
const admins: AdminAccount[] = [
  { id: "u1", name: "Bina Thapa", status: "active" },
  { id: "u2", name: "Asha Rai", status: "active" },
  { id: "u3", name: "Deepak Gurung", status: "disabled" }
];

describe("adminDeviceRows", () => {
  it("groups by admin name and puts a person's oldest device first", () => {
    const rows = adminDeviceRows([device("d1", "u1", { createdAt: 3000 }), device("d2", "u2"), device("d3", "u1", { createdAt: 2000 })], admins);
    expect(rows.map(row => row.id)).toEqual(["d2", "d3", "d1"]);
    expect(rows.map(row => row.adminName)).toEqual(["Asha Rai", "Bina Thapa", "Bina Thapa"]);
  });

  it("marks a device whose admin is turned off, or no longer exists, so it can be removed", () => {
    const rows = adminDeviceRows([device("d1", "u3"), device("d2", "gone"), device("d3", "u1")], admins);
    expect(rows.find(row => row.id === "d1")).toMatchObject({ adminName: "Deepak Gurung", adminActive: false });
    expect(rows.find(row => row.id === "d2")).toMatchObject({ adminName: "Unknown admin", adminActive: false });
    expect(rows.find(row => row.id === "d3")).toMatchObject({ adminActive: true });
  });

  it("carries the alerts and times, and a name for a device with none", () => {
    const [row] = adminDeviceRows([device("d1", "u1", { label: "", kinds: ["chat", "calls"], lastSentAt: 5000 })], admins);
    expect(row).toMatchObject({ label: "This device", kinds: ["chat", "calls"], createdAt: 1000, lastSentAt: 5000 });
  });

  it("has no field that could hold an address or a key, even if the stored record carried one", () => {
    const stored = { ...device("d1", "u1"), endpoint: "https://fcm.googleapis.com/fcm/send/secret", p256dh: "k", auth: "a" } as StoredDevice;
    const [row] = adminDeviceRows([stored], admins);
    expect(JSON.stringify(row)).not.toMatch(/endpoint|fcm|secret|p256dh|auth"/);
    expect(Object.keys(row).sort()).toEqual(["adminActive", "adminName", "createdAt", "id", "kinds", "label", "lastSentAt", "uid"]);
  });
});

describe("pushSwitchedOn", () => {
  it("is on unless a super admin switched it off", () => {
    expect(pushSwitchedOn(null)).toBe(true);
    expect(pushSwitchedOn(undefined)).toBe(true);
    expect(pushSwitchedOn({})).toBe(true);
    expect(pushSwitchedOn({ enabled: true })).toBe(true);
    expect(pushSwitchedOn({ enabled: false })).toBe(false);
  });
});
