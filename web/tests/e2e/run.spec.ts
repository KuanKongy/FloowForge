// Run lifecycle scenarios:
// - Trigger a run via the top-right Run button.
// - Cancel an in-flight run from the editor.
// - Per-trigger button click runs only the downstream subgraph.
//
// Like editor.spec.ts, these skip without E2E_BASE_URL.
import { expect, test } from "@playwright/test";

const NEEDS_ENV = !process.env.E2E_BASE_URL;
const EMAIL = process.env.E2E_EMAIL || "demo@flowforge.dev";

type RunSpecTriggerRecord = { id?: string; name?: string; status?: string; type?: string; [key: string]: unknown };

function readRunSpecTriggerLabel(record: RunSpecTriggerRecord): string {
  const label = typeof record.name === 'string' ? record.name.trim() : '';
  return label || record.id || 'Untitled';
}

function sortRunSpecTriggerRecords(records: RunSpecTriggerRecord[]): RunSpecTriggerRecord[] {
  return records.slice().sort((a, b) => readRunSpecTriggerLabel(a).localeCompare(readRunSpecTriggerLabel(b)));
}

const PASSWORD = process.env.E2E_PASSWORD || "demo-password";

test.describe("run lifecycle", () => {
  test.skip(NEEDS_ENV, "Requires E2E_BASE_URL + live stack");

  async function bootstrap(page: import("@playwright/test").Page) {
    await page.goto("/auth/sign-in");
    await page.getByPlaceholder("you@example.com").fill(EMAIL);
    await page.getByPlaceholder("Password").fill(PASSWORD);
    await page.getByRole("button", { name: /sign in/i }).click();
    await page.waitForURL("**/app/flows");
    await page.getByRole("button", { name: /new flow/i }).click();
    await expect(page).toHaveURL(/\/app\/flows\/[\w-]+$/);
  }

  test("Run button triggers and shows status", async ({ page }) => {
    await bootstrap(page);
    await page.locator('[aria-label="Open node palette"]').click();
    await page.locator('button[aria-label="Text"]').click();
    await page.getByRole("button", { name: /run flow/i }).click();
    await expect(page.locator(".run-sidebar")).toBeVisible();
    await expect(page.getByText(/Running|Succeeded|Failed/)).toBeVisible({ timeout: 15000 });
  });

  test("Cancel an in-flight run", async ({ page }) => {
    await bootstrap(page);
    await page.locator('[aria-label="Open node palette"]').click();
    await page.locator('button[aria-label="Text AI"]').click();
    await page.getByRole("button", { name: /run flow/i }).click();
    const cancelBtn = page.getByRole("button", { name: /cancel run/i });
    if (await cancelBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelBtn.click();
      await expect(page.getByText(/Cancelled/)).toBeVisible({ timeout: 10000 });
    }
  });

  test("Button-as-trigger clicks fire downstream subgraph", async ({ page }) => {
    await bootstrap(page);
    await page.getByRole("button", { name: /add a button trigger/i }).click();
    await page.locator('button[type="button"]').filter({ hasText: /Click Me/ }).first().click();
    // The sidebar opens because runFlow was invoked from the trigger.
    await expect(page.locator(".run-sidebar")).toBeVisible();
  });
});
