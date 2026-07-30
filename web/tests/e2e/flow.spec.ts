// End-to-end flow lifecycle: signup/sign-in -> create flow -> webhook -> run.
//
// Run with:
//   E2E_BASE_URL=http://localhost:3000 \
//   E2E_EMAIL=... E2E_PASSWORD=... \
//   npx playwright test web/tests/e2e/flow.spec.ts
//
// Requires: web on baseURL, api on $NEXT_PUBLIC_API_URL, Supabase project
// + Redis running. The test skips if E2E_BASE_URL is not set so CI stays
// green when the live stack is unavailable.
import { expect, test } from "@playwright/test";

const NEEDS_ENV = !process.env.E2E_BASE_URL;
const EMAIL = process.env.E2E_EMAIL || "demo@flowforge.dev";
const PASSWORD = process.env.E2E_PASSWORD || "demo-password";

test.describe("flow lifecycle", () => {
  test.skip(NEEDS_ENV, "Requires E2E_BASE_URL + live stack");

  test("end-to-end: signup -> flow -> webhook -> run", async ({ page, request }) => {
    await page.goto("/auth/sign-up");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Choose a password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign up/i }).click();

    // If email confirmation is enabled, switch to sign-in instead.
    if (page.url().includes("/auth/sign-up")) {
      await page.goto("/auth/sign-in");
      await page.getByPlaceholder("you@example.com").fill(EMAIL);
      await page.getByPlaceholder("Password").fill(PASSWORD);
      await page.getByRole("button", { name: /sign in/i }).click();
    }

    await page.waitForURL("**/app/flows");
    await page.getByRole("button", { name: /new flow/i }).click();

    await expect(page).toHaveURL(/\/app\/flows\/[\w-]+$/);

    await page.locator('[aria-label="Open node palette"]').click();
    await page.locator('button[aria-label="Text Box"]').click();
    await page.locator('button[aria-label="Text AI"]').click();
    await page.getByRole("button", { name: /save flow/i }).click();

    // Create a webhook trigger from the dashboard.
    await page.goto("/app/triggers");
    await page.getByRole("button", { name: /new trigger/i }).click();
    await page.locator("select").first().selectOption({ index: 0 });
    await page.getByRole("button", { name: /^create$/i }).click();
    const copyBtn = page.getByRole("button", { name: /copy webhook url/i }).first();
    await copyBtn.click();
    const webhookUrl = await page.evaluate(() => navigator.clipboard.readText());

    const res = await request.post(webhookUrl, { data: { topic: "hello" } });
    const body = await res.json();
    expect(body.run_id).toBeTruthy();

    await page.goto(`/app/runs/${body.run_id}`);
    await expect(page.getByText(/run /i).first()).toBeVisible();
  });
});
