import { DOM } from "../ui/dom";
import { SoundFX } from "./audio";
import { GAME_DATA } from "./data";
import { Engine } from "./engine";
import { VoyageSession } from "./session";
import type { Cutscene, CutsceneId } from "./types";

export const CutsceneEngine = {
  activeCutscene: null as Cutscene | null,
  beatIndex: 0,
  returnFocus: null as Element | null,

  trapFocus(this: void, event: Event): void {
    if (!CutsceneEngine.activeCutscene) return;
    if (event instanceof KeyboardEvent && event.key === "Tab") {
      event.preventDefault();
      DOM.cutsceneBtnA.focus();
    } else if (event instanceof FocusEvent && !DOM.cutsceneOverlay.contains(event.target as Node)) {
      DOM.cutsceneBtnA.focus();
    }
  },

  showExploreHint(): void {
    const snap = VoyageSession.getSnapshot();
    const node = GAME_DATA.nodes[snap.dimId];
    DOM.tutorialCue.innerText = GAME_DATA.text.tutorialExplore(node.isHub, node.exploreCost);
    DOM.tutorialCue.hidden = false;
    DOM.btnExplore.classList.add(GAME_DATA.dom.classes.tutorialHighlight!);
  },

  play(cutsceneId: string): void {
    const cutscene = GAME_DATA.cutscenes[cutsceneId as CutsceneId];
    if (!cutscene) return;

    CutsceneEngine.activeCutscene = cutscene;
    CutsceneEngine.beatIndex = 0;
    CutsceneEngine.returnFocus = document.activeElement;
    VoyageSession.markCutsceneSeen(cutsceneId);

    DOM.gameContainer.inert = true;
    DOM.cutsceneOverlay.hidden = false;
    Engine.transitionTo(GAME_DATA.phases.dialogue!);
    CutsceneEngine.renderCurrentBeat();
    DOM.cutsceneBtnA.focus();
  },

  renderCurrentBeat(): void {
    const cutscene = CutsceneEngine.activeCutscene;
    if (!cutscene) return;
    const beat = cutscene.beats[CutsceneEngine.beatIndex];
    if (!beat) return;

    SoundFX.playDialogueChime();

    const total = cutscene.beats.length;
    let pips = "";
    for (let i = 0; i < total; i++) {
      pips += i <= CutsceneEngine.beatIndex ? "✦ " : "✧ ";
    }
    DOM.cutsceneProgress.innerText = pips.trim();
    DOM.cutsceneProgress.setAttribute(
      "aria-label",
      GAME_DATA.text.formatCutsceneProgress(CutsceneEngine.beatIndex + 1, total),
    );
    DOM.cutsceneBody.innerText = beat.text;

    DOM.cutsceneBtnA.innerText = `[A] "${beat.choiceA}"`;
    DOM.cutsceneBtnB.innerText = `[B] "${beat.choiceB}"`;
  },

  advance(): void {
    const cutscene = CutsceneEngine.activeCutscene;
    if (!cutscene) return;
    CutsceneEngine.beatIndex++;

    if (CutsceneEngine.beatIndex < cutscene.beats.length) {
      CutsceneEngine.renderCurrentBeat();
    } else {
      CutsceneEngine.close();
    }
  },

  close(): void {
    const cutscene = CutsceneEngine.activeCutscene;
    DOM.cutsceneOverlay.hidden = true;
    DOM.gameContainer.inert = false;

    if (cutscene?.logSummary) {
      Engine.log(cutscene.logSummary, GAME_DATA.dom.classes.logLore!);
    }

    CutsceneEngine.activeCutscene = null;
    CutsceneEngine.beatIndex = 0;

    Engine.transitionTo(GAME_DATA.phases.idle!);
    VoyageSession.evaluateSurvival();

    if (cutscene?.id === "wp1") CutsceneEngine.showExploreHint();

    const returnFocus = CutsceneEngine.returnFocus;
    const canRestoreFocus =
      returnFocus !== null &&
      returnFocus instanceof HTMLElement &&
      returnFocus.isConnected &&
      returnFocus !== document.body &&
      returnFocus !== document.documentElement &&
      !(returnFocus as HTMLButtonElement).disabled &&
      returnFocus.getClientRects().length > 0;
    let focusRestored = false;
    if (canRestoreFocus) {
      returnFocus.focus();
      focusRestored = document.activeElement === returnFocus;
    }
    if (!focusRestored) {
      if (!DOM.btnExplore.disabled) {
        DOM.btnExplore.focus();
      } else {
        DOM.locationName.focus();
      }
    }
    CutsceneEngine.returnFocus = null;
  },
};
