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
    <div id="nav-vector">
      <div class="dial-face"></div>
      <span id="nav-vector-status">Vector idle</span>
    </div>
    <svg id="rift-vector-needle"></svg>
  `;
}

function makeDeps(overrides: Partial<NavDeps> = {}) {
  const motion = {
    set: vi.fn((entry, target) => {
      if (!entry) return;
      entry.value = target;
      entry.target = target;
      entry.velocity = 0;
      entry.update?.(target, 1);
    }),
  };
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

  it("renders one compass node per choice", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    nav.bindDial(document.getElementById("nav-vector")!);
    const nodes = document.querySelectorAll(".compass-node");
    expect(nodes).toHaveLength(2);
    expect((nodes[0] as SVGGElement).dataset.slot).toBe("0");
  });

  it("commits a jump when the needle reaches the selected node", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    nav.bindDial(document.getElementById("nav-vector")!);
    const nodes = document.querySelectorAll<SVGGElement>(".compass-node");
    nodes[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(nodes[0]!.getAttribute("aria-pressed")).toBe("true");
    expect(deps.conduit.commitTrajectory).toHaveBeenCalledTimes(1);
    expect(deps.finalizeJump).toHaveBeenCalledWith("committed-id", "Committed Dim");
    expect(document.getElementById("nav-vector-status")!.textContent).toBe("Vector breaching");
  });

  it("cannot commit twice while locked", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    nav.bindDial(document.getElementById("nav-vector")!);
    const nodes = document.querySelectorAll<SVGGElement>(".compass-node");
    nodes[0]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    nodes[1]!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    expect(deps.conduit.commitTrajectory).toHaveBeenCalledTimes(1);
    expect(deps.finalizeJump).toHaveBeenCalledTimes(1);
  });

  it("resets to idle state", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices(CHOICES);
    nav.bindDial(document.getElementById("nav-vector")!);
    nav.resetNav();
    expect(document.querySelectorAll(".compass-node")).toHaveLength(0);
    expect(document.getElementById("nav-vector-status")!.textContent).toBe("Vector idle");
  });

  it("accepts keyboard activation on a compass node", () => {
    const deps = makeDeps();
    const nav = createNav(deps);
    nav.setChoices([CHOICES[0]!]);
    nav.bindDial(document.getElementById("nav-vector")!);
    const node = document.querySelector<SVGGElement>(".compass-node")!;
    node.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    expect(deps.conduit.commitTrajectory).toHaveBeenCalledTimes(1);
  });
});
