import { describe, expect, it } from "vitest";
import { ConduitDeck } from "../src/game/conduit";
import { GAME_DATA } from "../src/game/data";
import { Registry } from "../src/game/registry";
import { SaveSystem, migratePayload, SAVE_VERSION } from "../src/game/save";
import type { StorageLike } from "../src/game/save";
import { Voyage } from "../src/game/voyage";

function makeVoyage() {
  const conduit = new ConduitDeck({
    runway: GAME_DATA.runway,
    sectorPoolCounts: GAME_DATA.sectorPoolCounts,
    waypointHubInterval: GAME_DATA.config.WAYPOINT_HUB_INTERVAL,
    adjectives: GAME_DATA.procedural.adjectives,
    nouns: GAME_DATA.procedural.nouns,
    random: () => 0.5,
  });
  conduit.init();
  return new Voyage(new Registry(), GAME_DATA.config, conduit);
}

function makeStorage(): StorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => {
      map.set(key, value);
    },
    removeItem: (key) => {
      map.delete(key);
    },
  };
}

// A minimally valid persisted payload. Each rejection test below takes this
// and violates exactly one isValidPayload clause.
function validPayload(): Record<string, unknown> {
  return {
    jumpCount: 3,
    sectorBag: ["hunt"],
    hull: 80,
    fuel: 40,
    flux: 10,
    rep: 1,
    energy: 2,
    engineTier: 1,
    weaponTier: 0,
    module: "None",
    carriage: "None",
    crew: "None",
    dimId: "hunt",
    dimName: "Wilds",
    isSurveyed: false,
    seenCutscenes: ["corvus-tutorial:wp1"],
    storyProgress: {},
    pluginState: { "corvus-tutorial": { melts: 2 } },
    enabledPlugins: ["rift-salvager"],
    hostStorage: { "rift-salvager": { melts: 2 } },
    version: SAVE_VERSION,
  };
}

describe("migratePayload rejection", () => {
  it("accepts a well-formed payload (sanity check)", () => {
    expect(migratePayload(validPayload())?.jumpCount).toBe(3);
  });

  it("rejects jumpCount below 1", () => {
    expect(migratePayload({ ...validPayload(), jumpCount: 0 })).toBeNull();
  });

  it("rejects negative hull", () => {
    expect(migratePayload({ ...validPayload(), hull: -1 })).toBeNull();
  });

  it("rejects hull above 10000", () => {
    expect(migratePayload({ ...validPayload(), hull: 10001 })).toBeNull();
  });

  it("rejects negative fuel", () => {
    expect(migratePayload({ ...validPayload(), fuel: -1 })).toBeNull();
  });

  it("rejects negative flux", () => {
    expect(migratePayload({ ...validPayload(), flux: -1 })).toBeNull();
  });

  it("rejects negative rep", () => {
    expect(migratePayload({ ...validPayload(), rep: -1 })).toBeNull();
  });

  it("rejects energy above 10000", () => {
    expect(migratePayload({ ...validPayload(), energy: 10001 })).toBeNull();
  });

  it("rejects engineTier above 100", () => {
    expect(migratePayload({ ...validPayload(), engineTier: 101 })).toBeNull();
  });

  it("rejects weaponTier above 100", () => {
    expect(migratePayload({ ...validPayload(), weaponTier: 101 })).toBeNull();
  });

  it("rejects seenCutscenes that is not an array", () => {
    expect(migratePayload({ ...validPayload(), seenCutscenes: "wp1" })).toBeNull();
  });

  it("rejects seenCutscenes with non-string entries", () => {
    expect(migratePayload({ ...validPayload(), seenCutscenes: ["wp1", 7] })).toBeNull();
  });

  it("rejects sectorBag with non-string entries", () => {
    expect(migratePayload({ ...validPayload(), sectorBag: ["hunt", 42] })).toBeNull();
  });

  it("rejects pluginState that is not a record", () => {
    expect(migratePayload({ ...validPayload(), pluginState: ["x"] })).toBeNull();
  });

  it("rejects pluginState with more than 200 keys", () => {
    const pluginState = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`key-${i}`, i]));
    expect(migratePayload({ ...validPayload(), pluginState })).toBeNull();
  });

  it("rejects pluginState whose JSON exceeds 64KB", () => {
    const pluginState = { big: "x".repeat(64 * 1024 + 1) };
    expect(migratePayload({ ...validPayload(), pluginState })).toBeNull();
  });

  it("rejects storyProgress with an unknown status string", () => {
    const storyProgress = {
      "fixture-plugin:lost-lantern": {
        status: "paused",
        nodeId: "signal",
        waiting: false,
        trace: [],
      },
    };
    expect(migratePayload({ ...validPayload(), storyProgress })).toBeNull();
  });

  it("rejects storyProgress whose trace exceeds 16 entries", () => {
    const storyProgress = {
      "fixture-plugin:lost-lantern": {
        status: "active",
        nodeId: "signal",
        waiting: false,
        trace: Array.from({ length: 17 }, (_, i) => ({
          nodeId: `n${i}`,
          choiceId: `c${i}`,
        })),
      },
    };
    expect(migratePayload({ ...validPayload(), storyProgress })).toBeNull();
  });

  it("rejects a version more than 10 above SAVE_VERSION", () => {
    expect(migratePayload({ ...validPayload(), version: SAVE_VERSION + 11 })).toBeNull();
  });
});

describe("SaveSystem save/load round-trip", () => {
  it("returns the migrated payload with enabledPlugins and hostStorage", () => {
    const storage = makeStorage();
    const voyage = makeVoyage();
    const enabled = ["corvus-tutorial", "rift-salvager"];
    const hostStorage = { "rift-salvager": { melts: 2 } };
    const save = new SaveSystem({
      storage,
      voyage,
      getEnabledPlugins: () => enabled,
      getHostStorage: () => hostStorage,
    });
    save.save();

    const loaded = save.load();
    expect(loaded).not.toBeNull();
    expect(loaded?.version).toBe(SAVE_VERSION);
    expect(loaded?.enabledPlugins).toEqual(enabled);
    expect(loaded?.hostStorage).toEqual(hostStorage);
    expect(loaded?.jumpCount).toBe(voyage.state.jumpCount);
    expect(loaded?.pluginState).toEqual({});
    expect(loaded?.storyProgress).toEqual({});
    expect(loaded?.seenCutscenes).toEqual([]);
  });
});
