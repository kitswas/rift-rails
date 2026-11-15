import { expect, test } from "@playwright/test";

test.describe("optional Corvus tutorial", () => {
  test("starts enabled by default and registers its dialogue from the plugin", async ({ page }) => {
    await page.goto("/?debug");
    await expect(page.locator("#enable-tutorial")).toBeChecked();
    await page.locator("#btn-ignite").click();

    await expect(page.locator("#cutscene-overlay")).toBeVisible();
    await expect(page.locator("#cutscene-speaker")).toHaveText("MASTER CORVUS // VEILED SCHOLAR");
    await expect(page.locator("#cutscene-body")).toContainText("Crucible fire drinks refined fuel");
    await expect(page.locator("#tutorial-cue")).toBeHidden();
    const active = await page.evaluate(() => {
      const app = (
        window as Window & { __rift?: { host?: { isPluginActive(id: string): boolean } } }
      ).__rift;
      return app?.host?.isPluginActive("corvus-tutorial") ?? false;
    });
    expect(active).toBe(true);
    // Click through wp1 beats until the cutscene overlay closes itself;
    // capped so a broken plugin fails the test instead of hanging it.
    for (let beat = 0; beat < 10; beat++) {
      if (!(await page.locator("#cutscene-overlay").isVisible())) break;
      await page.locator("#cutscene-btn-a").click();
    }
    await expect(page.locator("#cutscene-overlay")).toBeHidden();
    await expect(page.locator("#btn-explore")).toHaveClass(/tutorial-highlight/);
    await expect(page.locator("#tutorial-cue")).toBeHidden();
  });

  test("does not start Corvus dialogue when unchecked for a new game", async ({ page }) => {
    await page.goto("/?debug");
    await page.locator("#enable-tutorial").uncheck();
    await page.locator("#btn-ignite").click();
    await expect(page.locator("#game-container")).toBeVisible();

    const active = await page.evaluate(() => {
      const app = (
        window as Window & { __rift?: { host?: { isPluginActive(id: string): boolean } } }
      ).__rift;
      return app?.host?.isPluginActive("corvus-tutorial") ?? true;
    });
    expect(active).toBe(false);
    await expect(page.locator("#cutscene-overlay")).toBeHidden();
  });

  test("keeps the new-game checkbox choice through the fresh-game reload", async ({ page }) => {
    page.on("dialog", (dialog) => dialog.accept());
    await page.goto("/?debug");
    await page.evaluate(async () => {
      const app = (window as Window & { __rift?: { save?: { saveAsync(): Promise<void> } } })
        .__rift;
      await app?.save?.saveAsync();
    });
    await page.reload();
    await expect(page.locator("#btn-start-fresh")).toBeVisible();
    await page.locator("#enable-tutorial").uncheck();
    // The fresh-game button performs a full window.location.reload() to the
    // same URL; wait for the reload's load event. page.waitForURL() cannot
    // express a same-URL reload (it short-circuits to waitForLoadState() when
    // the current URL already matches and would resolve before the reload
    // even starts).
    await Promise.all([page.waitForEvent("load"), page.locator("#btn-start-fresh").click()]);

    await expect(page.locator("#enable-tutorial")).not.toBeChecked();
    await page.locator("#btn-ignite").click();
    await expect(page.locator("#game-container")).toBeVisible();
    const active = await page.evaluate(() => {
      const app = (
        window as Window & { __rift?: { host?: { isPluginActive(id: string): boolean } } }
      ).__rift;
      return app?.host?.isPluginActive("corvus-tutorial") ?? true;
    });
    expect(active).toBe(false);
    await expect(page.locator("#cutscene-overlay")).toBeHidden();
  });
});
