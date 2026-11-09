import { expect, test } from "@playwright/test";

test.describe("optional Corvus tutorial", () => {
  test("starts enabled by default and registers its dialogue from the plugin", async ({ page }) => {
    await page.goto("/?debug");
    await expect(page.locator("#enable-tutorial")).toBeChecked();
    await page.locator("#btn-ignite").click();

    await expect(page.locator("#cutscene-overlay")).toBeVisible();
    await expect(page.locator("#cutscene-speaker")).toHaveText("MASTER CORVUS // VEILED SCHOLAR");
    await expect(page.locator("#cutscene-body")).toContainText("Crucible fire drinks refined fuel");
    await expect(page.locator("#tutorial-cue")).toHaveCount(0);
    const active = await page.evaluate(() => {
      const app = (window as Window & { __rift?: { host?: { isPluginActive(id: string): boolean } } }).__rift;
      return app?.host?.isPluginActive("corvus-tutorial") ?? false;
    });
    expect(active).toBe(true);
    for (let beat = 0; beat < 3; beat++) await page.locator("#cutscene-btn-a").click();
    await expect(page.locator("#btn-explore")).toHaveClass(/tutorial-highlight/);
    await expect(page.locator("#tutorial-cue")).toHaveCount(0);
  });

  test("does not start Corvus dialogue when unchecked for a new game", async ({ page }) => {
    await page.goto("/?debug");
    await page.locator("#enable-tutorial").uncheck();
    await page.locator("#btn-ignite").click();
    await expect(page.locator("#game-container")).toBeVisible();

    const active = await page.evaluate(() => {
      const app = (window as Window & { __rift?: { host?: { isPluginActive(id: string): boolean } } }).__rift;
      return app?.host?.isPluginActive("corvus-tutorial") ?? true;
    });
    expect(active).toBe(false);
    await expect(page.locator("#cutscene-overlay")).toBeHidden();
  });

  test("keeps the new-game checkbox choice through the fresh-game reload", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/?debug");
    await page.evaluate(async () => {
      const app = (window as Window & { __rift?: { save?: { saveAsync(): Promise<void> } } }).__rift;
      await app?.save?.saveAsync();
    });
    await page.reload();
    await expect(page.locator("#btn-start-fresh")).toBeVisible();
    await page.locator("#enable-tutorial").uncheck();
    await Promise.all([
      page.waitForNavigation(),
      page.locator("#btn-start-fresh").click(),
    ]);

    await expect(page.locator("#enable-tutorial")).not.toBeChecked();
    await page.locator("#btn-ignite").click();
    await expect(page.locator("#game-container")).toBeVisible();
    const active = await page.evaluate(() => {
      const app = (window as Window & { __rift?: { host?: { isPluginActive(id: string): boolean } } }).__rift;
      return app?.host?.isPluginActive("corvus-tutorial") ?? true;
    });
    expect(active).toBe(false);
    await expect(page.locator("#cutscene-overlay")).toBeHidden();
  });
});
