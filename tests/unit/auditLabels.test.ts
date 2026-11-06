import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { activitySentence, hasActivityLabel } from "@/src/lib/adminView";

/**
 * Every action the code writes to the activity log must read as a sentence on the dashboard, not as a raw code such as
 * "broadcast_sent". This finds each `action: "..."` literal and `audit("...")` call in app/ and src/ and checks that the
 * dashboard has words for it. A new action without a label fails here.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap(entry => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return entry === "node_modules" ? [] : sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

const ROOT = process.cwd();
const files = [...sourceFiles(join(ROOT, "app")), ...sourceFiles(join(ROOT, "src"))];
const actions = new Set<string>();
for (const file of files) {
  const text = readFileSync(file, "utf8");
  if (!/logAuditEvent|logAudit\(|auditKeyring|await audit\(/.test(text)) continue;
  for (const match of text.matchAll(/action:\s*"([a-z0-9_]+)"/g)) actions.add(match[1]);
  for (const match of text.matchAll(/\baudit\(\s*"([a-z0-9_]+)"/g)) actions.add(match[1]);
  for (const match of text.matchAll(/auditKeyring\([^,]+,[^,]+,\s*"([a-z0-9_]+)"/g)) actions.add(match[1]);
}

describe("activity log labels", () => {
  it("finds the actions the code logs", () => {
    expect(actions.size).toBeGreaterThan(40);
    for (const known of ["member_deleted", "admin_added", "push_switched", "broadcast_sent"]) expect(actions).toContain(known);
  });

  it("has words for every action the code logs", () => {
    const missing = [...actions].filter(action => !hasActivityLabel(action)).sort();
    expect(missing).toEqual([]);
  });

  it("words the actions nobody in particular did as whole sentences", () => {
    expect(activitySentence({ action: "member_email_opt_out" }).text).toBe("A member stopped email (unsubscribe link or spam complaint)");
    expect(activitySentence({ action: "member_email_bounced" }).text).toBe("A member's email address bounced");
    expect(activitySentence({ action: "task_digest_run" }).text).toBe("The daily task digest ran");
  });
});
