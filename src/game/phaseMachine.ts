import { CutsceneEngine } from "./cutscene";
import { GAME_DATA } from "./data";
import { TransitionFX } from "./fx";
import { SoundFX } from "./audio";
import { VoyageSession } from "./session";
import { setChoices, resetNav } from "../stores/nav.svelte";
import { addMenuItem, clearMenu } from "../stores/menu.svelte";
import type { Phase, StateHook } from "./types";
import { DOM } from "../ui/dom";

export interface PhaseMachineDeps {
  transitionTo: (phase: Phase) => boolean;
  executeAction: (actId: Parameters<typeof VoyageSession.executeAction>[0]) => void;
  log: (text: string, cls?: string) => void;
  updateUI: () => void;
  lockdownGameOver: (msg: string) => void;
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
            addMenuItem(
              act.isMenu ? act.label : "",
              () => this.deps.executeAction(actId as never),
              act.uiClass,
              actId,
            );
          });
        },
        onExit: () => clearMenu(),
      },
      YARD_ROOT: {
        onEnter: () => {
          const categories = [
            { label: GAME_DATA.text.btnYardModules, cat: GAME_DATA.resources.module },
            { label: GAME_DATA.text.btnYardCarriages, cat: GAME_DATA.resources.carriage },
            { label: GAME_DATA.text.btnYardCrew, cat: GAME_DATA.resources.crew },
          ];
          categories.forEach(({ label, cat }) => {
            addMenuItem(label, () => {
              VoyageSession.setYardCategory(cat);
              this.deps.transitionTo(GAME_DATA.phases.yard_category!);
            });
          });
          addMenuItem(
            GAME_DATA.text.btnYardLeave,
            () => {
              this.deps.transitionTo(GAME_DATA.phases.encounter!);
              VoyageSession.evaluateSurvival();
            },
            GAME_DATA.dom.classes.btnDesperate,
          );
        },
        onExit: () => clearMenu(),
      },
      YARD_CATEGORY: {
        onEnter: () => {
          const snap = VoyageSession.getSnapshot();
          Object.entries(GAME_DATA.yard)
            .filter(([, i]) => i.type === snap.yardCat)
            .forEach(([k, item]) => {
              addMenuItem(
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
                k as never,
              );
            });
          addMenuItem(
            GAME_DATA.text.btnYardBack,
            () => this.deps.transitionTo(GAME_DATA.phases.yard_root!),
            GAME_DATA.dom.classes.btnTravel,
          );
        },
        onExit: () => clearMenu(),
      },
      NAVIGATING: {
        onEnter: () => {
          const snap = VoyageSession.getSnapshot();
          DOM.navScreen.style.display = "flex";
          setChoices(snap.navChoices);
        },
        onExit: () => {
          DOM.navScreen.style.display = "none";
          resetNav();
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
