// @ts-expect-error - @types/node is not installed in this repo (see tests/e2e/plugins.spec.ts)
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import JSZip from "jszip";
import { ConduitDeck } from "../src/game/conduit";
import { GAME_DATA } from "../src/game/data";
import { PluginHost } from "../src/game/host";
import { isCompatible, parseManifest } from "../src/game/manifest";
import { Registry } from "../src/game/registry";
import { HOST_API_VERSION } from "../src/game/workerProtocol";
import type { HostDeps, VoyageLike } from "../src/game/workerProtocol";
import { Voyage } from "../src/game/voyage";
import type { GameAction, NodeDefinition } from "../src/game/types";
import manifestJson from "../packages/rift-salvager/manifest.json";

type Rule = { res: string; amount: number };
type ActionDef = {
  id: string;
  label: string;
  consumes?: Rule[];
  produces?: Rule[];
  [key: string]: unknown;
};
type NodeDef = { id: string; label: string; actions?: string[]; [key: string]: unknown };

function makeMockApi() {
  const handlers = new Map<string, (payload: unknown) => unknown>();
  const store = new Map<string, unknown>();
  const grants: unknown[] = [];
  const logs: string[] = [];
  let actionDef: ActionDef | undefined;
  let nodeDef: NodeDef | undefined;
  const api = {
    on: (event: string, fn: (payload: unknown) => unknown) => void handlers.set(event, fn),
    registerAction: (def: ActionDef) => void (actionDef = def),
    registerNode: (def: NodeDef) => void (nodeDef = def),
    grant: (op: unknown) => {
      grants.push(op);
      return Promise.resolve({ ok: true });
    },
    state: () => null,
    log: (msg: unknown) => void logs.push(String(msg)),
    storage: {
      get: (key: string) => Promise.resolve(store.get(key)),
      set: (key: string, value: unknown) => {
        store.set(key, value);
        return Promise.resolve(true);
      },
    },
  };
  return { api, handlers, store, grants, logs, getAction: () => actionDef, getNode: () => nodeDef };
}

async function loadPluginDefs() {
  const mock = makeMockApi();
  const mod = (await import("../packages/rift-salvager/main.js")) as {
    default: { mount: (api: unknown) => void; unmount: () => void };
  };
  mod.default.mount(mock.api);
  return mock;
}

function makeVoyage() {
  const registry = new Registry();
  for (const [id, def] of Object.entries(GAME_DATA.actions)) {
    registry.registerAction(id, def as GameAction);
  }
  for (const node of Object.values(GAME_DATA.nodes)) {
    registry.registerNode(node.id, node as NodeDefinition);
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
  const voyage = new Voyage(registry, config, conduit, undefined, { random: () => 0.5 });
  return { registry, voyage };
}

describe("rift-salvager manifest", () => {
  it("validates against the host API", () => {
    const manifest = parseManifest(manifestJson);
    expect(manifest.id).toBe("rift-salvager");
    expect(manifest.entry).toBe("main.js");
    expect(manifest.minApi).toBeLessThanOrEqual(HOST_API_VERSION);
    expect(isCompatible(manifest)).toBe(true);
    expect(manifest.permissions).toEqual([]);
  });
});

describe("rift-salvager worker entry", () => {
  it("registers the lossy salvage melt action and yard node", async () => {
    const mock = await loadPluginDefs();
    expect(mock.getAction()).toMatchObject({
      id: "salvage_melt",
      consumes: [
        { res: "energy", amount: 1 },
        { res: "fuel", amount: 10 },
      ],
      produces: [{ res: "flux", amount: 20 }],
    });
    expect(mock.getNode()).toMatchObject({ id: "salvage_yard", actions: ["salvage_melt"] });
    expect([...mock.handlers.keys()].sort()).toEqual(["afterAction", "afterJump"]);
    expect(mock.grants).toEqual([]);
  });

  it("audits melts per jump from real event payloads", async () => {
    const mock = await loadPluginDefs();
    const afterAction = mock.handlers.get("afterAction");
    const afterJump = mock.handlers.get("afterJump");
    expect(afterAction).toBeDefined();
    expect(afterJump).toBeDefined();

    // Real payloads from src/main.ts: { actionId, success } / { jumpCount }.
    await afterAction?.({ actionId: "rift-salvager:salvage_melt", success: true });
    await afterAction?.({ actionId: "rift-salvager:salvage_melt", success: true });
    expect(mock.store.get("meltsThisJump")).toBe(2);

    // Other actions and failures do not count.
    await afterAction?.({ actionId: "res_harvest", success: true });
    await afterAction?.({ actionId: "rift-salvager:salvage_melt", success: false });
    expect(mock.store.get("meltsThisJump")).toBe(2);

    await afterJump?.({ jumpCount: 5 });
    expect(mock.store.get("meltsThisJump")).toBe(0);
    expect(mock.store.get("lastJump")).toBe(5);
    expect(mock.grants).toEqual([]);
  });
});

describe("rift-salvager actual effect", () => {
  it("executes through host validation into voyage state", async () => {
    const mock = await loadPluginDefs();
    const { registry, voyage } = makeVoyage();
    const deps: HostDeps = {
      voyage: voyage as unknown as VoyageLike,
      registry: {
        registerAction: (pluginId, def) =>
          registry.registerAction(`${pluginId}:${def.id}`, def as never),
        registerNode: (pluginId, def) =>
          registry.registerNode(`${pluginId}:${def.id}`, def as never),
        registerCutscene: () => {},
        removePlugin: () => {},
      },
      log: () => {},
      events: { on: () => {} },
    };
    const host = new PluginHost(deps);
    const registerOne = (
      host as unknown as {
        registerOne(id: string, kind: "action" | "node", def: unknown): void;
      }
    ).registerOne.bind(host);
    registerOne("rift-salvager", "action", mock.getAction());
    registerOne("rift-salvager", "node", mock.getNode());

    // Host namespaces node action references.
    expect(registry.getNode("rift-salvager:salvage_yard")?.actions).toEqual([
      "rift-salvager:salvage_melt",
    ]);

    const before = {
      energy: voyage.state.energy,
      fuel: voyage.state.fuel,
      flux: voyage.state.flux,
    };
    const result = voyage.executeAction("rift-salvager:salvage_melt");
    expect(result).toMatchObject({ isMenu: false, success: true });
    expect(voyage.state.energy).toBe(before.energy - 1);
    expect(voyage.state.fuel).toBe(before.fuel - 10);
    expect(voyage.state.flux).toBe(before.flux + 20);
  });

  it("is gated by affordability: no fuel or no energy means no melt", async () => {
    const mock = await loadPluginDefs();
    const { registry, voyage } = makeVoyage();
    registry.registerAction("rift-salvager:salvage_melt", {
      label: mock.getAction()?.label ?? "Salvage Melt",
      requires: {},
      consumes: (mock.getAction()?.consumes ?? []).map((r) => ({
        res: r.res,
        amount: () => r.amount,
      })),
      produces: (mock.getAction()?.produces ?? []).map((r) => ({
        res: r.res,
        amount: () => r.amount,
      })),
    });

    voyage.state.fuel = 5;
    const lowFuel = voyage.executeAction("rift-salvager:salvage_melt");
    expect(lowFuel).toMatchObject({ isMenu: false, success: false });
    expect(voyage.state.fuel).toBe(5);

    voyage.state.fuel = 50;
    voyage.state.energy = 0;
    const noEnergy = voyage.executeAction("rift-salvager:salvage_melt");
    expect(noEnergy).toMatchObject({ isMenu: false, success: false });
    expect(voyage.state.fuel).toBe(50);
  });

  it("rates the melt below baseline options so it cannot out-loop them", async () => {
    const mock = await loadPluginDefs();
    const meltFlux = mock.getAction()?.produces?.find((r) => r.res === "flux")?.amount ?? 0;
    const state = makeVoyage().voyage.state;
    const config = GAME_DATA.config;
    const questFlux =
      GAME_DATA.actions.hub_quest_easy?.produces
        ?.find((r) => r.res === "flux")
        ?.amount(state, config) ?? 0;
    const harvestFlux =
      GAME_DATA.actions.res_harvest?.produces
        ?.find((r) => r.res === "flux")
        ?.amount(state, config) ?? 0;
    expect(meltFlux).toBe(20);
    expect(meltFlux).toBeLessThan(questFlux);
    expect(meltFlux).toBeLessThan(harvestFlux);
  });
});

describe("rift-salvager bundle", () => {
  it("ships manifest.json and main.js matching the sources", async () => {
    const zip = await JSZip.loadAsync(readFileSync("public/plugins/rift-salvager.zip"));
    const names = Object.keys(zip.files).filter((n) => !zip.files[n]?.dir);
    expect(names.sort()).toEqual(["main.js", "manifest.json"]);
    const zippedManifest = JSON.parse((await zip.file("manifest.json")?.async("text")) ?? "{}");
    expect(zippedManifest).toMatchObject({ id: "rift-salvager", entry: "main.js" });
    expect(await zip.file("main.js")?.async("text")).toBe(
      readFileSync("packages/rift-salvager/main.js", "utf8"),
    );
  });
});
