// @ts-expect-error - @types/node is not installed in this repo (see tests/field-repair.test.ts)
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, it, vi } from "vitest";
import manifest from "../packages/glass-courier/manifest.json";
import glassCourier from "../packages/glass-courier/main";
import { ConduitDeck } from "../src/game/conduit";
import { GAME_DATA } from "../src/game/data";
import { isCompatible, parseManifest } from "../src/game/manifest";
import { Registry } from "../src/game/registry";
import { StorylineService, validateStoryline } from "../src/game/storyline";
import type { StoryScene, StoryTrigger } from "../src/game/storyline";
import { Voyage } from "../src/game/voyage";
import type { RegisteredStoryline } from "../src/game/workerProtocol";

const PLUGIN_ID = "glass-courier";
const STORAGE_KEY = "logged-branches";

type Listener = (payload: unknown) => void;

function actionIdOf(trigger: StoryTrigger | undefined): string | null {
  return trigger?.event === "afterAction" ? trigger.actionId : null;
}

function makeVoyage(): Voyage {
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

function mountPlugin(storage = new Map<string, unknown>()) {
  const definitions: RegisteredStoryline[] = [];
  const listeners = new Map<string, Listener[]>();
  const logs: string[] = [];
  const api = {
    on: (event: string, fn: Listener) => {
      listeners.set(event, [...(listeners.get(event) ?? []), fn]);
    },
    registerAction: () => {},
    registerNode: () => {},
    registerStoryline: (def: RegisteredStoryline) => {
      definitions.push(def);
    },
    registerCutscene: () => {},
    grant: vi.fn(async () => ({ ok: false as const, reason: "narrative-only" })),
    state: () => ({ phase: "IDLE" }),
    log: (msg: unknown) => {
      logs.push(String(msg));
    },
    storage: {
      get: async (key: string) => storage.get(key),
      set: async (key: string, value: unknown) => {
        storage.set(key, value);
        return true;
      },
    },
  };
  glassCourier.mount(api as unknown as Parameters<typeof glassCourier.mount>[0]);
  return { definitions, listeners, logs, storage, grant: api.grant };
}

async function fire(listeners: Map<string, Listener[]>, actionId: string, success = true) {
  for (const fn of listeners.get("afterAction") ?? []) fn({ actionId, success });
  await new Promise<void>((resolve) => setTimeout(resolve, 0));
}

describe("glass-courier manifest and bundle", () => {
  it("declares a permission-free API v4 narrative plugin", () => {
    const parsed = parseManifest(manifest);
    expect(parsed).toMatchObject({
      id: PLUGIN_ID,
      name: "Glass Courier",
      version: "1.0.0",
      minApi: 4,
      entry: "main.js",
      permissions: [],
    });
    expect(isCompatible(parsed)).toBe(true);
  });

  it("ships the manifest and entry in its bundled zip", async () => {
    const zip = await JSZip.loadAsync(readFileSync("public/plugins/glass-courier.zip"));
    expect(Object.keys(zip.files).sort()).toEqual(["main.js", "manifest.json"]);
    const manifestText = await zip.file("manifest.json")?.async("string");
    expect(parseManifest(JSON.parse(manifestText ?? "{}"))).toEqual(parseManifest(manifest));
  });
});

describe("glass-courier storyline", () => {
  it("registers a valid definition using real action IDs", () => {
    const { definitions } = mountPlugin();
    expect(definitions).toHaveLength(1);
    const definition = validateStoryline(definitions[0]);
    expect(definition).not.toBeNull();
    if (!definition) return;

    const real = new Set(Object.keys(GAME_DATA.actions));
    const startId = actionIdOf(definition.start);
    expect(startId).not.toBeNull();
    expect(real.has(startId ?? "")).toBe(true);
    expect(definition.nodes).toHaveLength(3);

    const first = definition.nodes.find((node) => node.id === definition.first);
    expect(first?.choices).toHaveLength(2);
    const branchIds = (first?.choices ?? []).map((choice) => {
      const branch = definition.nodes.find((node) => node.id === choice.next);
      expect(branch?.trigger).toEqual({
        event: "afterAction",
        actionId: expect.any(String),
        success: true,
      });
      const id = actionIdOf(branch?.trigger);
      expect(real.has(id ?? "")).toBe(true);
      return id;
    });
    expect(new Set([startId, ...branchIds]).size).toBe(3);
  });

  it("resolves both branches from afterAction events", () => {
    const { definitions } = mountPlugin();
    const definition = validateStoryline(definitions[0]);
    expect(definition).not.toBeNull();
    if (!definition) return;
    const first = definition.nodes.find((node) => node.id === definition.first);
    const startId = actionIdOf(definition.start);
    expect(first).toBeDefined();
    expect(startId).not.toBeNull();
    if (!first || !startId) return;

    for (const [choiceIndex, choice] of first.choices.entries()) {
      const branch = definition.nodes.find((node) => node.id === choice.next);
      const branchId = actionIdOf(branch?.trigger);
      expect(branch).toBeDefined();
      expect(branchId).not.toBeNull();
      expect(branch?.choices).toHaveLength(1);
      if (!branch || !branchId) continue;

      const voyage = makeVoyage();
      const scenes: StoryScene[] = [];
      const choices: ((index: number) => void)[] = [];
      const service = new StorylineService(voyage, {
        show: (scene, choose) => {
          scenes.push(scene);
          choices.push(choose);
        },
      });
      service.register(PLUGIN_ID, definition);

      service.handleEvent("afterAction", { actionId: startId, success: false });
      expect(scenes).toHaveLength(0);
      service.handleEvent("afterAction", { actionId: startId, success: true });
      expect(scenes.map((scene) => scene.node.id)).toEqual([first.id]);

      choices[0]?.(choiceIndex);
      const key = `${PLUGIN_ID}:${definition.id}`;
      expect(voyage.state.storyProgress[key]?.waiting).toBe(true);
      service.handleEvent("afterAction", { actionId: branchId, success: false });
      expect(scenes).toHaveLength(1);
      service.handleEvent("afterAction", { actionId: branchId, success: true });
      expect(scenes.at(-1)?.node.id).toBe(branch.id);

      choices[1]?.(0);
      expect(service.journal()[0]).toMatchObject({ status: "complete", pluginId: PLUGIN_ID });
      expect(voyage.state.storyProgress[key]?.trace).toEqual([
        { nodeId: first.id, choiceId: choice.id },
        { nodeId: branch.id, choiceId: branch.choices[0]?.id },
      ]);
    }
  });

  it("logs each branch once and remembers it across a remount", async () => {
    const first = mountPlugin();
    await fire(first.listeners, "hub_quest_hard", false);
    expect(first.logs).toEqual([]);
    await fire(first.listeners, "hub_quest_hard");
    await fire(first.listeners, "hub_quest_hard");
    expect(first.logs).toEqual([
      "glass-courier: Sable escorted the marked crate; the consignee signed in silence.",
    ]);
    expect(first.storage.get(STORAGE_KEY)).toEqual(["hub_quest_hard"]);

    const second = mountPlugin(first.storage);
    await fire(second.listeners, "hub_quest_hard");
    expect(second.logs).toEqual([]);
    await fire(second.listeners, "hub_rest");
    expect(second.logs).toEqual([
      "glass-courier: Sable repaired the depot sign-lamp; the yard glowed through the night.",
    ]);
    expect(first.grant).not.toHaveBeenCalled();
    expect(second.grant).not.toHaveBeenCalled();
  });
});
