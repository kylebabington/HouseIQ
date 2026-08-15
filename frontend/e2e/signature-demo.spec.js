// frontend/e2e/signature-demo.spec.js
// Playwright scaffold for the signature HouseIQ demo loop.
// Run: npx playwright test (after installing @playwright/test).

import { test, expect } from "@playwright/test";

const FRONTEND_URL =
  process.env.HOUSEIQ_FRONTEND_URL || "http://localhost:5173";
const API_URL =
  process.env.HOUSEIQ_API_URL || "http://localhost:5000/api";

test.describe("HouseIQ public demo", () => {
  test("landing shows explore demo home", async ({ page }) => {
    await page.goto(FRONTEND_URL);
    await expect(page.getByRole("heading", { name: "HouseIQ" })).toBeVisible();
    const explore = page.getByRole("button", {
      name: /Explore demo home/i,
    });
    await expect(explore).toBeVisible();
    await explore.click();
    await expect(
      page.getByRole("heading", {
        name: /1978 Indianapolis Ranch/i,
      })
    ).toBeVisible();
  });

  test("public demo API returns seeded story", async ({
    request,
  }) => {
    const response = await request.get(`${API_URL}/demo/home`);
    expect(response.ok()).toBeTruthy();
    const body = await response.json();
    expect(body.name).toMatch(/Indianapolis/i);
    expect(body.sampleNeeds?.length).toBeGreaterThan(0);
  });
});
