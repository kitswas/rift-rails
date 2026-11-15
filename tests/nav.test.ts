import { beforeEach, describe, expect, it, vi } from "vitest";
import { createNav, needleAngle, nearestSlot } from "../src/ui/nav";
import type { NavDeps } from "../src/ui/nav";
import type { Trajectory } from "../src/game/types";

const CHOICES: Trajectory[] = [
  { id: "a", name: "Alpha Dim", returnId: null },
  { id: "b", name: "Beta Dim", returnId: null },
];

function seedDom(): void {
  document.body.innerHTML = `
    <div id="nav-screen"></div>
    <div id="nav-choices"></div>
    <div id="nav-vector"><div id="rift-vector-scale"></div></div>
    <div id="nav-vector-status">Vector idle</div>
    <div id="vector-slot-0"></div>
    <div id="vector-slot-1"></div>
    <svg id="rift-vector-needle"></svg>
  `;
}

function makeDeps(overrides: Partial<NavDeps> = {}) {
  const motion = { set: vi.fn() };
  const conduit = {
    commitTrajectory: vi.fn(() => ({ dimId: "committed-id", dimName: "Committed Dim" })),
  };
  const finalizeJump = vi.fn();
  const registry = { getNode: () => ({ id: "a", label: "Node A" }) };
  return {
    motion,
    conduit,
    finalizeJump,
    registry,
    ...overrides,
  } as NavDeps & {
    motion: typeof motion;
    conduit: typeof conduit;
    finalizeJump: typeof finalizeJump;
    registry: typeof registry;
  };
}

describe("needleAngle / nearestSlot", () => {
  it("centres the needle for a single choice", () => {
    expect(needleAngle(0, 1)).toBe(90);
    expect(nearestSlot(0, 1)).toBe(0);
    expect(nearestSlot(359, 1)).toBe(0);
  });

  it("maps slots to dial angles for two choices", () => {
    expect(needleAngle(0, 2)).toBe(305);
    expect(needleAngle(1, 2)).toBe(55);
    expect(nearestSlot(305, 2)).toBe(0);
    expect(nearestSlot(55, 2)).toBe(1);
    expect(nearestSlot(350, 2)).toBe(0);
  });
});

describe("createNav", () => {
  beforeEach(() => {
    seedDom();
  });

  it("renders one carriage button per choice", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    const carriages = document.querySelectorAll(".nav-carriage");
    expect(carriages).toHaveLength(2);
    expect((carriages[0] as HTMLElement).dataset.slot).toBe("0");
  });

  it("arms on first tap and confirms on second", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    const buttons = document.querySelectorAll<HTMLButtonElement>(".nav-carriage");
    buttons[0]!.click();
    expect(buttons[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(deps.conduit.commitTrajectory).not.toHaveBeenCalled();
    buttons[0]!.click();
    expect(deps.conduit.commitTrajectory).toHaveBeenCalledTimes(1);
    expect(deps.finalizeJump).toHaveBeenCalledWith("committed-id", "Committed Dim");
    expect(document.getElementById("nav-vector-status")!.textContent).toBe("Vector breaching");
  });

  it("cannot confirm or commit while locked, even after arming elsewhere", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    const buttons = document.querySelectorAll<HTMLButtonElement>(".nav-carriage");
    buttons[0]!.click();
    buttons[0]!.click();
    expect(deps.conduit.commitTrajectory).toHaveBeenCalledTimes(1);
    buttons[1]!.click();
    buttons[1]!.click();
    expect(deps.conduit.commitTrajectory).toHaveBeenCalledTimes(1);
    expect(deps.finalizeJump).toHaveBeenCalledTimes(1);
  });

  it("resets to idle state", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    nav.resetNav();
    expect(document.getElementById("nav-choices")!.innerHTML).toBe("");
    expect(document.getElementById("nav-vector-status")!.textContent).toBe("Vector idle");
  });

  it("marks a single choice as solo", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices([CHOICES[0]!]);
    const b = document.querySelector<HTMLButtonElement>(".nav-carriage")!;
    expect(b.dataset.single).toBe("true");
  });
});
