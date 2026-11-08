import type {
  ActionId,
  Phase,
  StateHook,
  TextStrings,
  Trajectory,
  YardKey,
} from "./types";
import type { Registry } from "./registry";
import type { Voyage } from "./voyage";
import type { TransitionFXService } from "./fx";
import type { SoundFXService } from "./audio";
import type { CutsceneEngine } from "./cutscene";

export interface PhaseMachineDeps {
  transitionTo: (phase: Phase) => boolean;
  executeAction: (actId: ActionId) => void;
  log: (text: string, cls?: string) => void;
  updateUI: () => void;
  lockdownGameOver: (msg: string) => void;
  setChoices: (choices: Trajectory[]) => void;
  resetNav: () => void;
  addMenuItem: (
    label: string,
    onClick: () => void,
    uiClass?: string,
    actId?: ActionId,
    yardId?: YardKey,
  ) => string;
  clearMenu: () => void;
  registry: Registry;
  voyage: Voyage;
  text?: TextStrings;
  phases?: Partial<PhaseNames>;
  resources?: Partial<ResourceNames>;
  classes?: Partial<PhaseClasses>;
  showNavScreen?: (visible: boolean) => void;
  schedule?: (fn: () => void, ms: number) => void;
  fx?: TransitionFXService;
  sound?: SoundFXService;
  cutscene?: CutsceneEngine;
}

export interface PhaseNames {
  idle: Phase;
  encounter: Phase;
  yardRoot: Phase;
  yardCategory: Phase;
  navigating: Phase;
  jumping: Phase;
  dead: Phase;
  stranded: Phase;
}

const DEFAULT_PHASES: PhaseNames = {
  idle: "IDLE",
  encounter: "ENCOUNTER",
  yardRoot: "YARD_ROOT",
  yardCategory: "YARD_CATEGORY",
  navigating: "NAVIGATING",
  jumping: "JUMPING",
  dead: "DEAD",
  stranded: "STRANDED",
};

export interface ResourceNames {
  module: string;
  carriage: string;
  crew: string;
}

const DEFAULT_RESOURCES: ResourceNames = {
  module: "module",
  carriage: "carriage",
  crew: "crew",
};

export interface PhaseClasses {
  btnDesperate: string;
  btnTravel: string;
  logSuccess: string;
}

const DEFAULT_CLASSES: PhaseClasses = {
  btnDesperate: "btn-desperate",
  btnTravel: "btn-travel",
  logSuccess: "log-success",
};

export class PhaseMachine {
  hooks: Record<string, StateHook>;
  private readonly phases: PhaseNames;
  private readonly resources: ResourceNames;
  private readonly classes: PhaseClasses;

  constructor(deps: PhaseMachineDeps) {
    this.phases = { ...DEFAULT_PHASES, ...(deps.phases ?? {}) };
    this.resources = { ...DEFAULT_RESOURCES, ...(deps.resources ?? {}) };
    this.classes = { ...DEFAULT_CLASSES, ...(deps.classes ?? {}) };
    const text = deps.text;
    const phases = this.phases;
    const resources = this.resources;
    const classes = this.classes;
    const registry = deps.registry;
    const voyage = deps.voyage;

    const evaluateSurvival = (): void => {
      const next = voyage.evaluateSurvival();
      if (next) deps.transitionTo(next);
    };
    const schedule = (fn: () => void, ms: number): void => {
      if (deps.schedule) deps.schedule(fn, ms);
      else fn();
    };

    this.hooks = {
      [phases.encounter]: {
        onEnter: () => {
          const snap = voyage.getSnapshot();
          const node = registry.getNode(snap.dimId);
          node?.actions.forEach((actId) => {
            const act = registry.getAction(actId);
            if (!act) return;
            deps.addMenuItem(
              act.label,
              () => deps.executeAction(actId),
              act.uiClass,
              actId,
            );
          });
        },
        onExit: () => deps.clearMenu(),
      },
      [phases.yardRoot]: {
        onEnter: () => {
          const categories = [
            { label: text?.btnYardModules ?? "Browse Modules", cat: resources.module },
            { label: text?.btnYardCarriages ?? "Browse Carriages", cat: resources.carriage },
            { label: text?.btnYardCrew ?? "Browse Crew", cat: resources.crew },
          ];
          categories.forEach(({ label, cat }) => {
            deps.addMenuItem(label, () => {
              voyage.setYardCategory(cat);
              deps.transitionTo(phases.yardCategory);
            });
          });
          deps.addMenuItem(
            text?.btnYardLeave ?? "Leave Train Yard",
            () => {
              deps.transitionTo(phases.encounter);
              evaluateSurvival();
            },
            classes.btnDesperate,
          );
        },
        onExit: () => deps.clearMenu(),
      },
      [phases.yardCategory]: {
        onEnter: () => {
          const snap = voyage.getSnapshot();
          registry
            .listYardKeys()
            .filter((k) => registry.getYardItem(k)?.type === snap.yardCat)
            .forEach((k) => {
              const item = registry.getYardItem(k);
              if (!item) return;
              deps.addMenuItem(
                "",
                () => {
                  if (voyage.buyYardItem(k)) {
                    deps.log(
                      text?.logYardPurchase(item.name) ?? `Procured and mounted: ${item.name}.`,
                      classes.logSuccess,
                    );
                    deps.updateUI();
                  }
                },
                undefined,
                undefined,
                k,
              );
            });
          deps.addMenuItem(
            text?.btnYardBack ?? "Back to Categories",
            () => deps.transitionTo(phases.yardRoot),
            classes.btnTravel,
          );
        },
        onExit: () => deps.clearMenu(),
      },
      [phases.navigating]: {
        onEnter: () => {
          const snap = voyage.getSnapshot();
          deps.showNavScreen?.(true);
          deps.setChoices(snap.navChoices);
        },
        onExit: () => {
          deps.showNavScreen?.(false);
          deps.resetNav();
        },
      },
      [phases.jumping]: {
        onEnter: () => {
          const snap = voyage.getSnapshot();
          const targetDimId = snap.targetDimId ?? "";
          const targetDimName = snap.targetDimName ?? "";
          const adjective = targetDimName.split(" ")[0] ?? "";
          deps.fx?.applyThemeStyles(adjective);
          deps.fx?.playJumpEffect(
            targetDimId,
            targetDimName,
            () => {
              const jumpResult = voyage.completeJump(targetDimId, targetDimName);
              if (jumpResult.greenhouseYield > 0) {
                deps.log(
                  text?.logGreenhouse(jumpResult.greenhouseYield) ??
                    `Greenhouse alchemical beds generated +${jumpResult.greenhouseYield} Fuel.`,
                  classes.logSuccess,
                );
              }
              if (jumpResult.goblinYield > 0) {
                deps.log(
                  text?.logGoblin(jumpResult.goblinYield) ??
                    `Goblin Engineer repaired +${jumpResult.goblinYield}% Hull structure.`,
                  classes.logSuccess,
                );
              }
              const nodeLabel = registry.getNode(targetDimId)?.label ?? "";
              deps.log(
                text?.logLocEnter(targetDimName, nodeLabel, jumpResult.jumpCount) ??
                  `Rift Jump #${jumpResult.jumpCount} complete. Arrived at The ${targetDimName}: ${nodeLabel}`,
              );
            },
            () => {
              deps.transitionTo(phases.idle);
              evaluateSurvival();
              const currentSnap = voyage.getSnapshot();
              const nextCutscene = deps.cutscene?.cutsceneForJump(
                currentSnap.jumpCount,
                currentSnap.seenCutscenes ?? [],
              );
              if (nextCutscene) {
                schedule(() => {
                  deps.cutscene?.play(nextCutscene);
                }, 150);
              }
            },
          );
          deps.sound?.playJumpCharge(0.9);
        },
      },
      [phases.dead]: {
        onEnter: () =>
          deps.lockdownGameOver(
            text?.logDead ?? "CRITICAL BREACH. The train is destroyed. Refresh to restart.",
          ),
      },
      [phases.stranded]: {
        onEnter: () =>
          deps.lockdownGameOver(
            text?.logStranded ??
              "STRANDED IN VOID. Zero fuel, depleted hull reserves, engine dead. Refresh to re-initialize.",
          ),
      },
    };
  }
}

export function createPhaseMachine(deps: PhaseMachineDeps): PhaseMachine {
  return new PhaseMachine(deps);
}
