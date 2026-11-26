import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContextualCues, createTutorial, TUTORIAL_PLUGIN_ID } from "../src/game/tutorial";
import type { ContextualCueDeps, TutorialDeps } from "../src/game/tutorial";
import { ENABLED_KEY } from "../src/ui/panels";

function makeDeps(overrides: Partial<TutorialDeps> = {}) {
  const host = {
    isPluginActive: vi.fn().mockReturnValueOnce(false).mockReturnValue(true),
    loadZip: vi.fn(async () => ({ id: TUTORIAL_PLUGIN_ID })),
    waitUntilReady: vi.fn(async () => {}),
    disable: vi.fn(),
  };
  const refresh = vi.fn();
  const fetchZip = vi.fn(async () => new ArrayBuffer(8));
  return {
    host,
    refresh,
    fetchZip,
    bundledPluginsReady: async () => [],
    ...overrides,
  } as unknown as TutorialDeps & {
    host: typeof host;
    refresh: typeof refresh;
    fetchZip: typeof fetchZip;
  };
}

describe("createTutorial", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loads the bundled zip and enables the tutorial for new games", async () => {
    const deps = makeDeps();
    const tutorial = createTutorial(deps);
    await tutorial.setTutorialForNewGame(true);
    expect(deps.host.loadZip).toHaveBeenCalledTimes(1);
    expect(deps.host.waitUntilReady).toHaveBeenCalledWith(TUTORIAL_PLUGIN_ID);
    expect(JSON.parse(localStorage.getItem(ENABLED_KEY)!)).toContain(TUTORIAL_PLUGIN_ID);
    expect(deps.refresh).toHaveBeenCalled();
  });

  it("skips the load when the tutorial plugin is already active", async () => {
    const deps = makeDeps();
    deps.host.isPluginActive.mockReset();
    deps.host.isPluginActive.mockReturnValue(true);
    const tutorial = createTutorial(deps);
    await tutorial.setTutorialForNewGame(true);
    expect(deps.host.loadZip).not.toHaveBeenCalled();
  });

  it("disables the tutorial and removes it from the enabled set", async () => {
    localStorage.setItem(ENABLED_KEY, JSON.stringify([TUTORIAL_PLUGIN_ID, "other"]));
    const deps = makeDeps();
    const tutorial = createTutorial(deps);
    await tutorial.setTutorialForNewGame(false);
    expect(deps.host.disable).toHaveBeenCalledWith(TUTORIAL_PLUGIN_ID, "tutorial-disabled");
    const ids = JSON.parse(localStorage.getItem(ENABLED_KEY)!);
    expect(ids).not.toContain(TUTORIAL_PLUGIN_ID);
    expect(ids).toContain("other");
  });

  it("rejects a zip whose manifest carries the wrong plugin id", async () => {
    const deps = makeDeps();
    deps.host.loadZip.mockResolvedValue({ id: "impostor" });
    const tutorial = createTutorial(deps);
    await expect(tutorial.setTutorialForNewGame(true)).rejects.toThrow(
      "invalid tutorial plugin package",
    );
  });
});

describe("createContextualCues", () => {
  function makeCueDeps() {
    document.body.innerHTML = `
      <button id="btn-explore"></button>
      <button id="tab-sensors"></button>
      <button id="btn-travel"></button>
      <button id="tab-forge"></button>
      <div id="encounter-choices"><button>Yard Master</button></div>
      <button data-inspect="hull"></button>
    `;
    const listeners = new Map<string, (payload: unknown) => void>();
    const logs: string[] = [];
    const store = new Map<string, string>();
    const deps: ContextualCueDeps = {
      bus: { on: (event, cb) => listeners.set(event, cb) },
      storage: {
        getItem: (key) => store.get(key) ?? null,
        setItem: (key, value) => void store.set(key, value),
        removeItem: (key) => void store.delete(key),
      },
      schedule: (fn) => fn(),
      cueClass: "contextual-cue",
      helpClass: "log-help",
      log: (text) => logs.push(text),
      phases: { idle: "IDLE", encounter: "ENCOUNTER" },
    };
    return { cues: createContextualCues(deps), listeners, logs };
  }

  it("shows one cue at a time and advances on the next phase entry", () => {
    const { cues, listeners, logs } = makeCueDeps();
    cues.enable();

    listeners.get("onEnter")?.({ phase: "IDLE" });
    expect(document.querySelectorAll(".contextual-cue")).toHaveLength(1);
    expect(document.getElementById("btn-explore")?.classList.contains("contextual-cue")).toBe(true);
    expect(logs).toEqual(["EXPLORE: Spend Energy on the Bridge to reveal local actions."]);

    listeners.get("onEnter")?.({ phase: "IDLE" });
    expect(document.querySelectorAll(".contextual-cue")).toHaveLength(1);
    expect(document.getElementById("btn-explore")?.classList.contains("contextual-cue")).toBe(true);
    expect(logs).toHaveLength(1);

    document.getElementById("btn-explore")?.click();
    expect(document.querySelectorAll(".contextual-cue")).toHaveLength(0);

    listeners.get("onEnter")?.({ phase: "IDLE" });
    expect(document.getElementById("tab-sensors")?.classList.contains("contextual-cue")).toBe(true);
    expect(logs).toHaveLength(2);

    cues.disable();
    expect(document.querySelectorAll(".contextual-cue")).toHaveLength(0);
  });
});
