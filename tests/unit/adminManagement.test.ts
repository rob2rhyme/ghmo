import { describe, expect, it } from "vitest";
import { adminView, cleanAdminEmail, cleanAdminName, planAddAdmin, planRoleChange, planStatusChange, roleOf, rolesFor, sortAdminViews, type AdminRecord } from "@/src/lib/adminManagement";

const admin = (id: string, roles: string[], status: AdminRecord["status"] = "active", emailLower = `${id}@example.org`): AdminRecord => ({ id, name: id.toUpperCase(), emailLower, roles, status });
const alice = admin("alice", ["super_admin"]);
const bob = admin("bob", ["admin"]);
const carol = admin("carol", ["super_admin"]);

describe("roles and cleaning", () => {
  it("reads and writes roles", () => {
    expect(roleOf(["super_admin"])).toBe("super_admin");
    expect(roleOf(["admin", "super_admin"])).toBe("super_admin");
    expect(roleOf(["admin"])).toBe("admin");
    expect(roleOf([])).toBe("admin");
    expect(rolesFor("super_admin")).toEqual(["super_admin"]);
    expect(rolesFor("admin")).toEqual(["admin"]);
  });

  it("cleans names and emails", () => {
    expect(cleanAdminName("  Asha   Rai ")).toBe("Asha Rai");
    expect(cleanAdminName(5)).toBe("");
    expect(cleanAdminEmail(" Asha@Example.ORG ")).toBe("asha@example.org");
    for (const bad of ["", "asha", "asha@", "a b@example.org", "a@b", 7, null]) expect(cleanAdminEmail(bad)).toBeNull();
  });
});

describe("planAddAdmin", () => {
  const base = { admins: [alice, bob], name: "Deepak Gurung", email: "Deepak@Example.org", role: "admin" };

  it("accepts a name, an address and a role, and lowercases the address", () => {
    expect(planAddAdmin(base)).toEqual({ ok: true, name: "Deepak Gurung", emailLower: "deepak@example.org", role: "admin" });
    expect(planAddAdmin({ ...base, role: "super_admin" })).toMatchObject({ ok: true, role: "super_admin" });
  });

  it("refuses a missing name, a bad address or an unknown role", () => {
    expect(planAddAdmin({ ...base, name: " " })).toMatchObject({ ok: false, status: 400 });
    expect(planAddAdmin({ ...base, email: "nope" })).toMatchObject({ ok: false, status: 400 });
    expect(planAddAdmin({ ...base, role: "owner" })).toMatchObject({ ok: false, status: 400 });
    expect(planAddAdmin({ ...base, role: undefined })).toMatchObject({ ok: false, status: 400 });
  });

  it("refuses an address already on the list, and says to turn a turned-off one on", () => {
    const active = planAddAdmin({ ...base, email: "BOB@example.org" });
    expect(active).toMatchObject({ ok: false, status: 409 });
    expect((active as { error: string }).error).toContain("already an admin");
    const off = planAddAdmin({ ...base, admins: [alice, admin("bob", ["admin"], "disabled")], email: "bob@example.org" });
    expect((off as { error: string }).error).toContain("Turn them on instead");
  });
});

describe("planStatusChange", () => {
  it("turns another admin off and on", () => {
    expect(planStatusChange({ admins: [alice, bob], targetId: "bob", actorId: "alice", status: "disabled" })).toEqual({ ok: true, changed: true });
    expect(planStatusChange({ admins: [alice, admin("bob", ["admin"], "disabled")], targetId: "bob", actorId: "alice", status: "active" })).toEqual({ ok: true, changed: true });
  });

  it("accepts the state they are already in as a no-op", () => {
    expect(planStatusChange({ admins: [alice, bob], targetId: "bob", actorId: "alice", status: "active" })).toEqual({ ok: true, changed: false });
  });

  it("never lets you turn yourself off", () => {
    const plan = planStatusChange({ admins: [alice, carol], targetId: "alice", actorId: "alice", status: "disabled" });
    expect(plan).toMatchObject({ ok: false, status: 409 });
    expect((plan as { error: string }).error).toContain("yourself");
  });

  it("never turns off the only active super admin, but can once there is another", () => {
    const only = planStatusChange({ admins: [alice, bob], targetId: "alice", actorId: "bob", status: "disabled" });
    expect(only).toMatchObject({ ok: false, status: 409 });
    expect((only as { error: string }).error).toContain("only active super admin");
    expect(planStatusChange({ admins: [alice, carol, bob], targetId: "alice", actorId: "carol", status: "disabled" })).toEqual({ ok: true, changed: true });
    // A turned-off super admin does not count as a second one.
    expect(planStatusChange({ admins: [alice, admin("carol", ["super_admin"], "disabled")], targetId: "alice", actorId: "bob", status: "disabled" })).toMatchObject({ ok: false });
  });

  it("is a clean 404 for someone not on the list", () => {
    expect(planStatusChange({ admins: [alice], targetId: "zed", actorId: "alice", status: "disabled" })).toMatchObject({ ok: false, status: 404 });
  });
});

describe("planRoleChange", () => {
  it("promotes and demotes another admin", () => {
    expect(planRoleChange({ admins: [alice, bob], targetId: "bob", actorId: "alice", role: "super_admin" })).toEqual({ ok: true, changed: true });
    expect(planRoleChange({ admins: [alice, carol], targetId: "carol", actorId: "alice", role: "admin" })).toEqual({ ok: true, changed: true });
  });

  it("is a no-op when the role is already that", () => {
    expect(planRoleChange({ admins: [alice, bob], targetId: "bob", actorId: "alice", role: "admin" })).toEqual({ ok: true, changed: false });
  });

  it("never changes your own role", () => {
    const plan = planRoleChange({ admins: [alice, carol], targetId: "alice", actorId: "alice", role: "admin" });
    expect(plan).toMatchObject({ ok: false, status: 409 });
    expect((plan as { error: string }).error).toContain("your own role");
  });

  it("never demotes the only active super admin", () => {
    const plan = planRoleChange({ admins: [alice, bob], targetId: "alice", actorId: "bob", role: "admin" });
    expect(plan).toMatchObject({ ok: false, status: 409 });
    expect((plan as { error: string }).error).toContain("only active super admin");
  });
});

describe("views", () => {
  it("shows no secrets, marks you, and puts super admins first", () => {
    const views = [
      adminView({ ...bob, email: "Bob@Example.org", createdAt: new Date(2000), lastLoginAt: new Date(5000) }, "alice"),
      adminView({ ...alice, emailLower: "alice@example.org" }, "alice"),
      adminView({ ...admin("dee", ["admin"], "disabled"), name: "" }, "alice")
    ];
    expect(views[0]).toEqual({ id: "bob", name: "BOB", email: "Bob@Example.org", role: "admin", active: true, createdAt: 2000, lastLoginAt: 5000, isYou: false });
    expect(views[1]).toMatchObject({ role: "super_admin", isYou: true, email: "alice@example.org", createdAt: null });
    expect(views[2]).toMatchObject({ name: "Unnamed admin", active: false });
    expect(sortAdminViews(views).map(view => view.id)).toEqual(["alice", "bob", "dee"]);
  });
});
