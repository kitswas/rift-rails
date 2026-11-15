import { describe, expect, it } from "vitest";
import { EngineService } from "../src/game/engine";
import type { EngineDeps } from "../src/game/engine";
import { GAME_DATA } from "../src/game/data";
import { Registry } from "../src/game/registry";
import { SaveSystem } from "../src/game/save";
import { ConduitDeck } from "../src/game/conduit";
import { Voyage } from "../src/game/voyage";

describe("EngineService corrupt save recovery", () => {
  it("clears an unreadable save and logs before starting a fresh voyage", () => {
    const values = new Map([[SaveSystem.STORAGE_KEY, "{broken json"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => void values.delete(key),
    };
    const registry = new Registry();
    const conduit = new ConduitDeck({
      runway: GAME_DATA.runway,
      sectorPoolCounts: GAME_DATA.sectorPoolCounts,
      waypointHubInterval: GAME_DATA.config.WAYPOINT_HUB_INTERVAL,
      adjectives: GAME_DATA.procedural.adjectives,
      nouns: GAME_DATA.procedural.nouns,
      random: () => 0.5,
    });
    conduit.init();
    const voyage = new Voyage(registry, GAME_DATA.config, conduit);
    const save = new SaveSystem({ storage, voyage });
    const logs: string[] = [];
    const deps: EngineDeps = {
      syncUI: () => {},
      addMenuItem: () => "",
      clearMenu: () => {},
      syncActiveMenu: () => {},
      syncSensors: () => {},
      syncSettings: () => {},
      disableAllButtons: () => {},
      setChoices: () => {},
      resetNav: () => {},
      appendLog: (message) => logs.push(message),
    };
    const engine = new EngineService({
      registry,
      config: GAME_DATA.config,
      voyage,
      deps,
      save,
      phases: GAME_DATA.phases,
      transitions: GAME_DATA.transitions,
    });

    engine.ignite();

    expect(storage.getItem(SaveSystem.STORAGE_KEY)).toBeNull();
    expect(voyage.getPhase()).toBe("IDLE");
    expect(logs).toContain("Auto-save unreadable; starting a new voyage.");
  });
});
