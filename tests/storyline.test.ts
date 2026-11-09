import { describe, expect, it } from "vitest";
import { ConduitDeck } from "../src/game/conduit";
import { GAME_DATA } from "../src/game/data";
import { Registry } from "../src/game/registry";
import { migratePayload } from "../src/game/save";
import { StorylineService, validateStoryline } from "../src/game/storyline";
import type { StoryScene } from "../src/game/storyline";
import { Voyage } from "../src/game/voyage";

const story = {
  id: "lost-lantern",
  title: "The Lost Lantern",
  description: "A signal asks for an answer.",
  start: { event: "afterJump", jumpCount: 2 },
  first: "signal",
  nodes: [
    {
      id: "signal",
      actor: "Rail Signal",
      verb: "calls",
      target: "the locomotive",
      outcome: "the Conductor chooses whether to answer",
      text: "A lantern flickers beyond the fog.",
      choices: [
        { id: "answer", label: "Answer", next: "answer" },
        { id: "pass", label: "Pass", next: "pass" },
      ],
    },
    {
      id: "answer",
      actor: "Conductor",
      verb: "answers",
      target: "the signal",
      outcome: "a stranded traveler receives a route home",
      text: "A voice sends one final coordinate.",
      trigger: { event: "afterAction", actionId: "res_harvest", success: true },
      choices: [{ id: "record", label: "Record it", next: null }],
    },
    {
      id: "pass",
      actor: "Conductor",
      verb: "passes",
      target: "the signal",
      outcome: "the unknown light disappears",
      text: "The lantern dims behind the train.",
      choices: [{ id: "continue", label: "Continue", next: null }],
    },
  ],
};

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

describe("storyline definitions", () => {
  it("accepts a reachable branching story", () => {
    expect(validateStoryline(story)).toMatchObject({ id: "lost-lantern", first: "signal" });
  });

  it("requires safe phases for on-enter triggers", () => {
    expect(
      validateStoryline({ ...story, start: { event: "onEnter", phase: "IDLE" } }),
    ).not.toBeNull();
    expect(
      validateStoryline({ ...story, start: { event: "onEnter", phase: "YARD_ROOT" } }),
    ).toBeNull();
    expect(validateStoryline({ ...story, start: { event: "onEnter" } })).toBeNull();
  });

  it("rejects missing targets, cycles, and unreachable nodes", () => {
    expect(
      validateStoryline({
        ...story,
        nodes: [{ ...story.nodes[0], choices: [{ id: "bad", label: "Bad", next: "missing" }] }],
      }),
    ).toBeNull();
    expect(
      validateStoryline({
        ...story,
        nodes: [{ ...story.nodes[0], choices: [{ id: "loop", label: "Loop", next: "signal" }] }],
      }),
    ).toBeNull();
    expect(
      validateStoryline({ ...story, nodes: [...story.nodes, { ...story.nodes[2], id: "orphan" }] }),
    ).toBeNull();
  });

  it("loads old saves without storyline progress", () => {
    const oldSave = makeVoyage().serialize() as unknown as Record<string, unknown>;
    delete oldSave["storyProgress"];
    expect(migratePayload(oldSave)?.storyProgress).toEqual({});
  });
});

describe("storyline progression", () => {
  it("auto-starts, waits for matching game event, branches, and records the path", () => {
    const voyage = makeVoyage();
    const scenes: StoryScene[] = [];
    const choices: ((index: number) => void)[] = [];
    const service = new StorylineService(voyage, {
      show: (scene, choose) => {
        scenes.push(scene);
        choices.push(choose);
      },
    });
    service.register("sample-plugin", story);

    service.handleEvent("afterJump", { jumpCount: 1 });
    expect(scenes).toHaveLength(0);
    service.handleEvent("afterJump", { jumpCount: 2 });
    expect(scenes.map((scene) => scene.node.id)).toEqual(["signal"]);
    choices[0]?.(0);
    expect(voyage.state.storyProgress["sample-plugin:lost-lantern"]?.waiting).toBe(true);

    service.handleEvent("afterAction", { actionId: "res_harvest", success: false });
    expect(scenes).toHaveLength(1);
    service.handleEvent("afterAction", { actionId: "res_harvest", success: true });
    expect(scenes.map((scene) => scene.node.id)).toEqual(["signal", "answer"]);
    choices[1]?.(0);
    expect(service.journal()[0]).toMatchObject({ status: "complete" });
    expect(service.journal()[0]?.trace.map((entry) => entry.choiceId)).toEqual([
      "answer",
      "record",
    ]);
  });

  it("defers a triggered scene until the game enters a dialogue-safe phase", () => {
    const voyage = makeVoyage();
    voyage.setPhase("YARD_ROOT");
    const scenes: StoryScene[] = [];
    const service = new StorylineService(voyage, {
      show: (scene) => scenes.push(scene),
    });
    service.register("sample-plugin", story);
    service.handleEvent("afterJump", { jumpCount: 2 });
    expect(scenes).toHaveLength(0);

    voyage.setPhase("ENCOUNTER");
    service.handleEvent("onEnter", { phase: "ENCOUNTER" });
    expect(scenes.map((scene) => scene.node.id)).toEqual(["signal"]);
  });

  it("resumes an unfinished scene after save and plugin re-registration", () => {
    const voyage = makeVoyage();
    const first = new StorylineService(voyage, { show: () => {} });
    first.register("sample-plugin", story);
    first.handleEvent("afterJump", { jumpCount: 2 });
    const saved = voyage.serialize();

    const resumedVoyage = makeVoyage();
    resumedVoyage.loadState(saved);
    const resumedScenes: StoryScene[] = [];
    const resumed = new StorylineService(resumedVoyage, {
      show: (scene) => resumedScenes.push(scene),
    });
    resumed.register("sample-plugin", story);
    resumed.start();
    expect(resumedScenes.map((scene) => scene.node.id)).toEqual(["signal"]);
  });

  it("serializes the selected branch and its outcome trace", () => {
    const voyage = makeVoyage();
    const service = new StorylineService(voyage, { show: () => {} });
    service.register("sample-plugin", story);
    service.handleEvent("afterJump", { jumpCount: 2 });
    service.choose("sample-plugin", "lost-lantern", 1);
    service.choose("sample-plugin", "lost-lantern", 0);

    const saved = voyage.serialize();
    expect(saved.storyProgress["sample-plugin:lost-lantern"]).toMatchObject({
      status: "complete",
      trace: [
        { nodeId: "signal", choiceId: "pass" },
        { nodeId: "pass", choiceId: "continue" },
      ],
    });
  });

  it("retains completed progress when a plugin is disabled and re-enabled", () => {
    const voyage = makeVoyage();
    const service = new StorylineService(voyage, { show: () => {} });
    service.register("sample-plugin", story);
    service.handleEvent("afterJump", { jumpCount: 2 });
    service.choose("sample-plugin", "lost-lantern", 1);
    service.choose("sample-plugin", "lost-lantern", 0);
    service.removePlugin("sample-plugin");
    service.register("sample-plugin", story);
    expect(service.journal()[0]).toMatchObject({ status: "complete" });
  });
});
