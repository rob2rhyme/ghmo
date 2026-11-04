import { expect, test } from "@playwright/test";

// No third-party script runs anywhere on this site (decision 2026-11-04): donations go through GoFundMe's own
// page, because a script here would run on the same address as the admin area. The public pages' HTML must carry
// no external <script src> and no GoFundMe Pro snippet.

const PAGES = ["/", "/donate", "/minutes", "/multimedia", "/c/ghmo/events", "/admin/login", "/login"];

for (const path of PAGES) {
  test(`${path} loads no third-party script`, async ({ request }) => {
    const html = await (await request.get(path)).text();
    expect(html).not.toContain("gofundme-pro-install-snippet");
    expect(html).not.toContain("__THIRD_PARTY_MARKER__");
    const external = [...html.matchAll(/<script[^>]+src="(https?:)?\/\/[^"]+"/g)].map(m => m[0]);
    expect(external).toEqual([]);
  });
}
