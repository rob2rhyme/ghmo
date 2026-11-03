import fs from "node:fs";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { clearEmulators, seedAdmin, signInWithNewPasskey } from "../e2e-auth/helpers";

/**
 * Accessibility check (WCAG 2.2 A/AA rules in axe-core) of the main pages, light and dark, phone and desktop.
 * Writes axe-report.json next to the screenshots and fails on serious or critical problems
 * (UI_AXE_STRICT=0 reports them without failing; plan §13.4). Clean since 2026-11-03.
 */
const OUT = process.env.UI_AUDIT_OUT ?? "ui-audit-screens";
const STRICT = process.env.UI_AXE_STRICT !== "0";
const ONLY = (process.env.UI_AUDIT_ONLY ?? "").split(",").filter(Boolean);
const run = ONLY.length === 0 || ONLY.includes("axe");

const PUBLIC = ["/", "/donate", "/multimedia", "/minutes", "/c/ghmo/events", "/login", "/admin/login", "/docs/onboarding", "/verify/NOTACODE"];
const ADMIN = [
  "/admin",
  "/admin/minutes",
  "/admin/comms",
  "/admin/chat",
  "/admin/events",
  "/admin/events/new",
  "/admin/action-items",
  "/admin/members",
  "/admin/broadcasts",
  "/admin/calling-tree",
  "/admin/call-campaigns",
  "/admin/my-calls",
  "/admin/document-generator",
  "/admin/document-gallery",
  "/admin/gumba-project",
  "/admin/encryption",
  "/admin/security"
];

type Finding = { url: string; theme: string; width: number; id: string; impact: string | null | undefined; help: string; nodes: number; sample: string };
const findings: Finding[] = [];

async function check(page: Page, url: string) {
  for (const theme of ["light", "dark"] as const) {
    for (const width of [375, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.emulateMedia({ colorScheme: theme });
      await page.goto(url, { waitUntil: "networkidle", timeout: 15_000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      for (const v of result.violations) {
        findings.push({
          url,
          theme,
          width,
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.length,
          sample: v.nodes[0]?.target?.join(" ") ?? ""
        });
      }
    }
  }
}

test.describe("accessibility", () => {
  test.skip(!run, "UI_AUDIT_ONLY excludes axe");

  test.beforeAll(async () => {
    await clearEmulators();
    await seedAdmin("alice", "Alice Rai", ["super_admin"]);
  });

  test("public and admin pages", async ({ page }) => {
    test.setTimeout(20 * 60_000);
    for (const url of PUBLIC) await check(page, url);
    await signInWithNewPasskey(page, "alice", "/admin");
    for (const url of ADMIN) await check(page, url);

    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(path.join(OUT, "axe-report.json"), JSON.stringify(findings, null, 2));
    const serious = findings.filter(f => f.impact === "serious" || f.impact === "critical");
    const byRule = new Map<string, Finding[]>();
    for (const f of findings) byRule.set(f.id, [...(byRule.get(f.id) ?? []), f]);
    console.log(`axe: ${findings.length} findings (${serious.length} serious/critical) across ${byRule.size} rules`);
    for (const [id, list] of byRule) console.log(`  ${id} [${list[0].impact}] ${list[0].help}: ${[...new Set(list.map(f => f.url))].join(", ")}`);
    if (STRICT) expect(serious, JSON.stringify(serious.slice(0, 5), null, 2)).toEqual([]);
  });
});
