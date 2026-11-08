import "./style.css";
import { GAME_DATA } from "./game/data";
import { Registry } from "./game/registry";
import { ConduitDeck } from "./game/conduit";
import { Voyage } from "./game/voyage";
import { PluginHost } from "./game/host";
import { SaveSystem } from "./game/save";
import type { GameAction, Phase, Trajectory } from "./game/types";
import {
  appendLog,
  hideCutscene,
  hideNavScreen,
  renderActionButtons,
  renderCutscene,
  renderEncounterChoices,
  renderForge,
  renderNavScreen,
  renderPanels,
  renderVitals,
} from "./ui/render";
import { mountPluginsPanel, readEnabled, rehydratePlugins } from "./ui/panels";

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

/* ------------------------------------------------------------------ */
/* PhaseMachine: legal-transition gate over GAME_DATA.transitions.     */
/* ------------------------------------------------------------------ */
export class PhaseMachine {
  private readonly transitions: Record<string, Phase[]>;
  private readonly hooks: {
    onEnter?: Record<string, () => void>;
    onExit?: Record<string, () => void>;
  };

  constructor(
    transitions: Record<string, Phase[]>,
    hooks: {
      onEnter?: Record<string, () => void>;
      onExit?: Record<string, () => void>;
    } = {},
  ) {
    this.transitions = transitions;
    this.hooks = hooks;
  }

  canTransition(from: Phase, to: Phase): boolean {
    return (this.transitions[from] ?? []).includes(to);
  }

  transition(voyage: Voyage, to: Phase): boolean {
    const from = voyage.getPhase();
    if (!this.canTransition(from, to)) {
      console.error(`ILLEGAL TRANSITION: ${from} -> ${to}`);
      return false;
    }
    bus.emit("onExit", { phase: from });
    this.hooks.onExit?.[from]?.();
    voyage.setPhase(to);
    this.hooks.onEnter?.[to]?.();
    bus.emit("onEnter", { phase: to });
    if (to === "DEAD" || to === "STRANDED") bus.emit("onDeath", { phase: to });
    return true;
  }

  verifyGraphIntegrity(): void {
    for (const [from, targets] of Object.entries(this.transitions)) {
      for (const t of targets) {
        if (!(t in this.transitions)) throw new Error(`graph: unknown target ${t} from ${from}`);
      }
    }
    for (const [from, targets] of Object.entries(this.transitions)) {
      if (from !== "DEAD" && from !== "STRANDED" && targets.length === 0) {
        throw new Error(`graph: dead end at ${from}`);
      }
    }
  }
}

/* ------------------------------------------------------------------ */
/* Engine: wires Voyage + PhaseMachine + PluginHost + render.         */
/* ------------------------------------------------------------------ */
export class Engine {
  readonly phases: PhaseMachine;
  readonly saves: SaveSystem;
  private cutsceneId: string | null = null;
  private beat = 0;

  constructor(
    readonly voyage: Voyage,
    readonly host: PluginHost,
    private readonly registry: Registry,
    private readonly conduit: ConduitDeck,
  ) {
    this.saves = new SaveSystem({
      storage: localStorage,
      voyage,
      getEnabledPlugins: () => readEnabled(),
      getHostStorage: () => host.serializeAllStorage(),
    });
    this.phases = new PhaseMachine(GAME_DATA.transitions, {
      onEnter: {
        NAVIGATING: () => renderNavScreen(voyage.state.navChoices, (t) => this.pickTrajectory(t)),
        JUMPING: () => this.runJump(),
        DEAD: () => appendLog(GAME_DATA.text.logDead, GAME_DATA.dom.classes.logDamage),
        STRANDED: () => appendLog(GAME_DATA.text.logStranded, GAME_DATA.dom.classes.logDamage),
        ENCOUNTER: () => renderEncounterChoices(voyage.state.dimId, this.actionMap(), (id) => this.pickAction(id), registry),
      },
      onExit: {
        NAVIGATING: () => hideNavScreen(),
        ENCOUNTER: () => {
          const h = document.getElementById("encounter-choices");
          if (h) h.innerHTML = "";
        },
      },
    });
  }

  private actionMap(): Record<string, GameAction> {
    const out: Record<string, GameAction> = {};
    for (const id of this.registry.listActionIds()) {
      const a = this.registry.getAction(id);
      if (a) out[id] = a;
    }
    return out;
  }

  explore(): void {
    if (!this.voyage.exploreNode()) return;
    appendLog(GAME_DATA.text.logEncounterTitle(this.voyage.state.dimId, this.voyage.state.dimId), GAME_DATA.dom.classes.logEvent);
    this.phases.transition(this.voyage, GAME_DATA.phases.encounter ?? "ENCOUNTER");
    this.render();
  }

  travel(): void {
    const r = this.voyage.initiateTravel();
    if (!r) return;
    if (r.isNavigating) {
      this.phases.transition(this.voyage, GAME_DATA.phases.navigating ?? "NAVIGATING");
    } else {
      this.voyage.commitJumpTarget(r.targetDimId, r.targetDimName);
      this.phases.transition(this.voyage, GAME_DATA.phases.jumping ?? "JUMPING");
    }
    this.render();
  }

  pickTrajectory(t: Trajectory): void {
    const committed = this.conduit.commitTrajectory(t);
    this.voyage.commitJumpTarget(committed.dimId, committed.dimName);
    this.phases.transition(this.voyage, GAME_DATA.phases.jumping ?? "JUMPING");
    this.render();
  }

  private runJump(): void {
    const id = this.voyage.state.targetDimId ?? this.voyage.state.dimId;
    const name = this.voyage.state.targetDimName ?? this.voyage.state.dimName;
    const res = this.voyage.completeJump(id, name);
    appendLog(GAME_DATA.text.logLocEnter(name, id, res.jumpCount), GAME_DATA.dom.classes.logSystem);
    bus.emit("afterJump", { jumpCount: res.jumpCount });
    this.phases.transition(this.voyage, GAME_DATA.phases.idle ?? "IDLE");
    this.render();
  }

  desperate(): void {
    if (!this.voyage.desperateScavenge()) return;
    appendLog(GAME_DATA.text.logDesperate, GAME_DATA.dom.classes.logDamage);
    this.render();
  }

  forge(tier: "engineTier" | "weaponTier"): void {
    this.voyage.forgeUpgrade(tier);
    this.render();
  }

  pickAction(actId: string): void {
    bus.emit("beforeAction", { actionId: actId });
    const res = this.voyage.executeAction(actId);
    if (!res.isMenu && res.logText) {
      appendLog(res.logText, res.logClass ?? GAME_DATA.dom.classes.logEvent);
    }
    bus.emit("afterAction", { actionId: actId, success: !res.isMenu && res.success });
    if (res.isMenu) {
      this.phases.transition(this.voyage, res.menuTarget);
    } else {
      this.phases.transition(this.voyage, GAME_DATA.phases.idle ?? "IDLE");
    }
    this.render();
  }

  playCutscene(id: string): void {
    if (this.voyage.state.seenCutscenes.includes(id)) return;
    const cut = this.registry.getCutscene(id);
    if (!cut || cut.beats.length === 0) return;
    this.cutsceneId = id;
    this.beat = 0;
    renderCutscene(cut, 0);
  }

  advanceCutscene(): void {
    if (!this.cutsceneId) return;
    const cut = this.registry.getCutscene(this.cutsceneId);
    if (!cut) return;
    this.beat += 1;
    if (this.beat >= cut.beats.length) {
      this.voyage.markCutsceneSeen(this.cutsceneId);
      if (cut.logSummary) appendLog(cut.logSummary, GAME_DATA.dom.classes.logLore);
      this.cutsceneId = null;
      this.beat = 0;
      hideCutscene();
      this.phases.transition(this.voyage, GAME_DATA.phases.idle ?? "IDLE");
      this.render();
      return;
    }
    renderCutscene(cut, this.beat);
  }

  save(): void {
    this.saves.save();
    bus.emit("onSave", { storage: this.host.serializeAllStorage() });
  }

  load(): boolean {
    const payload = this.saves.load();
    if (!payload) return false;
    this.voyage.loadState({ ...payload, pluginState: payload.pluginState ?? {} });
    return true;
  }

  reset(): void {
    this.saves.clear();
    this.voyage.resetState();
    this.render();
  }

  render(): void {
    const s = this.voyage.state;
    renderVitals(s);
    const perms = GAME_DATA.permissions[s.phase] ?? { explore: false, travel: false, forge: false };
    renderActionButtons(s, perms);
    renderForge(s, perms.forge);
  }

  mount(mountEl: HTMLElement): void {
    mountEl.style.display = "flex";
    renderPanels("BRIDGE");
    this.render();
    appendLog(GAME_DATA.text.initLog, GAME_DATA.dom.classes.logSystem);
  }
}

/* ------------------------------------------------------------------ */
/* Boot: create Registry + ConduitDeck + Voyage + Engine + PluginHost. */
/* ------------------------------------------------------------------ */

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
});
conduit.init();

const voyage = new Voyage(registry, GAME_DATA.config, conduit);

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
    registerAction: (pluginId, def) => registry.registerAction(`${pluginId}:${def.id}`, def as never),
    registerNode: (pluginId, def) => registry.registerNode(`${pluginId}:${def.id}`, def as never),
    removePlugin: (pluginId) => {
      for (const id of registry.listActionIds()) if (id.startsWith(`${pluginId}:`)) registry.unregisterAction(id);
      for (const id of registry.listNodeIds()) if (id.startsWith(`${pluginId}:`)) registry.unregisterNode(id);
    },
  },
  log: (msg) => appendLog(msg, GAME_DATA.dom.classes.logSystem),
  events: bus,
});

const engine = new Engine(voyage, host, registry, conduit);
engine.phases.verifyGraphIntegrity();
voyage.hooks.onSave = () => engine.save();

export const app = { registry, conduit, voyage, engine, host };

function bind(eng: Engine): void {
  const $ = (id: string) => document.getElementById(id);
  $("btn-explore")?.addEventListener("click", () => eng.explore());
  $("btn-travel")?.addEventListener("click", () => eng.travel());
  $("btn-desperate")?.addEventListener("click", () => eng.desperate());
  $("btn-forge-engine")?.addEventListener("click", () => eng.forge("engineTier"));
  $("btn-forge-weapon")?.addEventListener("click", () => eng.forge("weaponTier"));
  $("btn-reset-save")?.addEventListener("click", () => eng.reset());
  $("cutscene-btn-a")?.addEventListener("click", () => eng.advanceCutscene());
  $("cutscene-btn-b")?.addEventListener("click", () => eng.advanceCutscene());

  const tabs: [string, string][] = [
    ["tab-settings", "SETTINGS"],
    ["tab-sensors", "SENSORS"],
    ["tab-bridge", "BRIDGE"],
    ["tab-forge", "FORGE"],
    ["tab-manual", "MANUAL"],
  ];
  for (const [tabId, pane] of tabs) {
    $(tabId)?.addEventListener("click", () => renderPanels(pane));
  }

  $("btn-ignite")?.addEventListener("click", () => {
    document.getElementById("start-screen")?.style.setProperty("display", "none");
    const game = document.getElementById("game-container");
    if (game) {
      eng.load();
      eng.mount(game);
    }
    if (eng.voyage.state.jumpCount === 1) eng.playCutscene("wp1");
  });
  $("btn-start-fresh")?.addEventListener("click", () => eng.reset());
}

bind(engine);
mountPluginsPanel(host, { onLog: (m) => appendLog(m, GAME_DATA.dom.classes.logSystem) });
void rehydratePlugins(host);

if (typeof location !== "undefined" && new URLSearchParams(location.search).has("debug")) {
  (globalThis as unknown as { __rift?: unknown }).__rift = app;
}
