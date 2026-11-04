import { describe, expect, it } from "vitest";
import { ROLLED_BACK_EMPTY, ROLLED_BACK_OFF, rollbackVerdict } from "@/src/lib/e2ee/rollback";

describe("encryption rollback check (fail closed)", () => {
  it("treats 'encryption is off' as a failure on a device that has seen the signed device list", () => {
    expect(rollbackVerdict({ enabled: false, logEntries: null, pinned: true })).toEqual({ kind: "failed", reason: ROLLED_BACK_OFF });
  });

  it("treats an empty device list as a failure on a device that has seen it", () => {
    expect(rollbackVerdict({ enabled: true, logEntries: 0, pinned: true })).toEqual({ kind: "failed", reason: ROLLED_BACK_EMPTY });
  });

  it("refuses 'off' on a browser that has seen encryption on, even before the list was sealed", () => {
    expect(rollbackVerdict({ enabled: false, logEntries: null, pinned: false, sawEnabled: true })).toEqual({ kind: "failed", reason: ROLLED_BACK_OFF });
    // An unsealed workspace still has an empty list: that alone is not a rollback.
    expect(rollbackVerdict({ enabled: true, logEntries: 0, pinned: false, sawEnabled: true })).toEqual({ kind: "unsealed" });
  });

  it("leaves new workspaces alone: off before setup, unsealed before the first seal", () => {
    expect(rollbackVerdict({ enabled: false, logEntries: null, pinned: false })).toEqual({ kind: "off" });
    expect(rollbackVerdict({ enabled: true, logEntries: 0, pinned: false })).toEqual({ kind: "unsealed" });
  });

  it("verifies the log whenever it has entries", () => {
    expect(rollbackVerdict({ enabled: true, logEntries: 3, pinned: true })).toEqual({ kind: "verify" });
    expect(rollbackVerdict({ enabled: true, logEntries: 1, pinned: false })).toEqual({ kind: "verify" });
  });
});
