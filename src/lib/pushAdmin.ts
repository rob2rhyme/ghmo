/**
 * Pure rules for the super-admin view of push devices (plan §21, Phase 16). No network, no database.
 *
 * The list is built from fields that are safe to show: it never takes, and so can never return, a device's address or
 * keys. A device whose admin is gone or turned off is still listed, marked, so a super admin can remove it (D50).
 */
export type StoredDevice = { id: string; uid: string; label: string; kinds: string[]; createdAt: number | null; lastSentAt: number | null };
export type AdminAccount = { id: string; name: string; status: "active" | "disabled" | string };

export type AdminDeviceRow = {
  id: string;
  uid: string;
  adminName: string;
  /** False when the admin's account is turned off (or no longer exists): they get no alerts until it is on again. */
  adminActive: boolean;
  label: string;
  kinds: string[];
  createdAt: number | null;
  lastSentAt: number | null;
};

/** Everyone's devices, grouped by admin name (A to Z), oldest device first within a person. */
export function adminDeviceRows(devices: StoredDevice[], admins: AdminAccount[]): AdminDeviceRow[] {
  const byId = new Map(admins.map(admin => [admin.id, admin]));
  return devices
    .map(device => {
      const admin = byId.get(device.uid);
      return {
        id: device.id,
        uid: device.uid,
        adminName: admin?.name || "Unknown admin",
        adminActive: admin?.status === "active",
        label: device.label || "This device",
        kinds: device.kinds,
        createdAt: device.createdAt,
        lastSentAt: device.lastSentAt
      };
    })
    .sort((a, b) => a.adminName.localeCompare(b.adminName) || a.uid.localeCompare(b.uid) || (a.createdAt ?? 0) - (b.createdAt ?? 0));
}

/** Whether push is on for the site. A missing setting means on, so a site that never touched the switch is unchanged. */
export const pushSwitchedOn = (settings: { enabled?: unknown } | null | undefined): boolean => settings?.enabled !== false;
