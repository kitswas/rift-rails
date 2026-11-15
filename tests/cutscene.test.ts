import { describe, expect, it } from "vitest";
import { ConduitDeck } from "../src/game/conduit";
import { CutsceneEngine } from "../src/game/cutscene";
import { GAME_DATA } from "../src/game/data";
import { Registry } from "../src/game/registry";
import type { StoryScene } from "../src/game/storyline";
import type { CutsceneId, Phase } from "../src/game/types";
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
    pluginId: "fixture-plugin",
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

function makeEngine(
  voyage: Voyage,
  registry: Registry = new Registry(),
  transitionTo: (phase: Phase) => boolean = (phase) => {
    voyage.setPhase(phase);
    return true;
  },
  firstCutsceneId?: CutsceneId,
): CutsceneEngine {
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
    registry,
    voyage,
    transitionTo,
    log: () => {},
    sound: { playDialogueChime: () => {} },
    refs: {
      get: (key) => document.getElementById(ids[key as keyof typeof ids] ?? ""),
      getActiveElement: () => document.activeElement,
    },
    firstCutsceneId,
  });
}

const WP3 = {
  id: "corvus-tutorial:wp3",
  beats: [{ text: "Waypoint three.", choiceA: "Continue", choiceB: "" }],
};

function makeRegistryWith(id: string, cutscene: typeof WP3): Registry {
  const registry = new Registry();
  registry.registerCutscene(id, cutscene);
  return registry;
}

describe("firstCutscene", () => {
  it("does not fall back to another plugin when the configured scene is missing", () => {
    const registry = makeRegistryWith("other-plugin:scene", {
      ...WP3,
      id: "other-plugin:scene",
    });
    const engine = makeEngine(
      makeVoyage(),
      registry,
      undefined,
      "corvus-tutorial:wp1",
    );

    expect(engine.firstCutscene()).toBeNull();
  });
});

describe("cutsceneForJump", () => {
  it("returns the namespaced wp3 cutscene at jump 3 when unseen", () => {
    const voyage = makeVoyage();
    voyage.state.jumpCount = 3;
    const engine = makeEngine(voyage, makeRegistryWith("corvus-tutorial:wp3", WP3));
    expect(engine.cutsceneForJump(3, [])).toBe("corvus-tutorial:wp3");
  });

  it("returns null once the wp3 cutscene has been seen", () => {
    const voyage = makeVoyage();
    voyage.state.jumpCount = 3;
    const engine = makeEngine(voyage, makeRegistryWith("corvus-tutorial:wp3", WP3));
    expect(engine.cutsceneForJump(3, ["corvus-tutorial:wp3"])).toBeNull();
  });

  it("returns null for a legacy bare wp3 entry in seenCutscenes", () => {
    const voyage = makeVoyage();
    voyage.state.jumpCount = 3;
    const engine = makeEngine(voyage, makeRegistryWith("corvus-tutorial:wp3", WP3));
    expect(engine.cutsceneForJump(3, ["wp3"])).toBeNull();
  });

  it("returns null when the registry has no wp3 cutscene", () => {
    const voyage = makeVoyage();
    voyage.state.jumpCount = 3;
    const engine = makeEngine(voyage);
    expect(engine.cutsceneForJump(3, [])).toBeNull();
  });

  it("returns null when only a prefix-mismatched cutscene is registered", () => {
    const voyage = makeVoyage();
    voyage.state.jumpCount = 3;
    const engine = makeEngine(
      voyage,
      makeRegistryWith("other-plugin:wp3", { ...WP3, id: "other-plugin:wp3" }),
    );
    expect(engine.cutsceneForJump(3, [])).toBeNull();
  });
});

describe("interactive story dialogue", () => {
  it("falls back to IDLE when the interrupted phase cannot resume", () => {
    const voyage = makeVoyage();
    voyage.setPhase("ENCOUNTER");
    const engine = makeEngine(voyage, new Registry(), (phase) => {
      if (phase === "ENCOUNTER" && voyage.getPhase() === "DIALOGUE") return false;
      voyage.setPhase(phase);
      return true;
    });

    engine.playStory(makeScene(), () => {});
    engine.advance(0);

    expect(voyage.getPhase()).toBe("IDLE");
  });

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
    engine.cancelPluginScenes("fixture-plugin");

    expect(engine.activeCutscene).toBeNull();
    expect(document.getElementById("cutscene-overlay")?.hidden).toBe(true);
    expect(selected).toBe(false);
  });
});
