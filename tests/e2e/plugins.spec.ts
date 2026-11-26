import { expect, test } from "@playwright/test";

const REGISTRY_IDS = [
  "rift-salvager",
  "field-repair",
  "corvus-tutorial",
  "rail-keeper",
  "glass-courier",
];
const DEFAULT_IDS = ["rift-salvager", "field-repair"];
const toggleFor = (page: import("@playwright/test").Page, id: string) =>
  page.locator(`#plugin-list input[data-plugin-id="${id}"]`);

test.describe("plugin smoke", () => {
  test("page loads and start-screen is visible", async ({ page }) => {
    await page.goto("/");
    // Registry is same-origin static JSON; no network mocking needed.
    await expect(page.locator("#start-screen")).toBeVisible();
    await expect(page.locator("#cutscene-overlay")).toBeHidden();
  });

  test("registry lists five plugins with two defaults active", async ({ page }) => {
    await page.goto("/?debug");
    const rows = page.locator("#plugin-list .plugin-row");
    await expect(rows).toHaveCount(REGISTRY_IDS.length);
    await expect(page.locator("#plugin-status")).toHaveText("2 active");

    for (const id of REGISTRY_IDS) {
      await expect(rows.filter({ has: page.locator(`[data-plugin-id="${id}"]`) })).toHaveCount(1);
      await expect(toggleFor(page, id)).toHaveCount(1);
    }
    for (const id of DEFAULT_IDS) await expect(toggleFor(page, id)).toBeChecked();
    for (const id of REGISTRY_IDS.filter((id) => !DEFAULT_IDS.includes(id))) {
      await expect(toggleFor(page, id)).not.toBeChecked();
      await expect(page.locator(`#plugin-list .plugin-row[data-plugin-id="${id}"]`)).toContainText(
        "(disabled)",
      );
    }

    // Manual install is gone: there is no file picker in the panel.
    await expect(page.locator("#plugin-file")).toHaveCount(0);
  });

  test("enable toggle loads a disabled registry plugin", async ({ page }) => {
    await page.goto("/?debug");
    await page.locator("#enable-tutorial").uncheck();
    await page.locator("#btn-ignite").click();
    await expect(page.locator("#game-container")).toBeVisible();
    await page.locator("#tab-settings").click();
    const target = "rail-keeper";
    const toggle = toggleFor(page, target);
    await expect(toggle).not.toBeChecked();

    await toggle.check();
    await expect(toggle).toBeChecked();
    await expect(page.locator("#plugin-status")).toHaveText("3 active");

    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await expect(page.locator("#plugin-status")).toHaveText("2 active");
  });
});
