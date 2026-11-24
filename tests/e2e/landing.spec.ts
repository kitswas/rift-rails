import { expect, test } from "@playwright/test";

test.describe("redesigned landing page", () => {
  test("shows four numbered briefing cards and a fresh-game CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#start-screen")).toBeVisible();
    await expect(page.locator(".briefing-card")).toHaveCount(4);
    await expect(page.locator(".briefing-num")).toHaveText(["01", "02", "03", "04"]);
    await expect(page.locator(".briefing-card h2")).toHaveText([
      "Explore",
      "Gather",
      "Upgrade",
      "Rift Jump",
    ]);
    await expect(page.locator("#btn-ignite")).toHaveText("Ignite the Crucible Engine");
    await expect(page.locator("#btn-start-fresh")).toBeHidden();
    // Hero motif is inline SVG only; no raster art on the landing page.
    expect(await page.locator("#start-screen img").count()).toBe(0);
  });

  test("uses data-sourced Continue and New Game labels with a save", async ({ page }) => {
    await page.goto("/?debug");
    await page.evaluate(async () => {
      const app = (window as Window & { __rift?: { save?: { saveAsync(): Promise<void> } } })
        .__rift;
      await app?.save?.saveAsync();
    });
    await page.reload();

    await expect(page.locator("#btn-ignite")).toContainText("Continue Voyage (Waypoint");
    await expect(page.locator("#btn-start-fresh")).toBeVisible();
    await expect(page.locator("#btn-start-fresh")).toHaveText("New Game");
  });

  test("keeps the start controls in a keyboard focus order with visible rings", async ({
    page,
  }) => {
    await page.goto("/");
    let id = "";
    for (let i = 0; i < 6 && id !== "enable-tutorial"; i++) {
      await page.keyboard.press("Tab");
      id = await page.evaluate(() => document.activeElement?.id ?? "");
    }
    expect(id).toBe("enable-tutorial");
    const outline = await page.evaluate(
      () => getComputedStyle(document.activeElement as Element).outlineStyle,
    );
    expect(outline).not.toBe("none");

    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => document.activeElement?.id)).toBe("btn-ignite");
  });

  test("keeps the hero rail motif still, with or without reduced motion", async ({ page }) => {
    await page.goto("/");
    const animation = (): Promise<string> =>
      page.locator(".start-hero").evaluate((node) => getComputedStyle(node).animationName);
    expect(await animation()).toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await animation()).toBe("none");
  });

  test("reflows briefing cards at small and large widths", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/");
    const columns = (): Promise<string> =>
      page.locator(".briefing-grid").evaluate((node) => getComputedStyle(node).gridTemplateColumns);
    expect((await columns()).split(" ").length).toBe(2);

    await page.setViewportSize({ width: 390, height: 844 });
    expect((await columns()).split(" ").length).toBe(1);
  });

  test("captures visual proof at both sizes and reduced motion", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/");
    await expect(page.locator("#start-screen")).toBeVisible();
    await page.screenshot({ path: "artifacts/ui-proof/landing-desktop.png", fullPage: true });

    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "artifacts/ui-proof/landing-mobile.png", fullPage: true });

    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.screenshot({
      path: "artifacts/ui-proof/landing-reduced-motion.png",
      fullPage: true,
    });
  });
});
