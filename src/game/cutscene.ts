// @ts-nocheck -- legacy module extracted verbatim; remove per-module as types land.
// Extracted verbatim from index.html during TS migration.
import { DOM } from "../ui/dom";
import { SoundFX } from "./audio";
import { GAME_DATA } from "./data";
import { Engine } from "./engine";
import { VoyageSession } from "./session";
export const CutsceneEngine: any = {
  activeCutscene: null,
  beatIndex: 0,
  returnFocus: null,

  trapFocus: (event) => {
    if (!CutsceneEngine.activeCutscene) return;
    if (event.type === "keydown" && event.key === "Tab") {
      event.preventDefault();
      DOM.cutsceneBtnA.focus();
    } else if (event.type === "focusin" && !DOM.cutsceneOverlay.contains(event.target)) {
      DOM.cutsceneBtnA.focus();
    }
  },

  showExploreHint: () => {
    const snap = VoyageSession.getSnapshot();
    const node = GAME_DATA.nodes[snap.dimId];
    DOM.tutorialCue.innerText = GAME_DATA.text.tutorialExplore(node.isHub, node.exploreCost);
    DOM.tutorialCue.hidden = false;
    DOM.btnExplore.classList.add(GAME_DATA.dom.classes.tutorialHighlight);
  },

  play: (cutsceneId) => {
    const cutscene = GAME_DATA.cutscenes[cutsceneId];
    if (!cutscene) return;

    CutsceneEngine.activeCutscene = cutscene;
    CutsceneEngine.beatIndex = 0;
    CutsceneEngine.returnFocus = document.activeElement;
    VoyageSession.markCutsceneSeen(cutsceneId);

    DOM.gameContainer.inert = true;
    DOM.cutsceneOverlay.hidden = false;
    Engine.transitionTo(GAME_DATA.phases.dialogue);
    CutsceneEngine.renderCurrentBeat();
    DOM.cutsceneBtnA.focus();
  },

  renderCurrentBeat: () => {
    const cutscene = CutsceneEngine.activeCutscene;
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

    // Corvus ignores the reply either way — the choice is pure flavour.
    DOM.cutsceneBtnA.innerText = `[A] "${beat.choiceA}"`;
    DOM.cutsceneBtnB.innerText = `[B] "${beat.choiceB}"`;
  },

  advance: () => {
    const cutscene = CutsceneEngine.activeCutscene;
    CutsceneEngine.beatIndex++;

    if (CutsceneEngine.beatIndex < cutscene.beats.length) {
      CutsceneEngine.renderCurrentBeat();
    } else {
      CutsceneEngine.close();
    }
  },

  close: () => {
    const cutscene = CutsceneEngine.activeCutscene;
    DOM.cutsceneOverlay.hidden = true;
    DOM.gameContainer.inert = false;

    if (cutscene?.logSummary) {
      Engine.log(cutscene.logSummary, GAME_DATA.dom.classes.logLore);
    }

    CutsceneEngine.activeCutscene = null;
    CutsceneEngine.beatIndex = 0;

    Engine.transitionTo(GAME_DATA.phases.idle);
    VoyageSession.evaluateSurvival();

    if (cutscene?.id === "wp1") CutsceneEngine.showExploreHint();

    const returnFocus = CutsceneEngine.returnFocus;
    const canRestoreFocus =
      returnFocus?.isConnected &&
      returnFocus !== document.body &&
      returnFocus !== document.documentElement &&
      !returnFocus.disabled &&
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
/* ========================================================
         TACTICAL GAME ENGINE (ORCHESTRATOR & UI ADAPTER)
         ======================================================== */
