import { afterEach, describe, expect, it, vi } from "vitest";
import { notificationMessage, pickRecipients, type NotificationKind } from "@/src/lib/notifications";
import { sendMail } from "@/src/lib/mailer.server";

describe("notification emails", () => {
  it("say that something happened and link to the page, with no content", () => {
    for (const kind of ["chat", "thread", "minutes_submitted", "broadcast_review"] as NotificationKind[]) {
      const { subject, text } = notificationMessage(kind, "https://ghmo.example");
      expect(subject).toMatch(/^GHMO: /);
      expect(text).toContain("https://ghmo.example/admin/");
      expect(text).toContain("Admin → Security");
    }
  });

  it("go to active, opted-in admins with an address, but not the person who acted", () => {
    const admins = [
      { uid: "actor", email: "a@x.org", status: "active", notifyEmail: true },
      { uid: "yes", email: "y@x.org", status: "active", notifyEmail: true },
      { uid: "no-opt-in", email: "n@x.org", status: "active" },
      { uid: "off", email: "o@x.org", status: "active", notifyEmail: false },
      { uid: "disabled", email: "d@x.org", status: "disabled", notifyEmail: true },
      { uid: "no-email", status: "active", notifyEmail: true }
    ];
    expect(pickRecipients(admins, "actor")).toEqual([{ uid: "yes", email: "y@x.org" }]);
    // A targeted reminder (call campaigns) goes only to the named people, the actor included, still only if opted in.
    expect(pickRecipients(admins, "actor", ["yes", "actor", "nobody"])).toEqual(expect.arrayContaining([{ uid: "yes", email: "y@x.org" }]));
    expect(pickRecipients(admins, "actor", ["nobody"])).toEqual([]);
  });
});

describe("sendMail", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("does nothing unless configured", async () => {
    const fetchSpy = vi.fn();
    expect(await sendMail({ to: "a@x.org", subject: "s", text: "t" }, fetchSpy as unknown as typeof fetch)).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("posts to the provider with the key and reports failures without throwing", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "GHMO <no-reply@x.org>");
    const ok = vi.fn().mockResolvedValue({ ok: true });
    expect(await sendMail({ to: "a@x.org", subject: "s", text: "t" }, ok as unknown as typeof fetch)).toBe(true);
    const [url, init] = ok.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    expect(init.headers.Authorization).toBe("Bearer key");
    expect(JSON.parse(init.body)).toMatchObject({ to: ["a@x.org"], subject: "s", text: "t" });

    const boom = vi.fn().mockRejectedValue(new Error("network"));
    expect(await sendMail({ to: "a@x.org", subject: "s", text: "t" }, boom as unknown as typeof fetch)).toBe(false);
  });

  it("passes extra message headers (such as List-Unsubscribe) to the provider, and omits them otherwise", async () => {
    vi.stubEnv("RESEND_API_KEY", "key");
    vi.stubEnv("NOTIFY_FROM_EMAIL", "GHMO <no-reply@x.org>");
    const ok = vi.fn().mockResolvedValue({ ok: true });
    await sendMail({ to: "a@x.org", subject: "s", text: "t", headers: { "List-Unsubscribe": "<https://x.org/u>" } }, ok as unknown as typeof fetch);
    expect(JSON.parse(ok.mock.calls[0][1].body).headers).toEqual({ "List-Unsubscribe": "<https://x.org/u>" });
    await sendMail({ to: "a@x.org", subject: "s", text: "t" }, ok as unknown as typeof fetch);
    expect(JSON.parse(ok.mock.calls[1][1].body)).not.toHaveProperty("headers");
  });
});
