import "./style.css";
import { GAME_DATA } from "./game/data";
import { Registry } from "./game/registry";
import { ConduitDeck } from "./game/conduit";
import { Voyage } from "./game/voyage";
import { PluginHost } from "./game/host";
import { SaveSystem } from "./game/save";
import { EngineService } from "./game/engine";
import type { EngineDeps } from "./game/engine";
import { PhaseMachine } from "./game/phaseMachine";
import { SoundFXService } from "./game/audio";
import type { AmbientMode, MotionEntry, Trajectory } from "./game/types";
import { DioramaPipelineService } from "./game/art";
import type { ArtBridgeHandle } from "./game/art";
import { TransitionFXService } from "./game/fx";
import { CutsceneEngine } from "./game/cutscene";
import { StorylineService } from "./game/storyline";
import type { StoryEvent } from "./game/storyline";
import { RiftMotionService } from "./game/motion";
import { appendLog, renderActionButtons, renderForge, renderVitals } from "./ui/render";
import {
  loadBundledPlugins,
  mountPluginsPanel,
  readEnabled,
  rehydratePlugins,
  writeEnabled,
} from "./ui/panels";

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

function el(id: string): HTMLElement | null {
  return document.getElementById(id);
}
function btn(id: string): HTMLButtonElement | null {
  return document.getElementById(id) as HTMLButtonElement | null;
}

let cutscene!: CutsceneEngine;
let storylineService: StorylineService | undefined;
const TUTORIAL_PLUGIN_ID = "corvus-tutorial";
const TUTORIAL_CHOICE_KEY = "rift.tutorial.next-game";
let bundledPluginsReady: Promise<string[]> = Promise.resolve([]);
let refreshPluginsPanel = (): void => {};

async function setTutorialForNewGame(enabled: boolean): Promise<void> {
  await bundledPluginsReady;
  const enabledPlugins = new Set(readEnabled());
  if (enabled) {
    if (!host.isPluginActive(TUTORIAL_PLUGIN_ID)) {
      const response = await fetch("./plugins/corvus-tutorial.zip");
      if (!response.ok) throw new Error(`tutorial plugin unavailable: HTTP ${response.status}`);
      const manifest = await host.loadZip(await response.arrayBuffer());
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
  refreshPluginsPanel();
}

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

const host = new PluginHost({
  voyage: {
    getSnapshot: () => voyage.getSnapshot() as never,
    executeAction: (id) => voyage.executeAction(id) as never,
    exploreNode: () => voyage.exploreNode(),
    desperateScavenge: () => voyage.desperateScavenge(),
    state: voyage.state as never,
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
      for (const id of registry.listActionIds())
        if (id.startsWith(`${pluginId}:`)) registry.unregisterAction(id);
      for (const id of registry.listNodeIds())
        if (id.startsWith(`${pluginId}:`)) registry.unregisterNode(id);
      for (const id of registry.listCutsceneIds())
        if (id.startsWith(`${pluginId}:`)) registry.unregisterCutscene(id);
    },
  },
  storylines,
  log: (msg) => appendLog(msg, GAME_DATA.dom.classes.logSystem ?? "log-system"),
  events: bus,
});

const save = new SaveSystem({
  storage: localStorage,
  voyage,
  getEnabledPlugins: () => readEnabled(),
  getHostStorage: () => host.serializeAllStorage(),
  restoreHostStorage: (storage) => {
    if (!storage || typeof storage !== "object") return;
    const hostAny = host as unknown as {
      restoreHostStorage?: (s: Record<string, Record<string, unknown>>) => void;
      deserialize?: (s: Record<string, Record<string, unknown>>) => void;
      storage?: Map<string, Map<string, unknown>>;
    };
    if (typeof hostAny.restoreHostStorage === "function") {
      hostAny.restoreHostStorage(storage);
      return;
    }
    if (typeof hostAny.deserialize === "function") {
      hostAny.deserialize(storage);
      return;
    }
    const internal = hostAny.storage;
    if (!internal) return;
    for (const [id, bag] of Object.entries(storage)) {
      if (!bag || typeof bag !== "object" || Array.isArray(bag)) continue;
      let map = internal.get(id);
      if (!map) {
        map = new Map();
        internal.set(id, map);
      }
      for (const [k, v] of Object.entries(bag)) {
        if (k.length === 0 || k.length > 128) continue;
        map.set(k, v === undefined ? undefined : (JSON.parse(JSON.stringify(v)) as unknown));
      }
    }
  },
  setTimeoutFn: (cb, ms) => {
    window.setTimeout(cb, ms);
  },
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

const art = new DioramaPipelineService({
  createBridge: (): ArtBridgeHandle | null => {
    try {
      let iframe = document.getElementById("art-bridge") as HTMLIFrameElement | null;
      if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = "art-bridge";
        iframe.src = "artwork-browser.html?bridge=1";
        iframe.style.display = "none";
        document.body.appendChild(iframe);
      }
      const frame = iframe;
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
        postMessage: (message) => frame.contentWindow?.postMessage(message, "*"),
        subscribeMessage: (handler) =>
          window.addEventListener("message", (event) => {
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
});

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

let navChoices: Trajectory[] = [];
let armedSlot = -1;
let lockSlot = -1;
let vectorDragging = false;
let vectorDragMoved = false;
let vectorDownX = 0;
let vectorDownY = 0;
let suppressVectorClick = false;

function needleAngle(slot: number, count: number): number {
  if (count <= 1) return 90;
  return slot === 0 ? 305 : 55;
}

let needleEntry: MotionEntry | null = null;
function getNeedleEntry(): MotionEntry {
  if (!needleEntry) {
    needleEntry = {
      value: 0,
      target: 0,
      velocity: 0,
      stiffness: 210,
      damping: 20,
      update: (value) => {
        el("rift-vector-needle")?.setAttribute("transform", `rotate(${value.toFixed(2)} 80 80)`);
      },
    };
    needleEntry.update?.(0);
  }
  return needleEntry;
}
function setNeedle(angle: number): void {
  const entry = getNeedleEntry();
  // Unwrap to the shortest rotation so the needle never sweeps
  // through the empty lower half of the dial.
  const delta = ((angle - entry.value + 540) % 360) - 180;
  motion.set(entry, entry.value + delta);
}

function slotGeometry(index: number, count: number): { left: number; top: number; width: number } {
  if (count === 1) return { left: 29, top: 46, width: 42 };
  return index === 0 ? { left: 4, top: 46, width: 42 } : { left: 54, top: 46, width: 42 };
}
void slotGeometry;

function buildRailSvg(count: number): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "nav-board-svg");
  svg.setAttribute("viewBox", "0 0 1000 360");
  svg.setAttribute("preserveAspectRatio", "none");
  svg.setAttribute("aria-hidden", "true");
  svg.innerHTML = `
            <g class="board-frame">
              <rect x="18" y="18" width="964" height="324"/>
              <path d="M18 18 H982"/>
              <path d="M18 278 H982"/>
            </g>
            <g class="board-rail">
              <path class="board-rail-back" d="M40 278H960"/>
              <path class="board-rail-base" d="M80 278H920"/>
              <g class="board-sleepers">${Array.from(
                { length: 22 },
                (_, i) => `<path d="M${90 + i * 38} 271V285"/>`,
              ).join("")}</g>
              <path class="board-rail-notch" d="M220 278H300"/>
              <path class="board-rail-notch" d="M500 278H700"/>
              <path class="board-rail-notch" d="M860 278H880"/>
            </g>
            <g class="board-coupler" data-slot="0">
              ${
                count === 1
                  ? `<path class="board-leader board-leader-outer" d="M500 142 C494 190, 506 230, 500 266"/>
                     <path class="board-leader board-leader-inner" d="M500 142 C494 190, 506 230, 500 266"/>
                     <rect class="board-port" x="494" y="136" width="12" height="12"/>
                     <rect class="board-port-dot" x="497" y="139" width="6" height="6"/>
                     <rect class="board-port" x="494" y="272" width="12" height="12"/>
                     <rect class="board-port-dot" x="497" y="275" width="6" height="6"/>`
                  : `<path class="board-leader board-leader-outer" d="M250 142 C250 210, 380 212, 450 266"/>
                     <path class="board-leader board-leader-inner" d="M250 142 C250 210, 380 212, 450 266"/>
                     <rect class="board-port" x="244" y="136" width="12" height="12"/>
                     <rect class="board-port-dot" x="247" y="139" width="6" height="6"/>
                     <rect class="board-port" x="448" y="272" width="12" height="12"/>
                     <rect class="board-port-dot" x="451" y="275" width="6" height="6"/>`
              }
            </g>
            ${
              count === 1
                ? ""
                : `<g class="board-coupler" data-slot="1">
                     <path class="board-leader board-leader-outer" d="M750 142 C750 210, 620 212, 550 266"/>
                     <path class="board-leader board-leader-inner" d="M750 142 C750 210, 620 212, 550 266"/>
                     <rect class="board-port" x="744" y="136" width="12" height="12"/>
                     <rect class="board-port-dot" x="747" y="139" width="6" height="6"/>
                     <rect class="board-port" x="540" y="272" width="12" height="12"/>
                     <rect class="board-port-dot" x="543" y="275" width="6" height="6"/>
                   </g>`
            }
            <g class="board-hub">
              <circle cx="500" cy="278" r="46"/>
              <circle cx="500" cy="278" r="36"/>
              <circle cx="500" cy="278" r="14"/>
              <path d="M442 278H452"/>
              <path d="M548 278H558"/>
            </g>
          `;
  return svg;
}

function lift(index: number): void {
  const hostEl = el("nav-choices");
  if (hostEl) {
    for (const node of Array.from(hostEl.children)) {
      if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) continue;
      node.dataset.lift = Number(node.dataset.slot) === index ? "true" : "false";
    }
  }
  markCoupler(index);
}

function markCoupler(index: number): void {
  el("nav-choices")
    ?.querySelectorAll(".board-coupler")
    .forEach((node) => {
      node.setAttribute(
        "data-active",
        Number(node.getAttribute("data-slot")) === index ? "true" : "false",
      );
    });
}

function lockNavSlot(index: number): void {
  const hostEl = el("nav-choices");
  if (hostEl) {
    for (const node of Array.from(hostEl.children)) {
      if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) continue;
      const selected = Number(node.dataset.slot) === index;
      node.dataset.lock = selected ? "true" : "false";
      node.dataset.lift = selected ? "true" : "false";
      node.dataset.arm = selected ? "true" : "false";
      const axis = node.querySelector(".carriage-axis");
      if (axis) axis.textContent = selected ? "VECTOR LOCKED" : "TAP TO ARM";
    }
  }
}
function updateNavButtons(): void {
  const hostEl = el("nav-choices");
  if (hostEl) {
    for (const node of Array.from(hostEl.children)) {
      if (!(node instanceof HTMLElement) || !node.classList.contains("nav-carriage")) continue;
      const slot = Number(node.dataset.slot);
      const selected = slot === armedSlot;
      node.dataset.arm = selected ? "true" : "false";
      node.setAttribute("aria-pressed", selected ? "true" : "false");
      const axis = node.querySelector(".carriage-axis");
      if (axis) axis.textContent = selected ? "TAP AGAIN TO CONFIRM" : "TAP TO ARM";
    }
  }
  const dial = el("nav-vector");
  if (dial) {
    dial.dataset.armed = armedSlot >= 0 ? "true" : "false";
    dial.dataset.solo = navChoices.length <= 1 ? "true" : "false";
  }
  const s0 = el("vector-slot-0");
  if (s0) s0.dataset.selected = armedSlot === 0 ? "true" : "false";
  const s1 = el("vector-slot-1");
  if (s1) s1.dataset.selected = armedSlot === 1 ? "true" : "false";
  setNeedle(armedSlot >= 0 ? needleAngle(armedSlot, navChoices.length) : 0);
  const status = el("nav-vector-status");
  if (status) {
    if (lockSlot >= 0) status.textContent = "Vector breaching";
    else if (armedSlot >= 0) status.textContent = `Vector ${armedSlot + 1} - tap again to confirm`;
    else status.textContent = "Vector idle";
  }
}
function armNavSlot(index: number): void {
  armedSlot = index;
  lift(index);
  updateNavButtons();
}
function confirmNavSlot(index: number): boolean {
  if (armedSlot !== index || index < 0 || index >= navChoices.length) return false;
  const choice = navChoices[index];
  if (!choice) return false;
  lockSlot = index;
  lockNavSlot(index);
  setNeedle(needleAngle(index, navChoices.length));
  const status = el("nav-vector-status");
  if (status) status.textContent = "Vector breaching";
  const dial = el("nav-vector");
  if (dial) {
    dial.dataset.armed = "true";
    dial.dataset.solo = navChoices.length <= 1 ? "true" : "false";
  }
  const committed = conduit.commitTrajectory(choice);
  engine.finalizeJump(committed.dimId, committed.dimName);
  return true;
}
function handleNavSlot(index: number): void {
  if (armedSlot === index) confirmNavSlot(index);
  else armNavSlot(index);
}
function vectorAngle(e: { clientX: number; clientY: number }): number {
  const dial = el("nav-vector");
  const gauge = dial?.querySelector("svg") ?? el("rift-vector-scale");
  const rect = gauge?.getBoundingClientRect() ?? { left: 0, top: 0, width: 0, height: 0 };
  const dx = e.clientX - (rect.left + rect.width / 2);
  const dy = e.clientY - (rect.top + rect.height / 2);
  const deg = (Math.atan2(dx, -dy) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}
function nearestSlot(angle: number, count: number): number {
  if (count <= 1) return 0;
  let best = 0;
  let bestD = Infinity;
  for (let slot = 0; slot < count; slot++) {
    const d = Math.abs(((angle - needleAngle(slot, count) + 540) % 360) - 180);
    if (d < bestD) {
      bestD = d;
      best = slot;
    }
  }
  return best;
}

const setChoices = (choices: Trajectory[]): void => {
  navChoices = [...choices];
  armedSlot = -1;
  lockSlot = -1;
  const hostEl = el("nav-choices");
  if (hostEl) {
    hostEl.innerHTML = "";
    const count = choices.length;
    if (count) hostEl.appendChild(buildRailSvg(count));
    choices.forEach((choice, index) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "nav-carriage";
      b.dataset.slot = String(index);
      b.setAttribute("aria-pressed", "false");
      if (count === 1) b.dataset.single = "true";
      const head = document.createElement("span");
      head.className = "carriage-head";
      const badge = document.createElement("span");
      badge.className = "carriage-badge";
      badge.innerHTML =
        index === 0
          ? '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M0 0h8v3H0zM0 3h1v5H0zM7 3h1v5H7zM1 7h6v1H1z"/></svg>'
          : '<svg viewBox="0 0 8 8" aria-hidden="true"><path d="M2 0h4v1H2zM1 1h1v1H1zM6 1h1v1H6zM0 2h1v4H0zM7 2h1v4H7zM1 6h1v1H1zM6 6h1v1H6zM2 7h4v1H2zM3 3h2v2H3z"/></svg>';
      const tag = document.createElement("span");
      tag.className = "carriage-tag";
      tag.textContent = `VECTOR ${String(index + 1).padStart(2, "0")}`;
      head.append(badge, tag);
      const shell = document.createElement("span");
      shell.className = "carriage-shell";
      const name = document.createElement("span");
      name.className = "carriage-name";
      name.textContent = GAME_DATA.text.formatDimName(choice.name);
      const type = document.createElement("span");
      type.className = "carriage-type";
      type.textContent = GAME_DATA.text.formatDimType(
        registry.getNode(choice.id)?.label ?? choice.id,
      );
      const axis = document.createElement("span");
      axis.className = "carriage-axis";
      axis.textContent = "TAP TO ARM";
      shell.append(name, type, axis);
      b.append(head, shell);
      b.addEventListener("click", () => handleNavSlot(index));
      b.addEventListener("pointerleave", () => {
        if (lockSlot < 0) lift(-1);
      });
      b.addEventListener("blur", () => {
        if (lockSlot < 0) lift(-1);
      });
      hostEl.appendChild(b);
    });
  }
  const screen = el("nav-screen");
  if (screen) screen.style.display = "flex";
  updateNavButtons();
};
const resetNav = (): void => {
  navChoices = [];
  armedSlot = -1;
  lockSlot = -1;
  const hostEl = el("nav-choices");
  if (hostEl) hostEl.innerHTML = "";
  const dial = el("nav-vector");
  if (dial) {
    dial.removeAttribute("data-armed");
    dial.removeAttribute("data-solo");
  }
  const s0 = el("vector-slot-0");
  if (s0) s0.dataset.selected = "false";
  const s1 = el("vector-slot-1");
  if (s1) s1.dataset.selected = "false";
  setNeedle(0);
  const status = el("nav-vector-status");
  if (status) status.textContent = "Vector idle";
};

reducedMotionQuery.addEventListener?.("change", () => {
  armedSlot = -1;
  lockSlot = -1;
  el("nav-vector")?.removeAttribute("data-armed");
  el("nav-vector")?.removeAttribute("data-solo");
  const slot0 = el("vector-slot-0");
  if (slot0) slot0.dataset.selected = "false";
  const slot1 = el("vector-slot-1");
  if (slot1) slot1.dataset.selected = "false";
  setNeedle(0);
  const status = el("nav-vector-status");
  if (status) status.textContent = "Vector idle";
});

let menuSeq = 0;
const syncUI = (): void => {
  const s = voyage.getSnapshot();
  renderVitals(s);
  const perms = GAME_DATA.permissions[s.phase] ?? { explore: false, travel: false, forge: false };
  renderActionButtons(s, perms);
  renderForge(s, perms.forge);
};
const addMenuItem = (
  label: string,
  onClick: () => void,
  uiClass?: string,
  actId?: string,
  yardId?: string,
): string => {
  const hostEl = el("encounter-choices");
  const id = actId ?? yardId ?? `menu-${menuSeq++}`;
  if (!hostEl) return id;
  const b = document.createElement("button");
  b.type = "button";
  b.textContent = label;
  if (uiClass) b.className = uiClass;
  if (actId) b.dataset.actId = actId;
  if (yardId) b.dataset.yardId = yardId;
  b.addEventListener("click", onClick);
  hostEl.appendChild(b);
  return id;
};
const clearMenu = (): void => {
  const h = el("encounter-choices");
  if (h) h.innerHTML = "";
};
const syncActiveMenu = (): void => {
  const hostEl = el("encounter-choices");
  if (!hostEl) return;
  const snap = voyage.getSnapshot();
  const encounter = GAME_DATA.phases.encounter ?? "ENCOUNTER";
  const yardCategory = GAME_DATA.phases.yard_category ?? "YARD_CATEGORY";
  if (snap.phase === encounter) {
    for (const node of Array.from(hostEl.children)) {
      const b = node as HTMLButtonElement;
      const actId = b.dataset.actId;
      if (!actId) continue;
      const act = registry.getAction(actId);
      if (!act) continue;
      const reqStrs: string[] = [];
      for (const [rKey, rVal] of Object.entries(act.requires ?? {})) {
        reqStrs.push(
          typeof rVal === "number"
            ? `Req: ${rVal} ${GAME_DATA.resources[rKey] ?? rKey}`
            : `Req: ${String(rVal)}`,
        );
      }
      const costStrs = act.consumes.map((rule) =>
        GAME_DATA.text.formatResVal(
          voyage.getActualCost(rule),
          GAME_DATA.resources[rule.res] ?? rule.res,
        ),
      );
      if (act.probability) {
        costStrs.push(
          GAME_DATA.text.formatChance(Math.floor(act.probability(snap, GAME_DATA.config) * 100)),
        );
      }
      const prodStrs = (act.produces ?? []).map((rule) =>
        GAME_DATA.text.formatResVal(
          rule.amount(snap, GAME_DATA.config),
          GAME_DATA.resources[rule.res] ?? rule.res,
        ),
      );
      b.textContent = GAME_DATA.text.formatActionBtn(act.label, costStrs, prodStrs, reqStrs);
      b.disabled = !voyage.canAffordAction(act);
    }
  } else if (snap.phase === yardCategory) {
    for (const node of Array.from(hostEl.children)) {
      const b = node as HTMLButtonElement;
      const yardId = b.dataset.yardId;
      if (!yardId) continue;
      const item = registry.getYardItem(yardId);
      if (!item) continue;
      let label = GAME_DATA.text.yardItemLabelMenu(item.name, item.desc, item.cost);
      const currentEq =
        (snap as unknown as Record<string, string>)[item.type] ?? GAME_DATA.text.noneState;
      if (currentEq === item.name) {
        label += `\n${GAME_DATA.text.yardOwned}`;
        b.disabled = true;
      } else {
        if (currentEq !== GAME_DATA.text.noneState)
          label += `\n${GAME_DATA.text.yardReplaceWarning(currentEq)}`;
        b.disabled = snap.flux < item.cost;
      }
      b.textContent = label;
    }
  }
};
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
  }
  const markup = art.render(snap.dimName, (asyncMarkup) => {
    const cur = voyage.getSnapshot();
    if (asyncMarkup && cur.dimName === snap.dimName) {
      bridgeScene.innerHTML = asyncMarkup;
      if (cur.isSurveyed) {
        const curDisplay = el("art-display");
        if (curDisplay) curDisplay.innerHTML = asyncMarkup;
      }
    }
  });
  if (markup) bridgeScene.innerHTML = markup;
  if (snap.isSurveyed) {
    if (markup) artDisplay.innerHTML = markup;
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
      ["rails", "Rails (Classic)"],
      ["telemetry", "Bridge Telemetry (Lo-Fi)"],
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
      ignite.textContent = `Resume Journey (Waypoint ${saved ? saved.jumpCount : 1})`;
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
const showNavScreen = (visible: boolean): void => {
  const s = el("nav-screen");
  if (s) s.style.display = visible ? "flex" : "none";
};
const schedule = (fn: () => void, ms: number): void => {
  window.setTimeout(fn, ms);
};
const paneIds = ["pane-settings", "pane-sensors", "pane-bridge", "pane-forge", "pane-manual"];
const tabIds = ["tab-settings", "tab-sensors", "tab-bridge", "tab-forge", "tab-manual"];
function getPanes(): HTMLElement[] {
  return paneIds
    .map((id) => document.getElementById(id))
    .filter((e): e is HTMLElement => e !== null);
}
function getTabs(): HTMLElement[] {
  return tabIds
    .map((id) => document.getElementById(id))
    .filter((e): e is HTMLElement => e !== null);
}
const onScrollToPane = (index: number): void => {
  const container = el("snap-slider");
  const panes = getPanes();
  const target = panes[index];
  if (!container || !target) return;
  if (window.innerWidth >= 900) {
    const targetLeft = target.offsetLeft - container.offsetLeft;
    const targetCenter = targetLeft + target.offsetWidth / 2;
    const scrollPos = targetCenter - container.clientWidth / 2;
    container.scrollTo({ left: scrollPos, behavior: "smooth" });
  } else {
    target.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
  }
};
const onSyncTabs = (): void => {
  const container = el("snap-slider");
  const panes = getPanes();
  const tabs = getTabs();
  if (!container || panes.length === 0) return;
  const containerCenter = container.scrollLeft + container.clientWidth / 2;
  let closestIdx = 0;
  let minDiff = Infinity;
  panes.forEach((pane, idx) => {
    const paneCenter = pane.offsetLeft - container.offsetLeft + pane.offsetWidth / 2;
    const diff = Math.abs(containerCenter - paneCenter);
    if (diff < minDiff) {
      minDiff = diff;
      closestIdx = idx;
    }
  });
  tabs.forEach((tab, i) => tab.classList.toggle("active", i === closestIdx));
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
    bus.emit("onSave", { storage: host.serializeAllStorage() });
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
  btn("btn-reset-save")?.addEventListener("click", () => engine.resetGame(true));
  btn("btn-start-fresh")?.addEventListener("click", () => {
    if (!window.confirm("Purge all voyage telemetry and restart from Waypoint 1?")) return;
    const fresh = btn("btn-start-fresh");
    if (fresh) fresh.disabled = true;
    const tutorialEnabled =
      (document.getElementById("enable-tutorial") as HTMLInputElement | null)?.checked ?? true;
    try {
      sessionStorage.setItem(TUTORIAL_CHOICE_KEY, String(tutorialEnabled));
    } catch {
      // Continue this new-game reset; checkbox state may not survive reload.
    }
    void setTutorialForNewGame(tutorialEnabled)
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
  document.addEventListener("focusin", (e) => cutscene.trapFocus(e));

  const sel = document.getElementById("select-ambient-mode") as HTMLSelectElement | null;
  sel?.addEventListener("change", (e) => {
    const t = e.target as HTMLSelectElement;
    sound.setAmbientMode(t.value as AmbientMode);
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
    // SoundFXService.init(): void - creates context, calls startActiveSoundscape().
    sound.init();
    const ignite = btn("btn-ignite");
    if (ignite) ignite.disabled = true;
    void (async () => {
      try {
        await bundledPluginsReady;
        if (save.hasSave()) {
          if (host.isPluginActive(TUTORIAL_PLUGIN_ID))
            await host.waitUntilReady(TUTORIAL_PLUGIN_ID);
        } else {
          await setTutorialForNewGame(
            (document.getElementById("enable-tutorial") as HTMLInputElement | null)?.checked ??
              true,
          );
          try {
            sessionStorage.removeItem(TUTORIAL_CHOICE_KEY);
          } catch {
            // Ignore unavailable session storage.
          }
        }
        engine.ignite();
        window.setTimeout(() => storylineService?.start(), 180);
      } catch (err) {
        const error = el("start-error");
        if (error) error.textContent = err instanceof Error ? err.message : String(err);
      } finally {
        if (ignite) ignite.disabled = false;
      }
    })();
  });

  // Inspect is bound once via inline onclick attrs on .hud-cell (index.html).
  // Do not add duplicate listeners here.

  tabIds.forEach((id, idx) => {
    el(id)?.addEventListener("click", () => engine.scrollToPane(idx));
  });
  el("snap-slider")?.addEventListener("scroll", () => engine.syncTabsWithScroll(), {
    passive: true,
  });

  const dial = el("nav-vector");
  if (dial) {
    dial.setAttribute("tabindex", "0");
    dial.addEventListener("pointerdown", (e) => {
      const count = navChoices.length;
      if (!count) return;
      vectorDragging = true;
      vectorDragMoved = false;
      vectorDownX = (e as PointerEvent).clientX;
      vectorDownY = (e as PointerEvent).clientY;
      const angle = vectorAngle(e as PointerEvent);
      const slot = nearestSlot(angle, count);
      (dial as HTMLElement).setPointerCapture?.((e as PointerEvent).pointerId);
      setNeedle(angle);
      const status = el("nav-vector-status");
      if (status) status.textContent = `Vector ${slot + 1}`;
    });
    dial.addEventListener("pointermove", (e) => {
      if (!vectorDragging) return;
      const count = navChoices.length;
      if (!count) return;
      const pe = e as PointerEvent;
      if (Math.hypot(pe.clientX - vectorDownX, pe.clientY - vectorDownY) > 4)
        vectorDragMoved = true;
      const angle = vectorAngle(pe);
      const slot = nearestSlot(angle, count);
      setNeedle(angle);
      lift(slot);
      const status = el("nav-vector-status");
      if (status) status.textContent = `Vector ${slot + 1}`;
    });
    dial.addEventListener("pointerup", (e) => {
      if (!vectorDragging) return;
      vectorDragging = false;
      const count = navChoices.length;
      if (!count) return;
      if (vectorDragMoved) {
        suppressVectorClick = true;
        const slot = nearestSlot(vectorAngle(e as PointerEvent), count);
        armNavSlot(slot);
      }
    });
    dial.addEventListener("pointercancel", () => {
      vectorDragging = false;
    });
    dial.addEventListener("click", (e) => {
      if (suppressVectorClick) {
        suppressVectorClick = false;
        return;
      }
      const count = navChoices.length;
      if (!count) return;
      const slot = nearestSlot(vectorAngle(e as MouseEvent), count);
      handleNavSlot(slot);
    });
    dial.addEventListener("keydown", (e) => {
      const count = navChoices.length;
      if (!count) return;
      const ke = e as KeyboardEvent;
      if (ke.key === "ArrowLeft") {
        e.preventDefault();
        armNavSlot(0);
        return;
      }
      if (ke.key === "ArrowRight") {
        e.preventDefault();
        armNavSlot(Math.min(count - 1, 1));
        return;
      }
      if (ke.key === "Enter" || ke.key === " ") {
        e.preventDefault();
        if (armedSlot >= 0) confirmNavSlot(armedSlot);
        else armNavSlot(0);
      }
    });
  }
}

bind();
{
  const overlay = el("cutscene-overlay") as (HTMLElement & { hidden: boolean }) | null;
  if (overlay) overlay.hidden = true;
  const tabs = getTabs();
  tabs.forEach((t, i) => t.classList.toggle("active", i === 2));
}
const panel = mountPluginsPanel(host, {
  onLog: (m) => appendLog(m, GAME_DATA.dom.classes.logSystem ?? "log-system"),
});
refreshPluginsPanel = panel.refresh;
void rehydratePlugins(host);
bundledPluginsReady = loadBundledPlugins(host, {
  onLog: (m) => appendLog(m, GAME_DATA.dom.classes.logSystem ?? "log-system"),
}).then((ids) => {
  if (ids.length) panel.refresh();
  return ids;
});
engine.init();
(globalThis as unknown as { Engine: EngineService }).Engine = engine;
if (typeof location !== "undefined" && new URLSearchParams(location.search).has("debug")) {
  (globalThis as unknown as { __rift?: unknown }).__rift = app;
}
