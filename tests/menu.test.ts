import { beforeEach, describe, expect, it, vi } from "vitest";
import { createMenu } from "../src/ui/menu";
import type { MenuDeps } from "../src/ui/menu";
import type { GameAction, SaveState } from "../src/game/types";

const SNAP = {
  phase: "ENCOUNTER",
  flux: 10,
  module: "Hull",
} as unknown as SaveState;

const ACT = {
  id: "fire-laser",
  label: "Fire Laser",
  consumes: [{ res: "energy", amount: () => 3 }],
  produces: [],
  requires: {},
} as unknown as GameAction;

function makeDeps(overrides: Partial<MenuDeps> = {}) {
  const voyage = {
    getSnapshot: vi.fn(() => SNAP),
    getActualCost: vi.fn(() => 3),
    canAffordAction: vi.fn(() => true),
  };
  const registry = {
    getAction: vi.fn(() => ACT),
    getYardItem: vi.fn(() => ({
      id: "thruster",
      name: "Thruster",
      desc: "Fast",
      cost: 50,
      type: "module",
    })),
  };
  return {
    voyage,
    registry,
    ...overrides,
  } as unknown as MenuDeps & {
    voyage: typeof voyage;
    registry: typeof registry;
  };
}

describe("createMenu", () => {
  beforeEach(() => {
    document.body.innerHTML = `<div id="encounter-choices"></div>`;
  });

  it("adds and clears menu items", () => {
    const deps = makeDeps();
    const menu = createMenu(deps);
    const id = menu.addMenuItem("Do thing", () => {}, undefined, "act-1");
    expect(id).toBe("act-1");
    expect(document.querySelectorAll("#encounter-choices button")).toHaveLength(1);
    menu.clearMenu();
    expect(document.querySelectorAll("#encounter-choices button")).toHaveLength(0);
  });

  it("syncs action buttons with affordability", () => {
    const deps = makeDeps();
    const menu = createMenu(deps);
    menu.addMenuItem("Fire Laser", () => {}, undefined, "fire-laser");
    menu.syncActiveMenu();
    const b = document.querySelector<HTMLButtonElement>("#encounter-choices button")!;
    expect(b.textContent).toContain("Fire Laser");
    expect(b.disabled).toBe(false);
    deps.voyage.canAffordAction.mockReturnValue(false);
    menu.syncActiveMenu();
    expect(b.disabled).toBe(true);
  });

  it("disables yard items the player cannot afford and marks owned ones", () => {
    const yardSnap = { ...SNAP, phase: "YARD_CATEGORY", flux: 10, module: "Hull" } as SaveState;
    const deps = makeDeps({
      voyage: {
        getSnapshot: vi.fn(() => yardSnap),
        getActualCost: vi.fn(() => 3),
        canAffordAction: vi.fn(() => true),
      },
    });
    const menu = createMenu(deps);
    menu.addMenuItem("Buy Thruster", () => {}, undefined, undefined, "thruster");
    menu.syncActiveMenu();
    const b = document.querySelector<HTMLButtonElement>("#encounter-choices button")!;
    expect(b.disabled).toBe(true);

    const ownedSnap = { ...yardSnap, flux: 999, module: "Thruster" } as SaveState;
    deps.voyage.getSnapshot.mockReturnValue(ownedSnap);
    menu.syncActiveMenu();
    expect(b.disabled).toBe(true);
    expect(b.textContent).toContain("Thruster");
  });
});
