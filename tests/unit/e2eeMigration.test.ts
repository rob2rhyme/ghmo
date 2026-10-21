import { describe, expect, it } from "vitest";
import { envelopeField, locationFor, plainFields, plaintextFieldsToDelete } from "@/src/lib/e2eeMigration";

describe("migration definitions", () => {
  it("finds plaintext to encrypt and skips records that are already encrypted", () => {
    expect(plainFields("chat", { body: "hi" })).toEqual({ body: "hi" });
    expect(plainFields("chat", { enc: {}, createdAt: 1 })).toBeNull();
    expect(plainFields("threads", { title: "T", body: "B", status: "open" })).toEqual({ title: "T", body: "B" });
    expect(plainFields("votes", { value: "approve" })).toEqual({ value: "approve" });
    expect(plainFields("votes", { value: "maybe" })).toBeNull();
    expect(plainFields("documents", { inputs: { a: "b" } })).toEqual({ inputs: { a: "b" } });
  });

  it("migrates a conclusion even when its thread is already encrypted", () => {
    expect(plainFields("conclusions", { enc: {}, conclusion: { text: "Buy it" } })).toEqual({ text: "Buy it" });
    expect(plainFields("conclusions", { conclusion: { enc: {} } })).toBeNull();
  });

  it("leaves approved minutes public and encrypts drafts", () => {
    expect(plainFields("minutes", { status: "approved", decisions: ["x"] })).toBeNull();
    expect(plainFields("minutes", { status: "draft", decisions: ["x"], agenda: [] })).toEqual({ decisions: ["x"], agenda: [] });
    expect(plainFields("minutes", { status: "draft" })).toBeNull();
  });

  it("uses the same locations as the live code, and removes every plaintext field it replaces", () => {
    expect(locationFor("conclusions", "t1")).toEqual({ path: "organizations/ghmo/commsThreads", docId: "t1#conclusion" });
    expect(locationFor("comments", "c1", "t1").path).toBe("organizations/ghmo/commsThreads/t1/comments");
    expect(envelopeField("conclusions")).toBe("conclusion.enc");
    expect(plaintextFieldsToDelete("threads")).toEqual(["title", "body"]);
  });
});
