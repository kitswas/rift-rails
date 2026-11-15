import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTutorial, TUTORIAL_PLUGIN_ID } from "../src/game/tutorial";
import type { TutorialDeps } from "../src/game/tutorial";
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
