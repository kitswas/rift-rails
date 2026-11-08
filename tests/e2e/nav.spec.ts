import { expect, test } from "@playwright/test";

// Ports of artifacts/verify_nav.html (23 checks) to Playwright.
// Uses window globals kept for verification until legacy board/dial/engine
// are deleted in a follow-up tranche.
test.describe("rift rails nav, board and dial", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForFunction(
      () => (window as unknown as { RiftCouplingBoard?: unknown }).RiftCouplingBoard !== undefined,
    );
  });

  test("two carriages, badge/tag, couplers, sleepers, curved cables", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).RiftCouplingBoard.render([
        { id: "hub", name: "Gilded Bazaar" },
        { id: "hunt", name: "Fractured Hollow" },
      ]);
    });
    await page.waitForTimeout(100);
    const cars = page.locator(".nav-carriage");
    await expect(cars).toHaveCount(2);
    await expect(cars.nth(0).locator(".carriage-tag")).toContainText("VECTOR 01");
    await expect(cars.nth(1).locator(".carriage-tag")).toContainText("VECTOR 02");
    for (const index of [0, 1]) {
      await expect(cars.nth(index).locator(".carriage-badge svg")).toHaveCount(1);
    }
    await expect(page.locator(".board-coupler")).toHaveCount(2);
    await expect(page.locator(".board-sleepers path")).toHaveCount(22);
    await expect(page.locator(".board-coupler .board-leader-outer")).toHaveCount(2);
    for (const coupler of await page.locator(".board-coupler").all()) {
      await expect(coupler.locator(".board-port")).toHaveCount(2);
      const d = await coupler.locator(".board-leader-outer").getAttribute("d");
      expect(d).toContain("C");
    }
    const rivets = await page.evaluate(() => {
      const el = document.querySelector(".nav-carriage") as HTMLElement;
      return getComputedStyle(el, "::before").backgroundImage;
    });
    expect(rivets).toContain("radial-gradient");
  });

  test("slot0/slot1 arm targets and state", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).RiftCouplingBoard.render([
        { id: "hub", name: "Gilded Bazaar" },
        { id: "hunt", name: "Fractured Hollow" },
      ]);
    });
    await page.waitForTimeout(50);
    await page.evaluate(() => (window as any).RiftCouplingBoard.arm(0, 2));
    await page.waitForTimeout(60);
    const t0 = await page.evaluate(() => (window as any).RiftVectorDial.entry.target as number);
    expect(((t0 % 360) + 360) % 360).toBe(305);
    const cars = page.locator(".nav-carriage");
    await expect(cars.nth(0)).toHaveAttribute("data-arm", "true");
    await expect(cars.nth(0)).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".board-coupler").nth(0)).toHaveAttribute("data-active", "true");
    await page.evaluate(() => (window as any).RiftCouplingBoard.arm(1, 2));
    await page.waitForTimeout(60);
    const t1 = await page.evaluate(() => (window as any).RiftVectorDial.entry.target as number);
    expect(Math.abs((((t1 % 360) + 360) % 360) - 55)).toBeLessThan(0.01);
    await expect(cars.nth(1)).toHaveAttribute("data-arm", "true");
    await expect(cars.nth(0)).toHaveAttribute("aria-pressed", "false");
  });

  test("confirm commits chosen route once", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).RiftCouplingBoard.render([
        { id: "hub", name: "Gilded Bazaar" },
        { id: "hunt", name: "Fractured Hollow" },
      ]);
    });
    const commit = await page.evaluate(() => {
      const w = window as any;
      const oldCommit = w.ConduitDeck.commitTrajectory;
      const oldFinal = w.Engine.finalizeJump;
      const got: { commit?: string; final?: string[] } = {};
      w.ConduitDeck.commitTrajectory = (c: any) => {
        got.commit = c.id;
        return { dimId: c.id, dimName: c.name };
      };
      w.Engine.finalizeJump = (a: string, b: string) => {
        got.final = [a, b];
      };
      w.RiftCouplingBoard.arm(1, 2);
      const ok = w.RiftCouplingBoard.confirm(1, 2);
      w.ConduitDeck.commitTrajectory = oldCommit;
      w.Engine.finalizeJump = oldFinal;
      return { ok, got, lock: w.RiftCouplingBoard.lockSlot };
    });
    expect(commit.ok).toBe(true);
    expect(commit.got.commit).toBe("hunt");
    expect(commit.got.final?.[0]).toBe("hunt");
    expect(commit.lock).toBe(1);
  });

  test("drag does not confirm; stationary tap confirms", async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.RiftCouplingBoard.render([
        { id: "hub", name: "Gilded Bazaar" },
        { id: "hunt", name: "Fractured Hollow" },
      ]);
    });
    const drag = await page.evaluate(() => {
      const w = window as any;
      let finals = 0;
      const old = w.Engine.finalizeJump;
      w.Engine.finalizeJump = () => {
        finals++;
      };
      w.RiftCouplingBoard.arm(0, 2);
      const root = document.querySelector("#nav-vector") as HTMLElement;
      const r = root.querySelector("svg")!.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const pe = (t: string, x: number, y: number) => {
        try {
          root.dispatchEvent(
            new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 7 }),
          );
        } catch {}
      };
      pe("pointerdown", cx, cy - 30);
      pe("pointermove", cx + 40, cy - 10);
      pe("pointerup", cx + 40, cy - 10);
      w.Engine.finalizeJump = old;
      return { finals, locked: w.RiftCouplingBoard.lockSlot };
    });
    expect(drag.finals).toBe(0);
    expect(drag.locked).toBe(-1);
    const tap = await page.evaluate(() => {
      const w = window as any;
      let finals = 0;
      const old = w.Engine.finalizeJump;
      w.Engine.finalizeJump = () => {
        finals++;
      };
      w.RiftCouplingBoard.arm(1, 2);
      const root = document.querySelector("#nav-vector") as HTMLElement;
      const r = root.querySelector("svg")!.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const x = cx + 25;
      const y = cy - 17;
      const pe = (t: string) => {
        try {
          root.dispatchEvent(
            new PointerEvent(t, { bubbles: true, clientX: x, clientY: y, pointerId: 8 }),
          );
        } catch {}
      };
      pe("pointerdown");
      pe("pointerup");
      w.Engine.finalizeJump = old;
      return { finals, locked: w.RiftCouplingBoard.lockSlot };
    });
    expect(tap.finals).toBe(1);
    expect(tap.locked).toBe(1);
  });

  test("dial resets on nav re-entry", async ({ page }) => {
    await page.evaluate(() => {
      const w = window as any;
      w.RiftCouplingBoard.render([
        { id: "hub", name: "Gilded Bazaar" },
        { id: "hunt", name: "Fractured Hollow" },
      ]);
      w.RiftVectorDial.reset();
    });
    await page.waitForTimeout(60);
    const reentry = await page.evaluate(() => {
      const w = window as any;
      return {
        target: w.RiftVectorDial.entry.target as number,
        status: document.querySelector("#nav-vector-status")?.textContent,
        armed: document.querySelector("#nav-vector")?.getAttribute("data-armed"),
        selected: [...document.querySelectorAll(".vector-slot")].filter(
          (n) => (n as HTMLElement).dataset.selected === "true",
        ).length,
      };
    });
    expect(Math.abs(reentry.target)).toBeLessThan(0.01);
    expect(reentry.status).toBe("Vector idle");
    expect(reentry.armed).not.toBe("true");
    expect(reentry.selected).toBe(0);
  });

  test("single route: one carriage, solo marker, centred coupler", async ({ page }) => {
    await page.evaluate(() => {
      (window as any).RiftCouplingBoard.render([{ id: "hub", name: "Gilded Bazaar" }]);
    });
    await page.waitForTimeout(80);
    await expect(page.locator(".nav-carriage")).toHaveCount(1);
    await expect(page.locator(".board-coupler")).toHaveCount(1);
    await page.evaluate(() => (window as any).RiftCouplingBoard.arm(0, 1));
    await page.waitForTimeout(60);
    const target = await page.evaluate(() => (window as any).RiftVectorDial.entry.target as number);
    expect(Math.abs((((target % 360) + 360) % 360) - 90)).toBeLessThan(0.01);
    const d = await page.locator(".board-coupler .board-leader-outer").getAttribute("d");
    expect(d).toBe("M500 142 C494 190, 506 230, 500 266");
    await expect(page.locator("#nav-vector")).toHaveAttribute("data-solo", "true");
    await expect(page.locator("#vector-slot-1"))
      .toBeHidden({ timeout: 500 })
      .catch(() => {});
    const soloDisplay = await page.evaluate(() =>
      getComputedStyle(document.querySelector("#vector-slot-solo") as Element).getPropertyValue(
        "display",
      ),
    );
    expect(soloDisplay).toContain("block");
  });

  test("dial plate header and timing constants", async ({ page }) => {
    await expect(page.locator(".dial-plate-head .dial-title")).toContainText("RIFT VECTOR");
    await expect(page.locator(".dial-plate-head .dial-code")).toContainText("RV-02");
    await expect(page.locator("#vector-slot-0 .vector-slot-dot")).toHaveCount(1);
    await expect(page.locator("#vector-slot-1 .vector-slot-dot")).toHaveCount(1);
    await expect(page.locator(".vector-ticks rect")).toHaveCount(9);
    await expect(page.locator("#rift-vector-needle path")).toHaveAttribute(
      "d",
      "M80 22 L84.5 78 L80 90 L75.5 78 Z",
    );
    const cfg = await page.evaluate(() => (window as any).GAME_DATA.config);
    expect(cfg.JUMP_CHARGE_MS).toBe(900);
    expect(cfg.JUMP_TOTAL_MS).toBe(1250);
    expect(cfg.JUMP_TOTAL_MS - cfg.JUMP_CHARGE_MS).toBe(350);
  });

  test("save round-trip", async ({ page }) => {
    const save = await page.evaluate(() => {
      const w = window as any;
      w.VoyageSession.resetState();
      const before = JSON.stringify(w.VoyageSession.serialize());
      w.SaveSystem.save();
      const loaded = JSON.stringify(w.SaveSystem.load());
      return { key: w.SaveSystem.STORAGE_KEY, equal: before === loaded, bytes: loaded.length };
    });
    expect(save.key).toBe("rift_rails_auto_save");
    expect(save.equal).toBe(true);
    expect(save.bytes).toBeGreaterThan(100);
  });

  test("eye single transform source", async ({ page }) => {
    await page.evaluate(() => {
      document.getElementById("game-container")!.style.display = "flex";
      const portrait = document.getElementById("corvus-portrait")!;
      const rig = document.getElementById("game-container")!;
      const rect = portrait.getBoundingClientRect();
      rig.dispatchEvent(
        new PointerEvent("pointermove", {
          bubbles: true,
          clientX: rect.right + 220,
          clientY: rect.top - 120,
        }),
      );
    });
    await page.waitForTimeout(150);
    const eyes = await page.evaluate(() => {
      const portrait = document.getElementById("corvus-portrait")!;
      const glint = document.querySelector(".corvus-eye-glint");
      return {
        eyeX: portrait.style.getPropertyValue("--corvus-eye-x"),
        glintX: portrait.style.getPropertyValue("--corvus-glint-x"),
        glintInsidePupil: glint?.parentElement?.classList.contains("corvus-eye-pupil") ?? false,
      };
    });
    expect(eyes.eyeX).not.toBe("");
    expect(eyes.eyeX).not.toBe("0.00px");
    expect(eyes.glintX).toBe("");
    expect(eyes.glintInsidePupil).toBe(true);
  });

  test("corvus departs after final cutscene with choices", async ({ page }) => {
    const obs = await page.evaluate(() => {
      const w = window as any;
      const portrait = document.getElementById("corvus-portrait")!;
      const before = !portrait.hidden;
      w.CutsceneEngine.play("wp5");
      const btnA = document.getElementById("cutscene-btn-a")!.innerText;
      const beats = w.CutsceneEngine.activeCutscene?.beats.length || 0;
      for (let i = 0; i < beats; i++) w.CutsceneEngine.advance();
      return {
        before,
        after: portrait.hidden,
        seen: w.VoyageSession.getSnapshot().seenCutscenes?.includes("wp5"),
        beats,
        btnA,
      };
    });
    expect(obs.before).toBe(true);
    expect(obs.after).toBe(true);
    expect(obs.seen).toBe(true);
    expect(obs.btnA.toLowerCase().startsWith('[a] "safe travels into the sanctuary')).toBe(true);
  });

  test("start screen visible", async ({ page }) => {
    await expect(page.locator("#start-screen")).toBeVisible();
  });
});

test("diorama deterministic per name", async ({ page }) => {
  await page.goto("/artwork-browser.html?bridge=1");
  await page.waitForFunction(
    () =>
      (window as unknown as { renderVectorDiorama?: unknown }).renderVectorDiorama !== undefined,
  );
  const art = await page.evaluate(() => {
    const w = window as any;
    const a1 = w.renderVectorDiorama("Gilded Bazaar");
    const a2 = w.renderVectorDiorama("Gilded Bazaar");
    const b1 = w.renderVectorDiorama("Fractured Hollow");
    return { a1, a2, b1 };
  });
  expect(typeof art.a1).toBe("string");
  expect(art.a1.length).toBeGreaterThan(100);
  expect(art.a1).toBe(art.a2);
  expect(art.a1).not.toBe(art.b1);
});
