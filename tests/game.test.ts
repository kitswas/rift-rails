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

describe("conduit plugin node names", () => {
  it("uses a registered plugin node label when no procedural nouns exist", () => {
    const conduit = new ConduitDeck({
      runway: GAME_DATA.runway,
      sectorPoolCounts: GAME_DATA.sectorPoolCounts,
      waypointHubInterval: GAME_DATA.config.WAYPOINT_HUB_INTERVAL,
      adjectives: GAME_DATA.procedural.adjectives,
      nouns: GAME_DATA.procedural.nouns,
      getNodeLabel: (id) => (id === "plugin:yard" ? "Salvage Yard" : undefined),
      random: () => 0.5,
    });

    expect(conduit.generateDimensionForId("plugin:yard")).toEqual({
      id: "plugin:yard",
      name: "Salvage Yard",
    });
  });

  it("filters removed plugin nodes from the bag and never selects them", () => {
    const conduit = new ConduitDeck({
      runway: [],
      sectorPoolCounts: {},
      waypointHubInterval: 10,
      adjectives: [],
      nouns: {},
    });
    conduit.init(["removed:one", "another:one", "removed:two", "res"]);

    conduit.removePluginNodes("removed");

    expect(conduit.serialize()).toEqual(["another:one", "res"]);
    expect(conduit.resolveNextNodeId(1)).not.toMatch(/^removed:/);
  });
});

describe("voyage executeAction", () => {
  it("keeps deep hunt affordable without an engine upgrade", () => {
    const { registry, voyage } = makeVoyage();
    voyage.state.weaponTier = GAME_DATA.config.HUNT_DEEP_WPN_REQ;
    const action = registry.getAction("hunt_deep");

    expect(action).toBeDefined();
    if (!action) throw new Error("missing hunt_deep action");
    expect(voyage.state.energy).toBe(GAME_DATA.config.START_ENERGY);
    expect(voyage.canAffordAction(action)).toBe(true);
  });

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
  it("preserves saved plugin nodes that are registered before loadState", () => {
    const { registry, voyage } = makeVoyage();
    registry.registerNode("enabled:sector", {
      id: "enabled:sector",
      label: "Enabled Sector",
      desc: "A rehydrated plugin node.",
      exploreCost: 1,
      isHub: false,
      actions: [],
    });
    const saved = voyage.serialize();
    saved.dimId = "enabled:sector";
    saved.dimName = "Custom Saved Name";
    saved.isSurveyed = true;
    saved.sectorBag = ["enabled:sector", "removed:sector"];

    voyage.loadState(saved);

    expect(voyage.getSnapshot()).toMatchObject({
      dimId: "enabled:sector",
      dimName: "Custom Saved Name",
      isSurveyed: true,
    });
    expect(voyage.serialize().sectorBag).toEqual(["enabled:sector"]);
  });

  it("falls back from missing plugin dimensions and filters stale saved sector ids", () => {
    const { voyage } = makeVoyage();
    const saved = voyage.serialize();
    saved.dimId = "missing-plugin:sector";
    saved.dimName = "Lost Sector";
    saved.isSurveyed = true;
    saved.sectorBag = ["res", "missing-plugin:sector", "missing-plugin:next"];

    voyage.loadState(saved);

    expect(voyage.getSnapshot()).toMatchObject({
      dimId: "hub",
      dimName: "Scrapyard Outpost",
      isSurveyed: false,
    });
    expect(voyage.serialize().sectorBag).toEqual(["res"]);
  });

  it("round-trips serialize and loadState without changing hull", () => {
    const { voyage } = makeVoyage();
    voyage.markCutsceneSeen(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
    const before = voyage.serialize();
    voyage.loadState(JSON.parse(JSON.stringify(before)) as typeof before);
    const after = voyage.serialize();
    expect(after.hull).toBe(before.hull);
    expect(after.seenCutscenes).toEqual(before.seenCutscenes);
  });

  it("stores the final cutscene in the seen list", () => {
    const { voyage } = makeVoyage();
    voyage.markCutsceneSeen(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
    expect(voyage.getSnapshot().seenCutscenes).toContain(GAME_DATA.config.CORVUS_FINAL_CUTSCENE);
  });

  it("preserves legacy saves containing the old final cutscene id", () => {
    const { voyage } = makeVoyage();
    voyage.markCutsceneSeen("wp5");
    expect(voyage.getSnapshot().seenCutscenes).toContain("wp5");
  });
});
