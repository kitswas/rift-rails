// Tutorial bootstrap: enable/disable the optional corvus-tutorial plugin for new games.
import type { PluginHost } from "./host";
import { readEnabled, writeEnabled } from "../ui/panels";

export const TUTORIAL_PLUGIN_ID = "corvus-tutorial";
export const TUTORIAL_CHOICE_KEY = "rift.tutorial.next-game";

export interface TutorialDeps {
  host: Pick<PluginHost, "isPluginActive" | "loadZip" | "waitUntilReady" | "disable">;
  /** Resolves once bundled plugin zips have been loaded (or skipped). */
  bundledPluginsReady: () => Promise<string[]>;
  /** Re-render the plugins panel after membership changes. */
  refresh: () => void;
  /** Defaults to fetching the bundled tutorial zip; injectable for tests. */
  fetchZip?: () => Promise<ArrayBuffer>;
}

export interface TutorialModule {
  setTutorialForNewGame(enabled: boolean): Promise<void>;
}

export function createTutorial(deps: TutorialDeps): TutorialModule {
  const { host, bundledPluginsReady, refresh } = deps;
  const fetchZip =
    deps.fetchZip ??
    (async () => {
      const response = await fetch("./plugins/corvus-tutorial.zip");
      if (!response.ok) throw new Error(`tutorial plugin unavailable: HTTP ${response.status}`);
      return response.arrayBuffer();
    });

  const setTutorialForNewGame = async (enabled: boolean): Promise<void> => {
    await bundledPluginsReady();
    const enabledPlugins = new Set(readEnabled());
    if (enabled) {
      if (!host.isPluginActive(TUTORIAL_PLUGIN_ID)) {
        const manifest = await host.loadZip(await fetchZip());
        if (manifest.id !== TUTORIAL_PLUGIN_ID) throw new Error("invalid tutorial plugin package");
      }
      await host.waitUntilReady(TUTORIAL_PLUGIN_ID);
      if (!host.isPluginActive(TUTORIAL_PLUGIN_ID))
        throw new Error("tutorial plugin failed to start");
      enabledPlugins.add(TUTORIAL_PLUGIN_ID);
    } else {
      host.disable(TUTORIAL_PLUGIN_ID, "tutorial-disabled");
      enabledPlugins.delete(TUTORIAL_PLUGIN_ID);
    }
    writeEnabled([...enabledPlugins]);
    refresh();
  };

  return { setTutorialForNewGame };
}
