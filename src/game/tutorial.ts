// Tutorial bootstrap: enable/disable the optional corvus-tutorial plugin for new games.
import type { PluginHost } from "./host";
import { GAME_DATA } from "./data";
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

/** Contextual, first-time-only cues on the real controls the tutorial plugin talks about. */
export type ContextualCueKey = "explore" | "scout" | "travel" | "forge" | "yard" | "inspect";

export const CONTEXTUAL_CUE_SEEN_KEY = "rift.tutorial.cues.seen";

export interface ContextualCueDeps {
  bus: { on(event: string, cb: (payload: unknown) => void): void };
  storage: Pick<Storage, "getItem" | "setItem" | "removeItem">;
  schedule: (fn: () => void) => void;
  cueClass: string;
  helpClass: string;
  log: (text: string, cls: string) => void;
  phases: { idle: string; encounter: string };
}

export interface ContextualCues {
  enable(): void;
  disable(): void;
  showPhase(phase: string): void;
  reset(): void;
}

interface CueDefinition {
  key: ContextualCueKey;
  selector: string;
  textMatch?: RegExp;
  help: string;
  phases: readonly string[];
}

function readSeen(storage: ContextualCueDeps["storage"]): Set<string> {
  try {
    const raw = storage.getItem(CONTEXTUAL_CUE_SEEN_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(
      Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function createContextualCues(deps: ContextualCueDeps): ContextualCues {
  const cues: CueDefinition[] = [
    {
      key: "explore",
      selector: `#${GAME_DATA.dom.ids.btnExplore}`,
      help: GAME_DATA.text.cueExplore,
      phases: [deps.phases.idle],
    },
    {
      key: "scout",
      selector: `#${GAME_DATA.dom.ids.tabSensors}`,
      help: GAME_DATA.text.cueScout,
      phases: [deps.phases.idle],
    },
    {
      key: "travel",
      selector: `#${GAME_DATA.dom.ids.btnTravel}`,
      help: GAME_DATA.text.cueTravel,
      phases: [deps.phases.idle],
    },
    {
      key: "forge",
      selector: `#${GAME_DATA.dom.ids.tabForge}`,
      help: GAME_DATA.text.cueForge,
      phases: [deps.phases.idle],
    },
    {
      key: "yard",
      selector: `#${GAME_DATA.dom.ids.encounterChoices} button`,
      textMatch: /yard/i,
      help: GAME_DATA.text.cueYard,
      phases: [deps.phases.encounter],
    },
    {
      key: "inspect",
      selector: '[data-inspect="hull"]',
      help: GAME_DATA.text.cueInspect,
      phases: [deps.phases.idle],
    },
  ];
  const seen = readSeen(deps.storage);
  const logged = new Set<string>();
  let enabled = false;
  let active: { target: HTMLElement; clear: () => void } | null = null;

  const persistSeen = (): void => {
    try {
      deps.storage.setItem(CONTEXTUAL_CUE_SEEN_KEY, JSON.stringify([...seen]));
    } catch {
      // Keep the in-memory set when storage is unavailable.
    }
  };

  const clearActive = (): void => {
    if (!active) return;
    active.target.classList.remove(deps.cueClass);
    active.target.removeEventListener("click", active.clear);
    active = null;
  };

  const showForPhase = (phase: string): void => {
    if (!enabled || active) return;
    for (const def of cues) {
      if (seen.has(def.key) || !def.phases.includes(phase)) continue;
      const target = def.textMatch
        ? Array.from(document.querySelectorAll<HTMLElement>(def.selector)).find((node) =>
            def.textMatch?.test(node.textContent ?? ""),
          )
        : document.querySelector<HTMLElement>(def.selector);
      if (!target || (target as HTMLButtonElement).disabled) continue;
      const clear = (): void => {
        clearActive();
        seen.add(def.key);
        persistSeen();
      };
      active = { target, clear };
      target.classList.add(deps.cueClass);
      target.addEventListener("click", clear, { once: true });
      if (!logged.has(def.key)) {
        logged.add(def.key);
        deps.log(def.help, deps.helpClass);
      }
      return;
    }
  };

  deps.bus.on("onEnter", (payload) => {
    const phase = (payload as { phase?: string } | undefined)?.phase;
    if (!phase) return;
    // Phase hooks render controls after the transition event, so defer one tick.
    deps.schedule(() => {
      clearActive();
      showForPhase(phase);
    });
  });

  return {
    enable() {
      enabled = true;
    },
    disable() {
      enabled = false;
      clearActive();
    },
    showPhase(phase) {
      clearActive();
      showForPhase(phase);
    },
    reset() {
      clearActive();
      seen.clear();
      logged.clear();
      try {
        deps.storage.removeItem(CONTEXTUAL_CUE_SEEN_KEY);
      } catch {
        // Ignore unavailable storage.
      }
    },
  };
}
