import { describe, expect, it } from "vitest";
import { ConduitDeck } from "../src/game/conduit";
import { GAME_DATA } from "../src/game/data";
import { Registry } from "../src/game/registry";
import { Voyage } from "../src/game/voyage";
import type { VoyageHooks } from "../src/game/voyage";
import type { GameAction } from "../src/game/types";

// Voyage core with an injected registry (cherry-picked from try/svelte
// tests/game.test.ts, which used the VoyageSession singleton instead).
function makeVoyage(hooks: VoyageHooks = {}) {
  const registry = new Registry();
  for (const [id, def] of Object.entries(GAME_DATA.actions)) {
    registry.registerAction(id, def as GameAction);
  }
  for (const node of Object.values(GAME_DATA.nodes)) {
    registry.registerNode(node.id, node);
  }
  const config = GAME_DATA.config;
  const conduit = new ConduitDeck({
    runway: GAME_DATA.runway,
    sectorPoolCounts: GAME_DATA.sectorPoolCounts,
    waypointHubInterval: config.WAYPOINT_HUB_INTERVAL,
    adjectives: GAME_DATA.procedural.adjectives,
    nouns: GAME_DATA.procedural.nouns,
    random: () => 0.5,
  });
  conduit.init();
  const voyage = new Voyage(registry, config, conduit, undefined, hooks);
  return { registry, voyage };
}

describe("voyage executeAction", () => {
  it("consumes energy and produces flux", () => {
    const { voyage } = makeVoyage();
    const before = { energy: voyage.state.energy, flux: voyage.state.flux };
    const result = voyage.executeAction("res_harvest");
    expect(result.isMenu).toBe(false);
    if (result.isMenu) throw new Error("unexpected menu result");
    expect(result.success).toBe(true);
    expect(voyage.state.energy).toBe(before.energy - GAME_DATA.config.RES_HARVEST_ENERGY);
    expect(voyage.state.flux).toBe(before.flux + GAME_DATA.config.RES_HARVEST_FLUX);
  });

  it("returns failure for unknown action ids", () => {
    const { voyage } = makeVoyage();
    expect(voyage.executeAction("no_such_action")).toEqual({ isMenu: false, success: false });
  });

  it("returns menu target for menu actions", () => {
    const { voyage } = makeVoyage();
    expect(voyage.executeAction("hub_yard")).toEqual({
      isMenu: true,
      menuTarget: "YARD_ROOT",
    });
  });

  it("executes plugin-registered actions from the injected registry", () => {
    const { registry, voyage } = makeVoyage();
    registry.registerAction("smuggle_fuel", {
      label: "Smuggle Fuel",
      requires: {},
      consumes: [{ res: "flux", amount: () => 10 }],
      produces: [{ res: "fuel", amount: () => 15 }],
      logSuccess: "Smuggled 15 fuel.",
    });
    voyage.state.flux = 10;
    const beforeFuel = voyage.state.fuel;
    const result = voyage.executeAction("smuggle_fuel");
    expect(result.isMenu).toBe(false);
    if (result.isMenu) throw new Error("unexpected menu result");
    expect(result.success).toBe(true);
    expect(voyage.state.flux).toBe(0);
    expect(voyage.state.fuel).toBe(beforeFuel + 15);
  });
});

describe("voyage canSurvive", () => {
  it("is true when fuel covers travel", () => {
    const { voyage } = makeVoyage();
    expect(voyage.canSurvive()).toBe(true);
  });

  it("is false when dead", () => {
    const { voyage } = makeVoyage();
    voyage.state.hull = GAME_DATA.config.DEATH_HULL_THRESHOLD;
    expect(voyage.canSurvive()).toBe(false);
  });

  it("is false when stranded (low hull, no fuel, START phase)", () => {
    const { voyage } = makeVoyage();
    voyage.state.hull = 5; // > DEATH threshold, <= DESPERATE_HULL_COST
    voyage.state.fuel = 0;
    expect(voyage.state.phase).toBe("START");
    expect(voyage.canSurvive()).toBe(false);
  });

  it("is true when idle with enough energy to explore", () => {
    const { voyage } = makeVoyage();
    voyage.state.hull = 5;
    voyage.state.fuel = 0;
    voyage.setPhase("IDLE");
    expect(voyage.state.energy).toBeGreaterThanOrEqual(1); // hub exploreCost
    expect(voyage.canSurvive()).toBe(true);
  });
});

describe("voyage serialize", () => {
  it("round-trips serialize and loadState without changing hull", () => {
    const { voyage } = makeVoyage();
    voyage.markCutsceneSeen(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
    const before = voyage.serialize();
    voyage.loadState(JSON.parse(JSON.stringify(before)) as typeof before);
    const after = voyage.serialize();
    expect(after.hull).toBe(before.hull);
    expect(after.seenCutscenes).toEqual(before.seenCutscenes);
  });

  it("marks observer departed after final cutscene", () => {
    const { voyage } = makeVoyage();
    expect(voyage.hasObserverDeparted()).toBe(false);
    voyage.markCutsceneSeen(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
    expect(voyage.hasObserverDeparted()).toBe(true);
    expect(voyage.getSnapshot().seenCutscenes).toContain(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
  });

  it("recognizes legacy saves containing the old final cutscene id", () => {
    const { voyage } = makeVoyage();
    voyage.markCutsceneSeen("wp5");
    expect(voyage.hasObserverDeparted()).toBe(true);
  });
});
