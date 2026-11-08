import { expect, test } from "@playwright/test";

test("nav board and dial expose harness surface", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(
    () => (window as unknown as { RiftCouplingBoard?: unknown }).RiftCouplingBoard !== undefined,
  );
  const has = await page.evaluate(() => {
    const w = window as unknown as {
      RiftCouplingBoard: { render: (c: { id: string; name: string }[]) => boolean };
      RiftVectorDial: { entry?: { target?: number }; arm: (i: number, c: number) => void };
      Engine: { finalizeJump: (a: string, b: string) => void };
      GAME_DATA: { config: { JUMP_CHARGE_MS: number; JUMP_TOTAL_MS: number } };
    };
    const ok = w.RiftCouplingBoard.render([
      { id: "hub", name: "Gilded Bazaar" },
      { id: "hunt", name: "Fractured Hollow" },
    ]);
    w.RiftCouplingBoard.render([
      { id: "hub", name: "Gilded Bazaar" },
      { id: "hunt", name: "Fractured Hollow" },
    ]);
    w.RiftCouplingBoard.render([
      { id: "hub", name: "Gilded Bazaar" },
      { id: "hunt", name: "Fractured Hollow" },
    ]);
    return { ok, cfg: w.GAME_DATA.config };
  });
  expect(has.ok).toBe(true);
  expect(has.cfg.JUMP_CHARGE_MS).toBe(900);
  expect(has.cfg.JUMP_TOTAL_MS).toBe(1250);
  await expect(page.locator("#start-screen")).toBeVisible();
});
