import { PhaseMachine } from "./phaseMachine";
import type { PhaseMachineDeps } from "./phaseMachine";
import type { Registry } from "./registry";
import type { Voyage } from "./voyage";
import type { SaveSystem } from "./save";
import type { SoundFXService } from "./audio";
import type { TransitionFXService } from "./fx";
import type { DioramaPipelineService } from "./art";
import type { CutsceneEngine } from "./cutscene";
import type {
  ActionId,
  GameAction,
  GameConfig,
  Phase,
  StateHook,
  TextStrings,
  TierKey,
  Trajectory,
  YardItem,
  YardKey,
} from "./types";

export interface EngineDeps {
  syncUI: () => void;
  addMenuItem: (
    label: string,
    onClick: () => void,
    uiClass?: string,
    actId?: ActionId,
    yardId?: YardKey,
  ) => string;
  clearMenu: () => void;
  syncActiveMenu: () => void;
  syncSensors: () => void;
  syncSettings: () => void;
  disableAllButtons: () => void;
  setChoices: (choices: Trajectory[]) => void;
  resetNav: () => void;
  appendLog?: (msg: string, cls: string) => void;
  logError?: (msg: string) => void;
  confirmReset?: () => boolean;
  reload?: () => void;
  lockUI?: () => void;
  showStarted?: (started: boolean) => void;
  scrollStarted?: () => void;
  syncObserverPresence?: (departed: boolean) => void;
  onExploreSurveyed?: () => void;
  showNavScreen?: (visible: boolean) => void;
  schedule?: (fn: () => void, ms: number) => void;
  onSyncTabs?: () => void;
  onScrollToPane?: (index: number) => void;
}

export interface LogClasses {
  logSystem: string;
  logEvent: string;
  logDamage: string;
  logHelp: string;
  logLore: string;
}

const DEFAULT_LOG_CLASSES: LogClasses = {
  logSystem: "log-system",
  logEvent: "log-event",
  logDamage: "log-damage",
  logHelp: "log-help",
  logLore: "log-lore",
};

const DEFAULT_PHASES: Record<string, Phase> = {
  start: "START",
  idle: "IDLE",
  dialogue: "DIALOGUE",
  encounter: "ENCOUNTER",
  navigating: "NAVIGATING",
  jumping: "JUMPING",
  dead: "DEAD",
  stranded: "STRANDED",
  yard_root: "YARD_ROOT",
  yard_category: "YARD_CATEGORY",
};

const DEFAULT_TRANSITIONS: Record<string, Phase[]> = {
  START: ["IDLE", "DIALOGUE"],
  IDLE: ["DIALOGUE", "ENCOUNTER", "NAVIGATING", "JUMPING", "DEAD", "STRANDED", "IDLE"],
  DIALOGUE: ["IDLE", "DEAD", "STRANDED"],
  ENCOUNTER: ["IDLE", "DIALOGUE", "YARD_ROOT", "DEAD", "STRANDED", "NAVIGATING", "JUMPING"],
  YARD_ROOT: ["YARD_CATEGORY", "ENCOUNTER"],
  YARD_CATEGORY: ["YARD_ROOT"],
  NAVIGATING: ["JUMPING", "IDLE", "DEAD", "STRANDED"],
  JUMPING: ["IDLE", "DIALOGUE", "DEAD", "STRANDED"],
  DEAD: [],
  STRANDED: [],
};

export interface EngineServiceDeps {
  registry: Registry;
  config: GameConfig;
  voyage: Voyage;
  deps: EngineDeps;
  save?: SaveSystem;
  sound?: SoundFXService;
  fx?: TransitionFXService;
  art?: DioramaPipelineService;
  cutscene?: CutsceneEngine;
  text?: TextStrings;
  glossary?: Record<string, string>;
  transitions?: Record<string, Phase[]>;
  phases?: Record<string, Phase>;
  logClasses?: Partial<LogClasses>;
  phaseMachine?: Partial<PhaseMachineDeps>;
}

export class EngineService {
  hooks: Record<string, StateHook> = {};

  private readonly registry: Registry;
  private readonly config: GameConfig;
  private readonly voyage: Voyage;
  private readonly deps: EngineDeps;
  private readonly save: SaveSystem | undefined;
  private readonly sound: SoundFXService | undefined;
  private readonly fx: TransitionFXService | undefined;
  private readonly art: DioramaPipelineService | undefined;
  private readonly cutscene: CutsceneEngine | undefined;
  private readonly text: TextStrings | undefined;
  private readonly glossary: Record<string, string> | undefined;
  private readonly transitions: Record<string, Phase[]>;
  private readonly phases: Record<string, Phase>;
  private readonly logClasses: LogClasses;

  constructor(deps: EngineServiceDeps) {
    this.registry = deps.registry;
    this.config = deps.config;
    this.voyage = deps.voyage;
    this.deps = deps.deps;
    this.save = deps.save;
    this.sound = deps.sound;
    this.fx = deps.fx;
    this.art = deps.art;
    this.cutscene = deps.cutscene;
    this.text = deps.text;
    this.glossary = deps.glossary;
    this.transitions = deps.transitions ?? DEFAULT_TRANSITIONS;
    this.phases = deps.phases ?? DEFAULT_PHASES;
    this.logClasses = { ...DEFAULT_LOG_CLASSES, ...(deps.logClasses ?? {}) };
  }

  logClass(name: keyof LogClasses): string {
    return this.logClasses[name];
  }

  depsClearMenu(): void {
    this.deps.clearMenu();
  }

  attachHooks(hooks: Record<string, StateHook>): void {
    this.hooks = hooks;
  }

  private phaseOf(key: string, fallback: Phase): Phase {
    return this.phases[key] ?? fallback;
  }

  private report(msg: string): void {
    this.deps.logError?.(msg);
  }

  verifyGraphIntegrity(): void {
    const phases = Object.values(this.phases) as Phase[];
    const terminal: Phase[] = [
      this.phaseOf("dead", "DEAD"),
      this.phaseOf("stranded", "STRANDED"),
    ];
    for (const [phase, targets] of Object.entries(this.transitions)) {
      if (targets.length === 0 && !terminal.includes(phase)) {
        this.report(`FATAL: State Machine Deadlock. Phase '${phase}' has no valid exits.`);
      }
      targets.forEach((t) => {
        if (!phases.includes(t)) {
          this.report(
            `FATAL: State Machine Orphan. Phase '${phase}' targets invalid phase '${t}'.`,
          );
        }
      });
    }
  }

  assertInvariants(): void {
    for (const breach of this.voyage.assertInvariants()) {
      this.report(`INVARIANT BREACH: ${breach}`);
    }
  }

  log(msg: string, styleClass: string): void {
    this.deps.appendLog?.(msg, styleClass);
  }

  inspect(topic: string): void {
    const info = this.glossary?.[topic];
    if (info) {
      this.log(`[INTEL] ${info}`, this.logClasses.logHelp);
    }
  }

  transitionTo(newPhase: Phase): boolean {
    const currentPhase = this.voyage.getPhase();
    const allowed = this.transitions[currentPhase];
    if (!allowed) {
      this.report(`ILLEGAL TRANSITION: Cannot move from ${currentPhase} to ${newPhase}`);
      return false;
    }
    if (!allowed.includes(newPhase)) {
      this.report(`ILLEGAL TRANSITION: Cannot move from ${currentPhase} to ${newPhase}`);
      return false;
    }
    this.hooks[currentPhase]?.onExit?.();
    this.voyage.setPhase(newPhase);
    this.hooks[newPhase]?.onEnter?.();
    this.updateUI();
    return true;
  }

  private evaluateSurvival(): void {
    const next = this.voyage.evaluateSurvival();
    if (next) this.transitionTo(next);
  }

  executeAction(actId: ActionId): void {
    const res = this.voyage.executeAction(actId);
    if (res.isMenu) {
      if (res.menuTarget) this.transitionTo(res.menuTarget);
      return;
    }
    this.log(res.logText ?? "", res.logClass ?? "");
    const snap = this.voyage.getSnapshot();
    if (snap.hull <= this.config.DEATH_HULL_THRESHOLD) {
      this.transitionTo(this.phaseOf("dead", "DEAD"));
    } else {
      this.transitionTo(this.phaseOf("idle", "IDLE"));
      this.evaluateSurvival();
    }
  }

  exploreNode(): void {
    const snap = this.voyage.getSnapshot();
    const node = this.registry.getNode(snap.dimId);
    if (!node) return;
    if (snap.energy < node.exploreCost) return;
    const success = this.voyage.exploreNode();
    if (!success) return;
    this.deps.onExploreSurveyed?.();
    this.log(
      this.text?.logEncounterTitle(node.label, node.desc) ?? `<b>${node.label}:</b> ${node.desc}`,
      this.logClasses.logEvent,
    );
    this.sound?.playDialogueChime();
    this.transitionTo(this.phaseOf("encounter", "ENCOUNTER"));
    this.evaluateSurvival();
  }

  initiateTravel(): void {
    const travel = this.voyage.initiateTravel();
    if (!travel) return;
    if (travel.isNavigating) {
      this.transitionTo(this.phaseOf("navigating", "NAVIGATING"));
    } else {
      this.finalizeJump(travel.targetDimId, travel.targetDimName);
    }
  }

  finalizeJump(dimId: string, dimName: string): void {
    this.voyage.commitJumpTarget(dimId, dimName);
    this.transitionTo(this.phaseOf("jumping", "JUMPING"));
  }

  desperateScavenge(): void {
    const success = this.voyage.desperateScavenge();
    if (!success) return;
    this.log(
      this.text?.logDesperate ?? "DESPERATE MEASURE: Sacrificed hull plates to feed the Crucible.",
      this.logClasses.logDamage,
    );
    this.updateUI();
    this.evaluateSurvival();
  }

  buildMenuButton(
    label: string,
    onClick: () => void,
    uiClass?: string,
    dataActId?: string,
  ): string {
    return this.deps.addMenuItem(
      label,
      onClick,
      uiClass,
      dataActId as ActionId | undefined,
    );
  }

  updateActionBtnData(_btn: string | null, _act: GameAction): void {
    this.deps.syncActiveMenu();
  }

  updateYardBtnData(_btn: string | null, _item: YardItem): void {
    this.deps.syncActiveMenu();
  }

  refreshActiveMenu(): void {
    this.deps.syncActiveMenu();
  }

  renderSensors(): void {
    this.deps.syncSensors();
    const snap = this.voyage.getSnapshot();
    if (!snap.isSurveyed) {
      this.fx?.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
    }
  }

  renderVitals(): void {
    this.deps.syncUI();
    this.deps.syncObserverPresence?.(this.voyage.hasObserverDeparted());
  }

  renderInteractiveControls(): void {
    this.deps.syncUI();
  }

  renderForge(): void {
    this.deps.syncUI();
  }

  forgeUpgrade(tierKey: TierKey, onUpgrade?: () => void): void {
    const success = this.voyage.forgeUpgrade(tierKey, onUpgrade);
    if (success) {
      this.updateUI();
      this.evaluateSurvival();
    }
  }

  resetGame(confirmPrompt: boolean = true): void {
    if (confirmPrompt && this.deps.confirmReset && !this.deps.confirmReset()) return;
    this.save?.clear();
    this.deps.reload?.();
  }

  lockdownGameOver(logMessage: string): void {
    this.save?.clear();
    this.sound?.silenceOnDeath();
    this.deps.disableAllButtons();
    this.deps.lockUI?.();
    this.log(logMessage, this.logClasses.logDamage);
  }

  updateUI(): void {
    this.voyage.enforceStateBounds();
    this.renderVitals();
    this.renderInteractiveControls();
    this.renderForge();
    this.refreshActiveMenu();
    this.renderSensors();
    this.assertInvariants();
  }

  ignite(): void {
    this.sound?.init();
    this.deps.showStarted?.(true);
    const saved = this.save?.load() ?? null;
    if (saved) {
      this.voyage.loadState(saved);
      const snap = this.voyage.getSnapshot();
      this.fx?.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
      this.log(
        `[CONDUIT] Resumed trajectory at ${snap.dimName} (Waypoint ${snap.jumpCount}).`,
        this.logClasses.logSystem,
      );
    } else {
      this.voyage.resetState();
    }
    this.transitionTo(this.phaseOf("idle", "IDLE"));
    if (this.deps.schedule) {
      this.deps.schedule(() => {
        this.deps.scrollStarted?.();
      }, 50);
    } else {
      this.deps.scrollStarted?.();
    }
    const snap = this.voyage.getSnapshot();
    if (snap.jumpCount === 1 && !(snap.seenCutscenes ?? []).includes("wp1")) {
      const firstId = this.cutscene?.firstCutscene() ?? "wp1";
      const play = (): void => {
        this.cutscene?.play(firstId);
      };
      if (this.deps.schedule) this.deps.schedule(play, 120);
      else play();
    }
  }

  init(): void {
    this.verifyGraphIntegrity();
    this.art?.init();
    this.fx?.init();
    this.deps.syncSettings();
    const snap = this.voyage.getSnapshot();
    this.fx?.applyThemeStyles(snap.dimName.split(" ")[0] ?? "");
    this.log(
      this.text?.initLog ?? "The Crucible Engine hums to life. The Ley-Rails stretch into infinity.",
      this.logClasses.logSystem,
    );
  }

  syncTabsWithScroll(): void {
    this.deps.onSyncTabs?.();
  }

  scrollToPane(index: number): void {
    this.deps.onScrollToPane?.(index);
  }
}

export function createEngine(factoryDeps: EngineServiceDeps): EngineService {
  const engine = new EngineService(factoryDeps);
  const d = factoryDeps.deps;
  const phaseMachine = new PhaseMachine({
    transitionTo: (phase) => engine.transitionTo(phase),
    executeAction: (actId) => engine.executeAction(actId),
    log: (text, cls) => engine.log(text, cls ?? engine.logClass("logSystem")),
    updateUI: () => engine.updateUI(),
    lockdownGameOver: (msg) => engine.lockdownGameOver(msg),
    setChoices: d.setChoices,
    resetNav: d.resetNav,
    addMenuItem: d.addMenuItem,
    clearMenu: d.clearMenu,
    registry: factoryDeps.registry,
    voyage: factoryDeps.voyage,
    text: factoryDeps.text,
    showNavScreen: d.showNavScreen,
    schedule: d.schedule,
    fx: factoryDeps.fx,
    sound: factoryDeps.sound,
    cutscene: factoryDeps.cutscene,
    ...(factoryDeps.phaseMachine ?? {}),
  });
  engine.attachHooks(phaseMachine.hooks);
  return engine;
}

export function stateHooksOf(engine: EngineService): Record<string, StateHook> {
  return engine.hooks;
}

export function clearEncounterChoices(engine: EngineService): void {
  engine.depsClearMenu();
}
