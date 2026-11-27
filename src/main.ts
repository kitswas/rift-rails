import "./style.css";
import { GAME_DATA } from "./game/data";
import { Registry } from "./game/registry";
import { ConduitDeck } from "./game/conduit";
import { Voyage } from "./game/voyage";
import { PluginHost } from "./game/host";
import type { HostDeps } from "./game/workerProtocol";
import { SaveSystem } from "./game/save";
import { EngineService } from "./game/engine";
import type { EngineDeps } from "./game/engine";
import { PhaseMachine } from "./game/phaseMachine";
import { SoundFXService } from "./game/audio";
import type { AmbientMode } from "./game/types";
import { createNav } from "./ui/nav";
import { createMenu } from "./ui/menu";
import { getTabs, onScrollToPane, onSyncTabs, tabIds } from "./ui/tabs";
import { el, btn } from "./ui/dom";
import {
  createContextualCues,
  createTutorial,
  TUTORIAL_PLUGIN_ID,
  TUTORIAL_CHOICE_KEY,
} from "./game/tutorial";
import { DioramaPipelineService } from "./game/art";
import type { ArtBridgeHandle, ArtDeps } from "./game/art";
import { TransitionFXService } from "./game/fx";
import { CutsceneEngine } from "./game/cutscene";
import { StorylineService } from "./game/storyline";
import type { StoryEvent } from "./game/storyline";
import { RiftMotionService } from "./game/motion";
import { appendLog, renderActionButtons, renderForge, renderVitals } from "./ui/render";
import { loadRegistryPlugins, mountPluginsPanel, readEnabled } from "./ui/panels";
import { loadPluginRegistry } from "./game/pluginRegistry";

const bus = {
  listeners: new Map<string, Set<(payload: unknown) => void>>(),
  on(event: string, cb: (payload: unknown) => void): void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(cb);
    this.listeners.set(event, set);
  },
  emit(event: string, payload: unknown): void {
    for (const cb of this.listeners.get(event) ?? []) cb(payload);
  },
};

let cutscene!: CutsceneEngine;
let storylineService: StorylineService | undefined;
let bundledPluginsReady: Promise<string[]> = Promise.resolve([]);
let refreshPluginsPanel = (): void => {};

function renderStoryJournal(): void {
  const hostEl = el("story-journal");
  if (!hostEl || !storylineService) return;
  hostEl.replaceChildren();
  const entries = storylineService.journal();
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.textContent = "Stories installed by active plugins appear here.";
    hostEl.appendChild(empty);
    return;
  }
  for (const entry of entries) {
    const section = document.createElement("section");
    section.className = "story-journal-entry";
    const title = document.createElement("h4");
    title.textContent = entry.title;
    const description = document.createElement("p");
    description.textContent = entry.description;
    const status = document.createElement("p");
    status.className = `story-journal-status story-${entry.status}`;
    status.textContent =
      entry.status === "complete"
        ? "Complete"
        : entry.status === "active"
          ? "In progress"
          : "Waiting for signal";
    section.append(title, description, status);
    if (entry.step) {
      const step = document.createElement("p");
      step.textContent = `Next: ${entry.step}`;
      section.appendChild(step);
    }
    if (entry.trace.length) {
      const list = document.createElement("ol");
      list.className = "story-journal-trace";
      for (const item of entry.trace) {
        const row = document.createElement("li");
        row.textContent = `${item.actor} ${item.verb} ${item.target}: ${item.outcome} — ${item.choiceLabel}`;
        list.appendChild(row);
      }
      section.appendChild(list);
    }
    hostEl.appendChild(section);
  }
}

const registry = new Registry();
for (const [id, node] of Object.entries(GAME_DATA.nodes)) registry.registerNode(id, node);
for (const [id, act] of Object.entries(GAME_DATA.actions)) registry.registerAction(id, act);
for (const [id, item] of Object.entries(GAME_DATA.yard)) registry.registerYardItem(id, item);
for (const [id, cut] of Object.entries(GAME_DATA.cutscenes)) registry.registerCutscene(id, cut);
for (const [id, th] of Object.entries(GAME_DATA.procedural.themes)) registry.registerTheme(id, th);

const conduit = new ConduitDeck({
  runway: GAME_DATA.runway,
  sectorPoolCounts: GAME_DATA.sectorPoolCounts,
  waypointHubInterval: GAME_DATA.config.WAYPOINT_HUB_INTERVAL,
  adjectives: GAME_DATA.procedural.adjectives,
  nouns: GAME_DATA.procedural.nouns,
  random: () => Math.random(),
  getExtraNodeIds: () => registry.listNodeIds().filter((id) => id.includes(":")),
  getNodeLabel: (id) => registry.getNode(id)?.label ?? GAME_DATA.nodes[id]?.label,
});
conduit.init();

const voyage = new Voyage(registry, GAME_DATA.config, conduit, undefined, {
  random: () => Math.random(),
});

const storylines = {
  register: (pluginId: string, def: unknown): void => {
    if (!storylineService) throw new Error("storyline service unavailable");
    storylineService.register(pluginId, def);
  },
  removePlugin: (pluginId: string): void => {
    storylineService?.removePlugin(pluginId);
    cutscene.cancelPluginScenes(pluginId);
  },
};

const hostDeps: HostDeps = {
  voyage: {
    getSnapshot: () => voyage.getSnapshot(),
    executeAction: (id) => voyage.executeAction(id),
    exploreNode: () => voyage.exploreNode(),
    desperateScavenge: () => voyage.desperateScavenge(),
    state: voyage.state,
    enforceStateBounds: () => voyage.enforceStateBounds(),
  },
  registry: {
    registerAction: (pluginId, def) =>
      registry.registerAction(`${pluginId}:${def.id}`, def as never),
    registerNode: (pluginId, def) => registry.registerNode(`${pluginId}:${def.id}`, def as never),
    registerCutscene: (pluginId, def) => {
      const id = `${pluginId}:${def.id}`;
      registry.registerCutscene(id, { ...def, id } as never);
    },
    removePlugin: (pluginId) => {
      cutscene.cancelPluginScenes(pluginId);
      for (const id of registry.listActionIds())
        if (id.startsWith(`${pluginId}:`)) registry.unregisterAction(id);
      for (const id of registry.listNodeIds())
        if (id.startsWith(`${pluginId}:`)) registry.unregisterNode(id);
      for (const id of registry.listCutsceneIds())
        if (id.startsWith(`${pluginId}:`)) registry.unregisterCutscene(id);
      conduit.removePluginNodes(pluginId);
      if (voyage.state.dimId.startsWith(`${pluginId}:`)) {
        const phase = voyage.getPhase();
        const terminal =
          phase === (GAME_DATA.phases.dead ?? "DEAD") ||
          phase === (GAME_DATA.phases.stranded ?? "STRANDED");
        if (phase === (GAME_DATA.phases.jumping ?? "JUMPING")) fx.cancelJumpEffect();
        voyage.state.dimId = "hub";
        voyage.state.dimName = "Scrapyard Outpost";
        voyage.state.isSurveyed = false;
        voyage.state.targetDimId = null;
        voyage.state.targetDimName = null;
        voyage.state.navChoices = [];
        const idle = GAME_DATA.phases.idle ?? "IDLE";
        if (!terminal && !cutscene.activeCutscene) {
          const yardCategory = GAME_DATA.phases.yard_category ?? "YARD_CATEGORY";
          const yardRoot = GAME_DATA.phases.yard_root ?? "YARD_ROOT";
          if (phase === yardCategory) engine.transitionTo(yardRoot);
          if (voyage.getPhase() === yardRoot)
            engine.transitionTo(GAME_DATA.phases.encounter ?? "ENCOUNTER");
          if (voyage.getPhase() === idle) {
            if (phase === idle) engine.updateUI();
          } else if (!engine.transitionTo(idle)) {
            engine.updateUI();
          }
        } else {
          engine.updateUI();
        }
      }
    },
  },
  storylines,
  log: (msg) => appendLog(msg, GAME_DATA.dom.classes.logSystem ?? "log-system"),
  events: bus,
};
const host = new PluginHost(hostDeps);
const tutorial = createTutorial({
  host,
  bundledPluginsReady: () => bundledPluginsReady,
  refresh: () => refreshPluginsPanel(),
});
const setTutorialForNewGame = tutorial.setTutorialForNewGame;

const save = new SaveSystem({
  storage: localStorage,
  voyage,
  getEnabledPlugins: () => readEnabled(),
  getHostStorage: () => host.serializeAllStorage(),
  restoreHostStorage: (storage) => {
    host.restoreHostStorage(storage);
  },
  setTimeoutFn: (cb, ms) => {
    window.setTimeout(cb, ms);
  },
  waitForIdle: () => host.whenIdle(),
});

const sound = new SoundFXService({
  config: GAME_DATA.audio,
  createContext: () => {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    return AC ? new AC() : null;
  },
  getPhase: () => voyage.getPhase(),
  isTerminalPhase: (phase) =>
    phase === (GAME_DATA.phases.dead ?? "DEAD") ||
    phase === (GAME_DATA.phases.stranded ?? "STRANDED"),
  onPrefsChanged: (prefs) => save.saveAudioPrefs(prefs),
  random: () => Math.random(),
  timers: {
    setInterval: (cb, ms) => window.setInterval(cb, ms),
    clearInterval: (id) => window.clearInterval(id),
    setTimeout: (cb, ms) => window.setTimeout(cb, ms),
    clearTimeout: (id) => window.clearTimeout(id),
  },
});

const artDeps: ArtDeps = {
  createBridge: (): ArtBridgeHandle | null => {
    try {
      let iframe = document.getElementById("art-bridge") as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = "art-bridge";
        iframe.src = "artwork-browser.html?bridge=1";
        iframe.style.display = "none";
        iframe.title = "Artwork bridge";
        document.body.appendChild(iframe);
      }
      const frame = iframe;
      const origin = window.location.origin;
      const ready = new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (!done) {
            done = true;
            resolve();
          }
        };
        frame.addEventListener("load", finish);
        window.setTimeout(finish, 800);
      });
      return {
        ready,
        postMessage: (message) => frame.contentWindow?.postMessage(message, origin),
        subscribeMessage: (handler) =>
          window.addEventListener("message", (event) => {
            if (event.origin !== origin) return;
            if (event.source === frame.contentWindow) handler(event);
          }),
      };
    } catch {
      return null;
    }
  },
  setTimeoutFn: (cb, ms) => window.setTimeout(cb, ms),
  clearTimeoutFn: (id) => window.clearTimeout(id),
  timeoutMs: 8000,
};
const art = new DioramaPipelineService({ ...artDeps, kind: "pixel" });
const vectorArt = new DioramaPipelineService({ ...artDeps, kind: "vector" });

const fx = new TransitionFXService({
  config: GAME_DATA.config,
  themes: {
    getTheme: (id) => registry.getTheme(id),
    getDefaultTheme: () => GAME_DATA.procedural.defaultTheme,
  },
  sound,
  setCssVars: (vars) => {
    for (const [k, v] of Object.entries(vars)) document.documentElement.style.setProperty(k, v);
  },
  vibrate: (pattern) => navigator.vibrate?.(pattern),
  requestFrame: (cb) => window.requestAnimationFrame(cb),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
  reducedMotion: () => reducedMotionQuery.matches,
  now: () => performance.now(),
  random: () => Math.random(),
  setTimeoutFn: (cb, ms) => window.setTimeout(cb, ms),
  getViewportSize: () => ({ width: window.innerWidth, height: window.innerHeight }),
});

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const motion = new RiftMotionService({
  reducedMotion: () => reducedMotionQuery.matches,
  now: () => performance.now(),
  requestFrame: (cb) => window.requestAnimationFrame(cb),
  cancelFrame: (id) => window.cancelAnimationFrame(id),
});
let engine!: EngineService;

cutscene = new CutsceneEngine({
  registry,
  voyage,
  transitionTo: (phase) => engine.transitionTo(phase),
  log: (text, cls) => appendLog(text, cls ?? GAME_DATA.dom.classes.logSystem ?? "log-system"),
  sound,
  refs: {
    get: (key: string) => {
      const id = GAME_DATA.dom.ids[key];
      return id ? document.getElementById(id) : null;
    },
    getActiveElement: () => document.activeElement,
  },
  formatProgress: GAME_DATA.text.formatCutsceneProgress,
  formatChainLine: GAME_DATA.text.formatChainLine,
  tutorialHighlightClass: GAME_DATA.dom.classes.tutorialHighlight,
  logLoreClass: GAME_DATA.dom.classes.logLore,
  dialoguePhase: GAME_DATA.phases.dialogue,
  idlePhase: GAME_DATA.phases.idle,
  firstCutsceneId: "corvus-tutorial:wp1",
});

storylineService = new StorylineService(voyage, {
  show: (scene, choose) => cutscene.playStory(scene, choose),
  changed: renderStoryJournal,
  save: () => void save.saveAsync(),
});
for (const event of ["afterAction", "afterJump", "onEnter"] as StoryEvent[]) {
  bus.on(event, (payload) => {
    const handle = (): void => storylineService?.handleEvent(event, payload);
    if (event === "onEnter") window.setTimeout(handle, 0);
    else handle();
  });
}

const nav = createNav({
  motion,
  conduit,
  finalizeJump: (dimId, dimName) => engine.finalizeJump(dimId, dimName),
  registry,
});
const { setChoices, resetNav } = nav;
reducedMotionQuery.addEventListener?.("change", () => nav.handleReducedMotionChange());
const nodeDeps = {
  getTravelCost: () => voyage.getTravelCost(),
  getNode: (id: string) => registry.getNode(id) ?? GAME_DATA.nodes[id],
};
const syncUI = (): void => {
  const s = voyage.getSnapshot();
  renderVitals(s, nodeDeps);
  const perms = GAME_DATA.permissions[s.phase] ?? { explore: false, travel: false, forge: false };
  renderActionButtons(s, perms, nodeDeps);
  renderForge(s, perms.forge);
};
const menu = createMenu({ voyage, registry });
const { addMenuItem, clearMenu, syncActiveMenu } = menu;
const syncSensors = (): void => {
  const artDisplay = el("art-display");
  const bridgeScene = el("bridge-scene");
  const snap = voyage.getSnapshot();
  const labelEl = el("art-label");
  if (labelEl && snap.isSurveyed) labelEl.textContent = snap.dimName;
  if (!artDisplay || !bridgeScene) return;
  if (bridgeScene.dataset.dimName !== snap.dimName) {
    bridgeScene.innerHTML = "";
    bridgeScene.dataset.dimName = snap.dimName;
    if (artDisplay.dataset.dimName !== snap.dimName) {
      artDisplay.dataset.dimName = snap.dimName;
    }
  }
  const markup = art.render(
    snap.dimName,
    (asyncMarkup) => {
      const cur = voyage.getSnapshot();
      if (asyncMarkup && cur.dimName === snap.dimName) {
        bridgeScene.innerHTML = asyncMarkup;
      }
    },
    { width: window.innerWidth, height: window.innerHeight },
  );
  if (markup) bridgeScene.innerHTML = markup;
  const vectorMarkup = vectorArt.render(snap.dimName, (asyncMarkup) => {
    const cur = voyage.getSnapshot();
    if (asyncMarkup && cur.dimName === snap.dimName && cur.isSurveyed) {
      artDisplay.innerHTML = asyncMarkup;
    }
  });
  if (snap.isSurveyed) {
    if (vectorMarkup) artDisplay.innerHTML = vectorMarkup;
  } else {
    if (!document.getElementById("art-glyph") || !document.getElementById("art-label")) {
      artDisplay.innerHTML = '<div id="art-glyph"></div><span id="art-label">SIGNAL LOCKED</span>';
    } else {
      const lbl = document.getElementById("art-label");
      if (lbl) lbl.textContent = "SIGNAL LOCKED";
    }
    fx.bindArtGlyph(el("art-glyph"));
    fx.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
  }
};
const ART_RESIZE_DEBOUNCE_MS = 150;
let artResizeTimer: number | undefined;
window.addEventListener("resize", () => {
  window.clearTimeout(artResizeTimer);
  artResizeTimer = window.setTimeout(syncSensors, ART_RESIZE_DEBOUNCE_MS);
});
const syncSettings = (): void => {
  try {
    const savedTutorialChoice = sessionStorage.getItem(TUTORIAL_CHOICE_KEY);
    const tutorialToggle = document.getElementById("enable-tutorial") as HTMLInputElement | null;
    if (savedTutorialChoice !== null && tutorialToggle)
      tutorialToggle.checked = savedTutorialChoice !== "false";
  } catch {
    // Keep the checked-by-default option if session storage is unavailable.
  }
  const prefs = save.loadAudioPrefs();
  if (prefs) sound.applyPrefs(prefs);
  const sel = document.getElementById("select-ambient-mode") as HTMLSelectElement | null;
  if (sel && sel.options.length === 0) {
    const opts: [AmbientMode, string][] = [
      ["rails", "Ley-Rail Rhythm (Kinetic)"],
      ["telemetry", "Bridge Telemetry (Lo-Fi)"],
      ["rift-drift", "Rift Drift (Ambient)"],
      ["waypoint-pulse", "Waypoint Pulse (Rhythmic)"],
      ["event-horizon", "Event Horizon (Sparse)"],
      ["none", "Silence"],
    ];
    for (const [val, label] of opts) {
      const o = document.createElement("option");
      o.value = val;
      o.textContent = label;
      sel.appendChild(o);
    }
  }
  if (sel) sel.value = sound.ambientMode;
  const ambSlider = document.getElementById("slider-ambient-vol") as HTMLInputElement | null;
  if (ambSlider) ambSlider.value = String(sound.ambientSliderVal);
  const ambLbl = el("lbl-ambient-vol");
  if (ambLbl) ambLbl.textContent = `${sound.ambientSliderVal}%`;
  const sfxSlider = document.getElementById("slider-sfx-vol") as HTMLInputElement | null;
  if (sfxSlider) sfxSlider.value = String(sound.sfxSliderVal);
  const sfxLbl = el("lbl-sfx-vol");
  if (sfxLbl) sfxLbl.textContent = `${sound.sfxSliderVal}%`;
  const muteBtn = btn("btn-toggle-mute");
  if (muteBtn) {
    muteBtn.textContent = `Mute Audio: ${sound.isMuted ? "ON" : "OFF"}`;
    muteBtn.style.borderColor = sound.isMuted ? "var(--danger)" : "";
    muteBtn.style.color = sound.isMuted ? "var(--danger)" : "";
  }
  const ignite = btn("btn-ignite");
  if (ignite) {
    if (save.hasSave()) {
      const saved = save.load();
      ignite.textContent = GAME_DATA.text.btnContinue(saved?.jumpCount ?? 1);
      const fresh = btn("btn-start-fresh");
      if (fresh) {
        fresh.textContent = GAME_DATA.text.btnNewGame;
        fresh.style.display = "flex";
      }
    } else {
      ignite.textContent = GAME_DATA.text.btnIgnite;
      const fresh = btn("btn-start-fresh");
      if (fresh) fresh.style.display = "none";
    }
  }
  const resetBtn = btn("btn-reset-save");
  if (resetBtn) resetBtn.textContent = GAME_DATA.text.btnNewGame;
  const lblForge = el("lbl-forge");
  if (lblForge) lblForge.textContent = GAME_DATA.text.lblForge;
  const navTitle = el("lbl-nav-title");
  if (navTitle) navTitle.textContent = GAME_DATA.text.lblNavTitle;
  const tabLabels: [string, string][] = [
    ["tab-settings", "Settings"],
    ["tab-sensors", "Sensors"],
    ["tab-bridge", "Bridge"],
    ["tab-forge", "Workshop"],
    ["tab-manual", "Manual"],
  ];
  for (const [id, label] of tabLabels) {
    const t = btn(id);
    if (t && !t.textContent.trim()) t.textContent = label;
  }
};
const disableAllButtons = (): void => {
  document.querySelectorAll("button").forEach((b) => {
    (b as HTMLButtonElement).disabled = true;
  });
};
let navReturnFocus: HTMLElement | null = null;
const showNavScreen = (visible: boolean): void => {
  const s = el("nav-screen");
  if (!s) return;
  if (visible) {
    s.setAttribute("role", "dialog");
    s.setAttribute("aria-modal", "true");
    s.setAttribute("aria-label", "Navigation choices");
    s.style.display = "flex";
    navReturnFocus = document.activeElement as HTMLElement | null;
    // Choices render after this call; focus once they exist.
    requestAnimationFrame(() => s.querySelector<HTMLButtonElement>("button")?.focus());
  } else {
    s.style.display = "none";
    const returnFocus = navReturnFocus;
    returnFocus?.focus?.();
    if (document.activeElement !== returnFocus) el("location-name")?.focus();
    navReturnFocus = null;
  }
};
// Keep Tab within the visible nav dialog; inert while the screen is hidden.
const trapNavTab = (event: KeyboardEvent): void => {
  if (event.key !== "Tab") return;
  const screen = el("nav-screen");
  if (!screen || getComputedStyle(screen).display === "none") return;
  const focusables = Array.from(
    screen.querySelectorAll<HTMLElement>('button:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  if (!first || !last) return;
  const active = document.activeElement;
  if (!screen.contains(active)) {
    event.preventDefault();
    (event.shiftKey ? last : first).focus();
    return;
  }
  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
};
const schedule = (fn: () => void, ms: number): void => {
  window.setTimeout(fn, ms);
};
const deps: EngineDeps = {
  syncUI,
  addMenuItem,
  clearMenu,
  syncActiveMenu,
  syncSensors,
  syncSettings,
  disableAllButtons,
  setChoices,
  resetNav,
  appendLog: (msg, cls) => appendLog(msg, cls),
  logError: (msg) => console.error(msg),
  confirmReset: () => window.confirm("Purge all voyage telemetry and restart from Waypoint 1?"),
  reload: () => window.location.reload(),
  lockUI: () => el("right-panel")?.classList.add(GAME_DATA.dom.classes.lockedUI ?? "locked-ui"),
  showStarted: (started) => {
    const start = el("start-screen");
    if (start) start.style.display = started ? "none" : "flex";
    const game = el("game-container");
    if (game) game.style.display = started ? "flex" : "none";
  },
  scrollStarted: () => engine.scrollToPane(2),
  onExploreSurveyed: () => {
    btn("btn-explore")?.classList.remove(
      GAME_DATA.dom.classes.tutorialHighlight ?? "tutorial-highlight",
    );
  },
  readPaletteVar: (type, variable) => {
    const classes: Record<string, string> = {
      damage: GAME_DATA.dom.classes.logDamage ?? "log-damage",
      lore: GAME_DATA.dom.classes.logLore ?? "log-lore",
      success: "log-success",
      system: GAME_DATA.dom.classes.logSystem ?? "log-system",
      event: GAME_DATA.dom.classes.logEvent ?? "log-event",
      help: GAME_DATA.dom.classes.logHelp ?? "log-help",
    };
    const probe = document.createElement("div");
    probe.className = `${GAME_DATA.dom.classes.logEntry ?? "log-entry"} ${classes[type] ?? ""}`;
    document.body.appendChild(probe);
    const value = getComputedStyle(probe).getPropertyValue(variable).trim();
    probe.remove();
    return value || null;
  },
  scrollEncounterChoices: () => {
    el("encounter-choices")?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  },
  showNavScreen,
  schedule,
  onSyncTabs,
  onScrollToPane,
};

engine = new EngineService({
  registry,
  config: GAME_DATA.config,
  voyage,
  deps,
  save,
  sound,
  fx,
  art,
  cutscene,
  text: GAME_DATA.text,
  glossary: GAME_DATA.glossary,
  transitions: GAME_DATA.transitions,
  phases: GAME_DATA.phases,
  logClasses: {
    logSystem: GAME_DATA.dom.classes.logSystem ?? "log-system",
    logEvent: GAME_DATA.dom.classes.logEvent ?? "log-event",
    logDamage: GAME_DATA.dom.classes.logDamage ?? "log-damage",
    logHelp: GAME_DATA.dom.classes.logHelp ?? "log-help",
    logLore: GAME_DATA.dom.classes.logLore ?? "log-lore",
  },
});

hostDeps.engine = {
  executeActionResult: (id) => engine.executeActionResult(id),
  exploreNode: () => engine.exploreNode(),
  desperateScavenge: () => engine.desperateScavenge(),
  notePluginMutation: () => engine.notePluginMutation(),
};
const phaseMachine = new PhaseMachine({
  transitionTo: (phase) => engine.transitionTo(phase),
  executeAction: (actId) => engine.executeAction(actId),
  log: (text, cls) => engine.log(text, cls ?? engine.logClass("logSystem")),
  updateUI: () => engine.updateUI(),
  lockdownGameOver: (msg) => engine.lockdownGameOver(msg),
  setChoices: deps.setChoices,
  resetNav: deps.resetNav,
  addMenuItem: deps.addMenuItem,
  clearMenu: deps.clearMenu,
  registry,
  voyage,
  text: GAME_DATA.text,
  phases: {
    idle: GAME_DATA.phases.idle ?? "IDLE",
    encounter: GAME_DATA.phases.encounter ?? "ENCOUNTER",
    yardRoot: GAME_DATA.phases.yard_root ?? "YARD_ROOT",
    yardCategory: GAME_DATA.phases.yard_category ?? "YARD_CATEGORY",
    navigating: GAME_DATA.phases.navigating ?? "NAVIGATING",
    jumping: GAME_DATA.phases.jumping ?? "JUMPING",
    dead: GAME_DATA.phases.dead ?? "DEAD",
    stranded: GAME_DATA.phases.stranded ?? "STRANDED",
  },
  resources: {
    module: GAME_DATA.resources.module ?? "module",
    carriage: GAME_DATA.resources.carriage ?? "carriage",
    crew: GAME_DATA.resources.crew ?? "crew",
  },
  classes: {
    btnDesperate: GAME_DATA.dom.classes.btnDesperate ?? "btn-desperate",
    btnTravel: GAME_DATA.dom.classes.btnTravel ?? "btn-travel",
    logSuccess: GAME_DATA.dom.classes.logSuccess ?? "log-success",
  },
  showNavScreen: deps.showNavScreen,
  schedule: deps.schedule,
  fx,
  sound,
  cutscene,
});
engine.attachHooks(phaseMachine.hooks);

{
  let lastPhase = voyage.getPhase();
  voyage.hooks.onTransition = (phase) => {
    if (lastPhase !== phase) {
      bus.emit("onExit", { phase: lastPhase });
      lastPhase = phase;
      bus.emit("onEnter", { phase });
      bus.emit(`onEnter:${phase}`, { phase });
      if (
        phase === (GAME_DATA.phases.dead ?? "DEAD") ||
        phase === (GAME_DATA.phases.stranded ?? "STRANDED")
      ) {
        bus.emit("onDeath", { phase });
      }
    } else {
      bus.emit("onEnter", { phase });
      bus.emit(`onEnter:${phase}`, { phase });
    }
  };
  voyage.hooks.onSound = (kind) => {
    if (kind === "success") sound.playActionSuccess();
    else sound.playActionDamage();
  };
  voyage.hooks.onSave = () => {
    bus.emit("onSave", {});
    bus.emit("afterJump", { jumpCount: voyage.getSnapshot().jumpCount });
    void save.saveAsync();
  };
  const origExecuteAction = engine.executeAction.bind(engine);
  engine.executeAction = (actId) => {
    bus.emit("beforeAction", { actionId: actId });
    const success = origExecuteAction(actId);
    bus.emit("afterAction", { actionId: actId, success });
    return success;
  };
}

const contextualCues = createContextualCues({
  bus,
  storage: sessionStorage,
  schedule: (fn) => {
    if (deps.schedule) deps.schedule(fn, 0);
    else window.setTimeout(fn, 0);
  },
  cueClass: GAME_DATA.dom.classes.contextualCue ?? "contextual-cue",
  helpClass: GAME_DATA.dom.classes.logHelp ?? "log-help",
  log: (text, cls) => appendLog(text, cls),
  phases: {
    idle: GAME_DATA.phases.idle ?? "IDLE",
    encounter: GAME_DATA.phases.encounter ?? "ENCOUNTER",
  },
});

fx.bindCanvas(document.getElementById("fx-canvas") as HTMLCanvasElement | null);
fx.bindArtGlyph(el("art-glyph"));
fx.bindChrome(el("game-container"), el("bridge-scene"));
export const app = {
  registry,
  conduit,
  voyage,
  engine,
  host,
  save,
  sound,
  art,
  fx,
  cutscene,
  motion,
};

function bind(): void {
  btn("btn-explore")?.addEventListener("click", () => engine.exploreNode());
  btn("btn-travel")?.addEventListener("click", () => engine.initiateTravel());
  btn("btn-desperate")?.addEventListener("click", () => engine.desperateScavenge());
  btn("btn-forge-engine")?.addEventListener("click", () => engine.forgeUpgrade("engineTier"));
  btn("btn-forge-weapon")?.addEventListener("click", () => engine.forgeUpgrade("weaponTier"));
  btn("btn-reset-save")?.addEventListener("click", () => {
    contextualCues.reset();
    engine.resetGame(true);
  });
  btn("btn-start-fresh")?.addEventListener("click", () => {
    if (!window.confirm("Purge all voyage telemetry and restart from Waypoint 1?")) return;
    const fresh = btn("btn-start-fresh");
    if (fresh) fresh.disabled = true;
    const tutorialEnabled =
      (document.getElementById("enable-tutorial") as HTMLInputElement | null)?.checked ?? true;
    contextualCues.reset();
    try {
      sessionStorage.setItem(TUTORIAL_CHOICE_KEY, String(tutorialEnabled));
    } catch {
      // Continue this new-game reset; checkbox state may not survive reload.
    }
    void setTutorialForNewGame(tutorialEnabled)
      .catch((err: unknown) => {
        logHook.onLog(`tutorial unavailable: ${err instanceof Error ? err.message : String(err)}`);
      })
      .then(() => engine.resetGame(false))
      .catch((err: unknown) => {
        const error = el("start-error");
        if (error) error.textContent = err instanceof Error ? err.message : String(err);
        if (fresh) fresh.disabled = false;
      });
  });
  btn("cutscene-btn-a")?.addEventListener("click", () => cutscene.advance(0));
  btn("cutscene-btn-b")?.addEventListener("click", () => cutscene.advance(1));
  document.addEventListener("keydown", (e) => cutscene.trapFocus(e));
  document.addEventListener("keydown", trapNavTab);
  document.addEventListener("focusin", (e) => cutscene.trapFocus(e));

  const sel = document.getElementById("select-ambient-mode") as HTMLSelectElement | null;
  sel?.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement;
    const mode = t.value as AmbientMode;
    sound.setAmbientMode(mode);
    engine.log(
      `[ACOUSTICS] Soundscape shifted to: ${t.options[t.selectedIndex]?.text ?? t.value}`,
      GAME_DATA.dom.classes.logSystem ?? "log-system",
    );
  });
  const ambSlider = document.getElementById("slider-ambient-vol") as HTMLInputElement | null;
  ambSlider?.addEventListener("input", (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    const lbl = el("lbl-ambient-vol");
    if (lbl) lbl.textContent = `${val}%`;
    sound.setAmbientVolume(val);
  });
  const sfxSlider = document.getElementById("slider-sfx-vol") as HTMLInputElement | null;
  sfxSlider?.addEventListener("input", (e) => {
    const val = parseInt((e.target as HTMLInputElement).value, 10);
    const lbl = el("lbl-sfx-vol");
    if (lbl) lbl.textContent = `${val}%`;
    sound.setSfxVolume(val);
  });
  const muteBtn = btn("btn-toggle-mute");
  muteBtn?.addEventListener("click", () => {
    const isMuted = sound.toggleMute();
    muteBtn.textContent = `Mute Audio: ${isMuted ? "ON" : "OFF"}`;
    muteBtn.style.borderColor = isMuted ? "var(--danger)" : "";
    muteBtn.style.color = isMuted ? "var(--danger)" : "";
  });

  btn("btn-ignite")?.addEventListener("click", () => {
    // SoundFXService.init(): void - boots Sonic Pi, then syncs prefs into the runtime.
    sound.init();
    const ignite = btn("btn-ignite");
    if (ignite) ignite.disabled = true;
    void (async () => {
      try {
        await bundledPluginsReady;
        const hasSave = save.hasSave();
        let tutorialOn = hasSave
          ? host.isPluginActive(TUTORIAL_PLUGIN_ID)
          : ((document.getElementById("enable-tutorial") as HTMLInputElement | null)?.checked ??
            true);
        if (hasSave) {
          if (tutorialOn) {
            try {
              await host.waitUntilReady(TUTORIAL_PLUGIN_ID);
            } catch (err) {
              logHook.onLog(
                `tutorial unavailable: ${err instanceof Error ? err.message : String(err)}`,
              );
              tutorialOn = false;
            }
          }
        } else {
          try {
            await setTutorialForNewGame(tutorialOn);
          } catch (err) {
            logHook.onLog(
              `tutorial unavailable: ${err instanceof Error ? err.message : String(err)}`,
            );
            tutorialOn = false;
          }
          try {
            sessionStorage.removeItem(TUTORIAL_CHOICE_KEY);
          } catch {
            // Ignore unavailable session storage.
          }
        }
        engine.ignite();
        if (tutorialOn) {
          contextualCues.enable();
          contextualCues.showPhase(voyage.getPhase());
        } else {
          contextualCues.disable();
        }
        window.setTimeout(() => storylineService?.start(), 180);
      } catch (err) {
        const error = el("start-error");
        if (error) error.textContent = err instanceof Error ? err.message : String(err);
      } finally {
        if (ignite) ignite.disabled = false;
      }
    })();
  });

  document.querySelectorAll<HTMLElement>("[data-inspect]").forEach((cell) => {
    cell.addEventListener("click", () => engine.inspect(cell.dataset.inspect ?? ""));
  });

  tabIds.forEach((id, idx) => {
    el(id)?.addEventListener("click", () => engine.scrollToPane(idx));
  });
  el("snap-slider")?.addEventListener("scroll", () => engine.syncTabsWithScroll(), {
    passive: true,
  });

  const dial = el("nav-vector");
  if (dial) nav.bindDial(dial);
}

bind();
{
  const overlay = el("cutscene-overlay") as (HTMLElement & { hidden: boolean }) | null;
  if (overlay) overlay.hidden = true;
  const tabs = getTabs();
  tabs.forEach((t, i) => {
    const active = i === 2;
    t.classList.toggle("active", active);
    if (active) t.setAttribute("aria-current", "true");
    else t.removeAttribute("aria-current");
  });
}
const PLUGIN_BOOT_TIMEOUT_MS = 3000;
const registryUrl: string = import.meta.env.VITE_PLUGIN_REGISTRY || "./plugins/registry.json";
const logHook = {
  onLog: (m: string) => appendLog(m, GAME_DATA.dom.classes.logSystem ?? "log-system"),
};
const emptyRegistry = { version: 1 as const, plugins: [] };
refreshPluginsPanel = mountPluginsPanel(host, logHook, emptyRegistry, registryUrl).refresh;
// Registry load runs in the background: a slow or missing registry must not block the game.
bundledPluginsReady = Promise.race([
  loadPluginRegistry(registryUrl)
    .catch((err: unknown) => {
      logHook.onLog(
        `plugin registry unavailable: ${err instanceof Error ? err.message : String(err)}`,
      );
      return emptyRegistry;
    })
    .then(async (registry) => {
      const panel = mountPluginsPanel(host, logHook, registry, registryUrl);
      refreshPluginsPanel = panel.refresh;
      const loaded = registry.plugins.length
        ? await loadRegistryPlugins(host, logHook, registry, registryUrl)
        : [];
      panel.refresh();
      return loaded;
    }),
  new Promise<string[]>((resolve) => setTimeout(() => resolve([]), PLUGIN_BOOT_TIMEOUT_MS)),
]);
engine.init();
(globalThis as unknown as { Engine: EngineService }).Engine = engine;
if (typeof location !== "undefined" && new URLSearchParams(location.search).has("debug")) {
  (globalThis as unknown as { __rift?: unknown }).__rift = app;
}
