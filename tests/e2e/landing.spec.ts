import { expect, test } from "@playwright/test";

test.describe("redesigned landing page", () => {
  test("shows diegetic bulkhead documents and a Begin Voyage CTA", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#start-screen")).toBeVisible();
    await expect(page.locator(".brief-map")).toBeVisible();
    await expect(page.locator(".brief-ledger")).toBeVisible();
    await expect(page.locator(".brief-letter")).toBeVisible();
    await expect(page.locator(".brief-ticket")).toBeVisible();
    await expect(page.locator("#start-title")).toHaveText("Rift Rails");
    await expect(page.locator("#btn-ignite")).toHaveText("Begin Voyage");
    await expect(page.locator("#btn-start-fresh")).toBeHidden();
    // Art is inline SVG and DOM only; no raster art on the landing page.
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

  test("keeps the briefing chart still, with or without reduced motion", async ({ page }) => {
    await page.goto("/");
    const animation = (): Promise<string> =>
      page.locator(".brief-map").evaluate((node) => getComputedStyle(node).animationName);
    expect(await animation()).toBe("none");
    await page.emulateMedia({ reducedMotion: "reduce" });
    expect(await animation()).toBe("none");
  });

  test("reflows bulkhead documents at small and large widths", async ({ page }) => {
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.goto("/");
    const position = (): Promise<string> =>
      page.locator(".brief-map").evaluate((node) => getComputedStyle(node).position);
    expect(await position()).toBe("absolute");

    await page.setViewportSize({ width: 390, height: 844 });
    expect(await position()).toBe("static");
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
