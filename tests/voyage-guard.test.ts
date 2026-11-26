import { describe, expect, it, vi } from "vitest";
import { ConduitDeck } from "../src/game/conduit";
import { GAME_DATA } from "../src/game/data";
import { Registry } from "../src/game/registry";
import type { GameAction } from "../src/game/types";
import { Voyage, createInitialState } from "../src/game/voyage";

// executeAction must reject actions whose rules carry negative/non-finite
// amounts (plugins can register arbitrary rule functions) without touching state.
function makeVoyage(actionId: string, action: GameAction) {
  const registry = new Registry();
  registry.registerAction(actionId, action);
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
  const voyage = new Voyage(registry, config, conduit, createInitialState(config), {
    random: () => 0.5,
  });
  return voyage;
}

function snapshot(voyage: Voyage) {
  const { hull, fuel, flux, rep, energy, engineTier, weaponTier } = voyage.state;
  return { hull, fuel, flux, rep, energy, engineTier, weaponTier };
}

describe("voyage executeAction rule guard", () => {
  it("rejects a consume rule with NaN amount and leaves state unchanged", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const voyage = makeVoyage("bad_nan_consume", {
        label: "Bad NaN Consume",
        requires: {},
        consumes: [{ res: "fuel", amount: () => Number.NaN }],
        produces: [{ res: "flux", amount: () => 5 }],
      });
      const before = snapshot(voyage);
      const result = voyage.executeAction("bad_nan_consume");
      expect(result).toMatchObject({ isMenu: false, success: false });
      expect(snapshot(voyage)).toEqual(before);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("rejects a consume rule with a negative amount and leaves state unchanged", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const voyage = makeVoyage("bad_neg_consume", {
        label: "Bad Negative Consume",
        requires: {},
        consumes: [{ res: "fuel", amount: () => -5 }],
        produces: [{ res: "flux", amount: () => 5 }],
      });
      const before = snapshot(voyage);
      const result = voyage.executeAction("bad_neg_consume");
      expect(result).toMatchObject({ isMenu: false, success: false });
      expect(snapshot(voyage)).toEqual(before);
    } finally {
      vi.restoreAllMocks();
    }
  });

  it("rejects a produce rule with NaN amount and leaves state unchanged", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const voyage = makeVoyage("bad_nan_produce", {
        label: "Bad NaN Produce",
        requires: {},
        consumes: [{ res: "fuel", amount: () => 1 }],
        produces: [{ res: "flux", amount: () => Number.NaN }],
      });
      const before = snapshot(voyage);
      const result = voyage.executeAction("bad_nan_produce");
      expect(result).toMatchObject({ isMenu: false, success: false });
      expect(snapshot(voyage)).toEqual(before);
    } finally {
      vi.restoreAllMocks();
    }
  });
});
