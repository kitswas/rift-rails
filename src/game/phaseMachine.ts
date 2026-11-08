import { CutsceneEngine } from "./cutscene";
import { GAME_DATA } from "./data";
import { TransitionFX } from "./fx";
import { SoundFX } from "./audio";
import { VoyageSession } from "./session";
import type { ActionId, Phase, StateHook, Trajectory, YardKey } from "./types";

export interface PhaseMachineDeps {
  transitionTo: (phase: Phase) => boolean;
  executeAction: (actId: Parameters<typeof VoyageSession.executeAction>[0]) => void;
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
}

export class PhaseMachine {
  hooks: Record<string, StateHook>;

  constructor(private readonly deps: PhaseMachineDeps) {
    this.hooks = {
      ENCOUNTER: {
        onEnter: () => {
          const snap = VoyageSession.getSnapshot();
          GAME_DATA.nodes[snap.dimId].actions.forEach((actId) => {
            const act = GAME_DATA.actions[actId]!;
            this.deps.addMenuItem(
              act.isMenu ? act.label : "",
              () => this.deps.executeAction(actId as never),
              act.uiClass,
              actId,
            );
          });
        },
        onExit: () => this.deps.clearMenu(),
      },
      YARD_ROOT: {
        onEnter: () => {
          const categories = [
            { label: GAME_DATA.text.btnYardModules, cat: GAME_DATA.resources.module },
            { label: GAME_DATA.text.btnYardCarriages, cat: GAME_DATA.resources.carriage },
            { label: GAME_DATA.text.btnYardCrew, cat: GAME_DATA.resources.crew },
          ];
          categories.forEach(({ label, cat }) => {
            this.deps.addMenuItem(label, () => {
              VoyageSession.setYardCategory(cat);
              this.deps.transitionTo(GAME_DATA.phases.yard_category!);
            });
          });
          this.deps.addMenuItem(
            GAME_DATA.text.btnYardLeave,
            () => {
              this.deps.transitionTo(GAME_DATA.phases.encounter!);
              VoyageSession.evaluateSurvival();
            },
            GAME_DATA.dom.classes.btnDesperate,
          );
        },
        onExit: () => this.deps.clearMenu(),
      },
      YARD_CATEGORY: {
        onEnter: () => {
          const snap = VoyageSession.getSnapshot();
          Object.entries(GAME_DATA.yard)
            .filter(([, i]) => i.type === snap.yardCat)
            .forEach(([k, item]) => {
              this.deps.addMenuItem(
                "",
                () => {
                  if (VoyageSession.buyYardItem(k as never)) {
                    this.deps.log(
                      GAME_DATA.text.logYardPurchase(item.name),
                      GAME_DATA.dom.classes.logSuccess!,
                    );
                    this.deps.updateUI();
                  }
                },
                undefined,
                undefined,
                k as YardKey,
              );
            });
          this.deps.addMenuItem(
            GAME_DATA.text.btnYardBack,
            () => this.deps.transitionTo(GAME_DATA.phases.yard_root!),
            GAME_DATA.dom.classes.btnTravel,
          );
        },
        onExit: () => this.deps.clearMenu(),
      },
      NAVIGATING: {
        onEnter: () => {
          const snap = VoyageSession.getSnapshot();
          document.getElementById(GAME_DATA.dom.ids.navScreen!)!.style.display = "flex";
          this.deps.setChoices(snap.navChoices);
        },
        onExit: () => {
          document.getElementById(GAME_DATA.dom.ids.navScreen!)!.style.display = "none";
          this.deps.resetNav();
        },
      },
      JUMPING: {
        onEnter: () => {
          const snap = VoyageSession.getSnapshot();
          const targetDimId = snap.targetDimId ?? "";
          const targetDimName = snap.targetDimName ?? "";
          TransitionFX.applyThemeStyles(targetDimName.split(" ")[0] ?? "");
          TransitionFX.playJumpEffect(
            targetDimId,
            targetDimName,
            () => {
              const jumpResult = VoyageSession.completeJump(targetDimId, targetDimName);
              if (jumpResult.greenhouseYield > 0) {
                this.deps.log(
                  GAME_DATA.text.logGreenhouse(jumpResult.greenhouseYield),
                  GAME_DATA.dom.classes.logSystem!,
                );
              }
              if (jumpResult.goblinYield > 0) {
                this.deps.log(
                  GAME_DATA.text.logGoblin(jumpResult.goblinYield),
                  GAME_DATA.dom.classes.logSystem!,
                );
              }
              this.deps.log(
                GAME_DATA.text.logLocEnter(
                  targetDimName,
                  GAME_DATA.nodes[targetDimId as "hub"].label,
                  jumpResult.jumpCount,
                ),
                GAME_DATA.dom.classes.logSystem!,
              );
            },
            () => {
              this.deps.transitionTo(GAME_DATA.phases.idle!);
              VoyageSession.evaluateSurvival();
              const currentSnap = VoyageSession.getSnapshot();
              const wpCutsceneMap: Record<number, string> = {
                2: "wp2",
                3: "wp3",
                4: "wp4",
                5: "wp5",
              };
              const nextCutscene = wpCutsceneMap[currentSnap.jumpCount];
              if (nextCutscene && !currentSnap.seenCutscenes?.includes(nextCutscene)) {
                setTimeout(() => {
                  CutsceneEngine.play(nextCutscene);
                }, 150);
              }
            },
          );
          SoundFX.playJumpCharge(0.9);
        },
      },
      DEAD: { onEnter: () => this.deps.lockdownGameOver(GAME_DATA.text.logDead) },
      STRANDED: { onEnter: () => this.deps.lockdownGameOver(GAME_DATA.text.logStranded) },
    };
  }
}
