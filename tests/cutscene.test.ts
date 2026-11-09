import { describe, expect, it } from "vitest";
import { ConduitDeck } from "../src/game/conduit";
import { CutsceneEngine } from "../src/game/cutscene";
import { GAME_DATA } from "../src/game/data";
import { Registry } from "../src/game/registry";
import type { StoryScene } from "../src/game/storyline";
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

function makeScene(choiceCount = 2): StoryScene {
  return {
    pluginId: "sample-plugin",
    storyId: "lost-lantern",
    title: "The Lost Lantern",
    node: {
      id: "signal",
      actor: "Rail Signal",
      verb: "calls",
      target: "the locomotive",
      outcome: "the Conductor chooses",
      text: "A lantern flickers beyond the fog.",
      choices: [
        { id: "answer", label: "Answer", next: null },
        ...(choiceCount === 2 ? [{ id: "pass", label: "Pass", next: null }] : []),
      ],
    },
  };
}

function makeEngine(voyage: Voyage): CutsceneEngine {
  const ids = {
    gameContainer: "game-container",
    cutsceneOverlay: "cutscene-overlay",
    cutsceneProgress: "cutscene-progress",
    cutsceneBody: "cutscene-body",
    cutsceneSpeaker: "cutscene-speaker",
    cutscenePortrait: "cutscene-portrait",
    cutsceneBtnA: "cutscene-btn-a",
    cutsceneBtnB: "cutscene-btn-b",
    btnExplore: "btn-explore",
    locationName: "location-name",
  };
  document.body.innerHTML = Object.entries(ids)
    .map(([key, id]) => {
      const tag =
        key === "cutsceneBtnA" || key === "cutsceneBtnB"
          ? "button"
          : key === "cutscenePortrait"
            ? "img"
            : "div";
      return `<${tag} id="${id}"></${tag}>`;
    })
    .join("");
  const overlay = document.getElementById("cutscene-overlay");
  if (overlay) overlay.hidden = true;
  return new CutsceneEngine({
    registry: new Registry(),
    voyage,
    transitionTo: (phase) => {
      voyage.setPhase(phase);
      return true;
    },
    log: () => {},
    sound: { playDialogueChime: () => {} },
    refs: {
      get: (key) => document.getElementById(ids[key as keyof typeof ids] ?? ""),
      getActiveElement: () => document.activeElement,
    },
  });
}

describe("interactive story dialogue", () => {
  it("recognizes legacy unnamespaced Corvus cutscene saves", () => {
    const engine = makeEngine(makeVoyage());
    expect(engine.hasSeen("corvus-tutorial:wp1", ["wp1"])).toBe(true);
  });

  it("routes the selected button to the story and does not mark it as a Corvus cutscene", () => {
    const voyage = makeVoyage();
    const engine = makeEngine(voyage);
    let selected = -1;
    engine.playStory(makeScene(), (choiceIndex) => {
      selected = choiceIndex;
    });

    expect(document.getElementById("cutscene-speaker")?.textContent).toBe(
      "Rail Signal // The Lost Lantern",
    );
    expect((document.getElementById("cutscene-btn-b") as HTMLButtonElement).hidden).toBe(false);
    expect((document.getElementById("cutscene-portrait") as HTMLImageElement).hidden).toBe(true);
    document.getElementById("cutscene-btn-a")?.focus();
    engine.trapFocus(new KeyboardEvent("keydown", { key: "Tab" }));
    expect(document.activeElement?.id).toBe("cutscene-btn-b");
    engine.trapFocus(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true }));
    expect(document.activeElement?.id).toBe("cutscene-btn-a");
    engine.advance(1);

    expect(selected).toBe(1);
    expect(voyage.state.seenCutscenes).toEqual([]);
    expect(document.getElementById("cutscene-overlay")?.hidden).toBe(true);
  });

  it("hides unused second choice", () => {
    const engine = makeEngine(makeVoyage());
    engine.playStory(makeScene(1), () => {});
    expect((document.getElementById("cutscene-btn-b") as HTMLButtonElement).hidden).toBe(true);
  });

  it("dismisses active plugin dialogue without applying a stale choice", () => {
    const engine = makeEngine(makeVoyage());
    let selected = false;
    engine.playStory(makeScene(), () => {
      selected = true;
    });
    engine.cancelPluginScenes("sample-plugin");

    expect(engine.activeCutscene).toBeNull();
    expect(document.getElementById("cutscene-overlay")?.hidden).toBe(true);
    expect(selected).toBe(false);
  });
});
